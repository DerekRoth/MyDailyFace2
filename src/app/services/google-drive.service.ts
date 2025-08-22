import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { environment } from '../../environments/environment';
import { IndexedDbService } from './indexed-db.service';

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  discoveryDocs: string[];
  scopes: string[];
}

export interface SyncStatus {
  isAuthenticated: boolean;
  isEnabled: boolean;
  lastSync: Date | null;
  totalPhotos: number;
  syncedPhotos: number;
  downloadedPhotos: number;
  isSyncing: boolean;
  error: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleDriveService {
  private readonly DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
  private readonly SCOPES = 'https://www.googleapis.com/auth/drive.file';
  private readonly FOLDER_NAME = 'DailyFace.me';

  private readonly config: GoogleDriveConfig = {
    clientId: environment.googleDrive.clientId,
    apiKey: environment.googleDrive.apiKey,
    discoveryDocs: [this.DISCOVERY_DOC],
    scopes: [this.SCOPES]
  };

  private syncStatusSubject = new BehaviorSubject<SyncStatus>({
    isAuthenticated: false,
    isEnabled: false,
    lastSync: null,
    totalPhotos: 0,
    syncedPhotos: 0,
    downloadedPhotos: 0,
    isSyncing: false,
    error: null
  });

  public syncStatus$ = this.syncStatusSubject.asObservable();
  private isInitialized = false;
  private folderId: string | null = null;
  private tokenClient: any = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private autoSyncInterval: any = null;
  private isSyncing: boolean = false;

  constructor(private indexedDbService: IndexedDbService) {
    // Load auto-sync preference from localStorage
    const autoSyncEnabled = localStorage.getItem('googleDriveAutoSync') === 'true';
    this.updateSyncStatus({ isEnabled: autoSyncEnabled });

    // Try to restore authentication state
    this.restoreAuthenticationState();

    // Start monitoring connection and sync when available
    this.startAutoSync();
  }

  async initializeGapi(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.isConfigured()) {
      throw new Error('Google Drive API credentials not configured in environment');
    }

    try {
      // Wait for Google APIs to load
      await this.waitForGoogleAPIs();

      // Initialize the Google API client
      await new Promise<void>((resolve, reject) => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({
              apiKey: this.config.apiKey,
              discoveryDocs: this.config.discoveryDocs
            });

            // Initialize the Google Identity Services token client
            this.tokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: this.config.clientId,
              scope: this.config.scopes.join(' '),
              callback: (response: any) => {
                if (response.error) {
                  console.error('Token client error:', response.error);
                  this.updateSyncStatus({ error: 'Authentication failed' });
                  return;
                }
                this.handleTokenResponse(response);
              }
            });

            this.isInitialized = true;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('Failed to initialize Google API:', error);
      this.updateSyncStatus({ error: 'Failed to initialize Google Drive API' });
      throw error;
    }
  }

  private waitForGoogleAPIs(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Google APIs failed to load'));
      }, 10000);

      const checkAPIs = () => {
        if (window.google && window.gapi) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkAPIs, 100);
        }
      };

      checkAPIs();
    });
  }

  async signIn(): Promise<boolean> {
    try {
      await this.initializeGapi();

      if (!this.tokenClient) {
        throw new Error('Token client not initialized');
      }

      // Request access token with offline access for refresh token
      this.tokenClient.requestAccessToken({ 
        prompt: 'consent',
        include_granted_scopes: true
      });

      // Wait for the callback to set the access token
      return new Promise((resolve) => {
        const checkAuth = async () => {
          if (this.accessToken) {
            try {
              await this.ensureFolderExists();
              // Store authentication state
              this.storeAuthenticationState();
              resolve(true);
            } catch (error) {
              console.error('Folder creation failed:', error);
              resolve(false);
            }
          } else {
            setTimeout(checkAuth, 100);
          }
        };

        // Start checking after a short delay
        setTimeout(checkAuth, 100);

        // Timeout after 30 seconds
        setTimeout(() => {
          if (!this.accessToken) {
            this.updateSyncStatus({ error: 'Authentication timeout' });
            resolve(false);
          }
        }, 30000);
      });
    } catch (error) {
      console.error('Sign-in failed:', error);
      this.updateSyncStatus({ error: 'Sign-in failed' });
      return false;
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.accessToken && window.google) {
        window.google.accounts.oauth2.revoke(this.accessToken);
      }
      this.accessToken = null;
      this.folderId = null;
      // Clear stored authentication state
      this.clearAuthenticationState();
      this.updateSyncStatus({
        isAuthenticated: false,
        error: null
      });
    } catch (error) {
      console.error('Sign-out failed:', error);
    }
  }

  async uploadPhoto(photoBlob: Blob, fileName: string): Promise<string | null> {
    try {
      if (!await this.ensureValidToken()) {
        throw new Error('Not authenticated with Google Drive');
      }

      await this.ensureFolderExists();

      const metadata = {
        name: fileName,
        parents: this.folderId ? [this.folderId] : undefined
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', photoBlob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: form
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.id;
    } catch (error) {
      console.error('Photo upload failed:', error);
      this.updateSyncStatus({ error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
      return null;
    }
  }

  async syncPhoto(photoBlob: Blob, photoId: string, timestamp: Date): Promise<string | null> {
    try {
      const fileName = `dailyface_${photoId}_${timestamp.toISOString().split('T')[0]}.jpg`;
      const fileId = await this.uploadPhoto(photoBlob, fileName);

      // Mark as synced in local storage
      if (fileId) {
        await this.indexedDbService.updatePhotoSyncStatus(photoId, fileId, true);
      }

      return fileId;
    } catch (error) {
      console.error('Photo sync failed:', error);
      return null;
    }
  }

  async deletePhoto(photoId: string, timestamp: Date): Promise<boolean> {
    // Define fileName at function scope so it's available in catch block
    const fileName = `dailyface_${photoId}_${timestamp.toISOString().split('T')[0]}.jpg`;
    
    try {
      if (!await this.ensureValidToken()) {
        console.warn('Not authenticated with Google Drive');
        return false;
      }

      const response = await window.gapi.client.drive.files.list({
        q: `name='${fileName}' and trashed=false`,
        spaces: 'drive'
      });

      if (response.result.files && response.result.files.length > 0) {
        const fileId = response.result.files[0].id;

        // Delete the file
        await window.gapi.client.drive.files.delete({
          fileId: fileId
        });

        console.log('Photo deleted from Google Drive:', fileName);
        return true;
      } else {
        console.warn('Photo not found in Google Drive:', fileName);
        // Return true even if not found - it's effectively deleted
        return true;
      }
    } catch (error) {
      console.error('Failed to delete photo from Google Drive:', error);
      // Check if it's a specific error type we can handle
      if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('not found')) {
          // File already deleted or doesn't exist
          console.log('Photo already deleted or not found in Google Drive:', fileName);
          return true;
        }
      }
      return false;
    }
  }

  private async ensureFolderExists(): Promise<void> {
    if (this.folderId) return;

    try {
      // Check if folder already exists
      const response = await window.gapi.client.drive.files.list({
        q: `name='${this.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        spaces: 'drive'
      });

      if (response.result.files && response.result.files.length > 0) {
        this.folderId = response.result.files[0].id!;
      } else {
        // Create the folder
        const folderResponse = await window.gapi.client.drive.files.create({
          resource: {
            name: this.FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
          }
        });
        this.folderId = folderResponse.result.id!;
      }
    } catch (error) {
      console.error('Failed to ensure folder exists:', error);
      throw error;
    }
  }


  private storeAuthenticationState(): void {
    try {
      const authData = {
        authenticated: true,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.tokenExpiresAt?.toISOString(),
        folderId: this.folderId
      };
      
      // Simple encoding to obscure tokens in localStorage (not cryptographic security)
      const encoded = btoa(JSON.stringify(authData));
      localStorage.setItem('googleDriveAuthData', encoded);
      
      // Keep legacy flag for compatibility
      localStorage.setItem('googleDriveAuthenticated', 'true');
      if (this.folderId) {
        localStorage.setItem('googleDriveFolderId', this.folderId);
      }
    } catch (error) {
      console.error('Failed to store authentication state:', error);
    }
  }

  private async restoreAuthenticationState(): Promise<void> {
    try {
      const encodedData = localStorage.getItem('googleDriveAuthData');
      
      if (encodedData) {
        try {
          const authData = JSON.parse(atob(encodedData));
          this.accessToken = authData.accessToken;
          this.refreshToken = authData.refreshToken;
          this.tokenExpiresAt = authData.expiresAt ? new Date(authData.expiresAt) : null;
          this.folderId = authData.folderId;
          
          // Check if token is still valid or can be refreshed
          if (this.isTokenExpired()) {
            console.log('Stored token expired, attempting refresh');
            const refreshed = await this.refreshAccessToken();
            if (!refreshed) {
              console.log('Token refresh failed, clearing auth state');
              this.clearAuthenticationState();
              return;
            }
          }
          
          // Validate the token by testing API access
          await this.initializeGapi();
          await this.ensureFolderExists();
          
          this.updateSyncStatus({ 
            isAuthenticated: true,
            error: null 
          });
          
          console.log('Authentication state restored successfully');
          
        } catch (parseError) {
          console.error('Failed to parse stored auth data:', parseError);
          this.clearAuthenticationState();
        }
      } else {
        // Fallback to legacy authentication check
        const isAuthenticated = localStorage.getItem('googleDriveAuthenticated') === 'true';
        if (isAuthenticated) {
          console.log('Legacy auth flag found, attempting silent sign-in');
          await this.attemptSilentSignIn();
        }
      }
    } catch (error) {
      console.error('Failed to restore authentication state:', error);
      this.clearAuthenticationState();
    }
  }

  private async attemptSilentSignIn(): Promise<boolean> {
    try {
      await this.initializeGapi();
      
      // If we have a refresh token, try to use it
      if (this.refreshToken) {
        console.log('Attempting token refresh with stored refresh token');
        return await this.refreshAccessToken();
      }
      
      // If no refresh token, we can't do silent auth with Google Identity Services
      // The user will need to sign in again
      console.log('No refresh token available, silent authentication not possible');
      this.clearAuthenticationState();
      return false;
      
    } catch (error) {
      console.error('Silent sign-in failed:', error);
      this.clearAuthenticationState();
      return false;
    }
  }

  private clearAuthenticationState(): void {
    try {
      // Clear tokens from memory
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenExpiresAt = null;
      this.folderId = null;
      
      // Clear localStorage
      localStorage.removeItem('googleDriveAuthData');
      localStorage.removeItem('googleDriveAuthenticated');
      localStorage.removeItem('googleDriveFolderId');
      localStorage.removeItem('googleDriveUserEmail');
      
      // Update sync status
      this.updateSyncStatus({
        isAuthenticated: false,
        error: null
      });
    } catch (error) {
      console.error('Failed to clear authentication state:', error);
    }
  }

  private handleTokenResponse(response: any): void {
    try {
      this.accessToken = response.access_token;
      
      // Google Identity Services doesn't provide refresh tokens directly
      // We'll store the access token and set a reasonable expiration
      const expiresIn = response.expires_in || 3600; // Default 1 hour
      this.tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000));
      
      // Store authentication state
      this.storeAuthenticationState();
      
      this.updateSyncStatus({
        isAuthenticated: true,
        error: null
      });
      
      console.log('Token received and stored, expires at:', this.tokenExpiresAt);
      
      // Trigger automatic sync when authenticated
      this.triggerBackgroundSync();
      
    } catch (error) {
      console.error('Failed to handle token response:', error);
      this.updateSyncStatus({ error: 'Failed to process authentication' });
    }
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiresAt || !this.accessToken) {
      return true;
    }
    
    // Consider token expired 5 minutes before actual expiration
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() > (this.tokenExpiresAt.getTime() - bufferTime);
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      // With Google Identity Services (GIS), refresh tokens aren't directly supported
      // The recommended approach is to request a new token silently
      await this.initializeGapi();
      
      if (!this.tokenClient) {
        throw new Error('Token client not initialized');
      }
      
      // Request a new token silently if user was previously authenticated
      return new Promise((resolve) => {
        this.tokenClient.requestAccessToken({ 
          prompt: '',  // Empty prompt for silent renewal
          include_granted_scopes: true
        });

        // Set timeout for silent token renewal
        setTimeout(() => {
          if (this.accessToken && !this.isTokenExpired()) {
            console.log('Token refreshed successfully');
            resolve(true);
          } else {
            console.log('Token refresh failed or timed out');
            resolve(false);
          }
        }, 5000); // 5 second timeout
      });
      
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  private async validateToken(): Promise<boolean> {
    if (!this.accessToken || this.isTokenExpired()) {
      return false;
    }
    
    try {
      // Test the token by making a simple API call
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  private async ensureValidToken(): Promise<boolean> {
    // Check if current token is valid
    if (this.accessToken && !this.isTokenExpired()) {
      const isValid = await this.validateToken();
      if (isValid) {
        return true;
      }
    }
    
    // Try to refresh the token
    console.log('Token invalid or expired, attempting refresh');
    const refreshed = await this.refreshAccessToken();
    
    if (!refreshed) {
      console.log('Token refresh failed, clearing authentication');
      this.clearAuthenticationState();
      return false;
    }
    
    return true;
  }

  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    const currentStatus = this.syncStatusSubject.value;
    this.syncStatusSubject.next({
      ...currentStatus,
      ...updates
    });
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired() && this.syncStatusSubject.value.isAuthenticated;
  }

  isConfigured(): boolean {
    return !!(this.config.clientId && this.config.apiKey &&
             this.config.clientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE' &&
             this.config.apiKey !== 'YOUR_GOOGLE_API_KEY_HERE');
  }

  enableAutoSync(enabled: boolean): void {
    this.updateSyncStatus({ isEnabled: enabled });
    localStorage.setItem('googleDriveAutoSync', enabled.toString());
  }

  isAutoSyncEnabled(): boolean {
    const stored = localStorage.getItem('googleDriveAutoSync');
    return stored === 'true';
  }

  getCurrentStatus(): SyncStatus {
    return this.syncStatusSubject.value;
  }

  private startAutoSync(): void {
    // Check for unsynced photos every 30 seconds
    this.autoSyncInterval = setInterval(() => {
      this.triggerBackgroundSync();
    }, 30000);
  }

  private async triggerBackgroundSync(): Promise<void> {
    // Prevent multiple simultaneous syncs
    if (this.isSyncing) return;

    const syncStatus = this.getCurrentStatus();

    // Only sync if enabled, online, and have valid token
    if (!syncStatus.isEnabled || !navigator.onLine) {
      return;
    }

    // Ensure we have a valid token before syncing
    if (!await this.ensureValidToken()) {
      console.log('Cannot sync: invalid or expired authentication');
      return;
    }

    this.isSyncing = true;
    this.updateSyncStatus({ isSyncing: true });

    try {
      // Phase 1: Download missing photos from Google Drive
      const downloadResult = await this.downloadMissingPhotos();
      
      // Phase 2: Upload new local photos to Google Drive
      const uploadResult = await this.uploadUnsyncedPhotos();

      console.log(`Bidirectional sync completed:`, {
        downloaded: downloadResult.downloaded,
        downloadFailed: downloadResult.failed,
        uploaded: uploadResult.uploaded, 
        uploadFailed: uploadResult.failed
      });

      const totalFailed = downloadResult.failed + uploadResult.failed;
      this.updateSyncStatus({
        isSyncing: false,
        lastSync: new Date(),
        syncedPhotos: this.syncStatusSubject.value.syncedPhotos + uploadResult.uploaded,
        downloadedPhotos: this.syncStatusSubject.value.downloadedPhotos + downloadResult.downloaded,
        error: totalFailed > 0 ? `${totalFailed} photos failed to sync` : null
      });

    } catch (error) {
      console.error('Background sync error:', error);
      this.updateSyncStatus({
        isSyncing: false,
        error: 'Background sync failed'
      });
    } finally {
      this.isSyncing = false;
    }
  }

  private async uploadUnsyncedPhotos(): Promise<{uploaded: number, failed: number}> {
    const unsyncedPhotos = await this.indexedDbService.getUnsyncedPhotos();
    
    if (unsyncedPhotos.length === 0) {
      return { uploaded: 0, failed: 0 };
    }

    let uploaded = 0;
    let failed = 0;

    for (const photo of unsyncedPhotos) {
      try {
        const blob = photo.data ? this.indexedDbService.arrayBufferToBlob(photo.data) : null;
        if (!blob) {
          failed++;
          continue;
        }
        const fileId = await this.syncPhoto(blob, photo.id, photo.timestamp);
        if (fileId) {
          uploaded++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error('Failed to sync photo:', photo.id, error);
        failed++;
      }
    }

    return { uploaded, failed };
  }

  async forceSync(): Promise<void> {
    await this.triggerBackgroundSync();
  }

  private async downloadMissingPhotos(): Promise<{downloaded: number, failed: number}> {
    try {
      // Get all files from the DailyFace.me folder
      await this.ensureFolderExists();
      
      const response = await window.gapi.client.drive.files.list({
        q: `'${this.folderId}' in parents and name contains 'dailyface_' and trashed=false`,
        spaces: 'drive',
        pageSize: 1000,
        fields: 'files(id,name,modifiedTime)'
      });

      const driveFiles = response.result.files || [];
      console.log(`Found ${driveFiles.length} photos in Google Drive`);
      
      if (driveFiles.length === 0) {
        return { downloaded: 0, failed: 0 };
      }

      // Get all local photos
      const localPhotos = await this.indexedDbService.getAllPhotos();
      const localFileIds = new Set(localPhotos.map(p => p.googleDriveFileId).filter(id => id));
      const localDates = new Set(localPhotos.map(p => this.formatDateForFilename(p.timestamp)));

      let downloaded = 0;
      let failed = 0;

      for (const file of driveFiles) {
        try {
          // Skip if we already have this file
          if (localFileIds.has(file.id!)) {
            continue;
          }

          // Parse date and photoId from filename
          const parsedInfo = this.parseFilename(file.name!);
          if (!parsedInfo) {
            console.warn('Could not parse filename:', file.name);
            failed++;
            continue;
          }

          // Check for date conflicts (same date, different file)
          const dateString = this.formatDateForFilename(parsedInfo.date);
          const existingPhoto = localPhotos.find(p => this.formatDateForFilename(p.timestamp) === dateString);
          
          if (existingPhoto) {
            // Conflict resolution: Google Drive version takes precedence
            console.log(`Date conflict detected for ${dateString}, replacing local photo with Drive version`);
            await this.indexedDbService.deletePhoto(existingPhoto.id);
          }

          // Download and save the photo
          const photoData = await this.downloadPhoto(file.id!);
          if (photoData) {
            await this.indexedDbService.savePhoto(photoData, parsedInfo.photoId, parsedInfo.date);
            await this.indexedDbService.updatePhotoSyncStatus(parsedInfo.photoId, file.id!, true);
            downloaded++;
            console.log(`Downloaded photo for date ${dateString}`);
          } else {
            failed++;
          }

        } catch (error) {
          console.error('Failed to download photo:', file.name, error);
          failed++;
        }
      }

      return { downloaded, failed };
    } catch (error) {
      console.error('Failed to list or download photos from Google Drive:', error);
      throw error;
    }
  }

  private async downloadPhoto(fileId: string): Promise<Blob | null> {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Photo download failed:', error);
      return null;
    }
  }

  private parseFilename(filename: string): {photoId: string, date: Date} | null {
    // Expected format: dailyface_{photoId}_{YYYY-MM-DD}.jpg
    const match = filename.match(/^dailyface_(.+)_(\d{4}-\d{2}-\d{2})\.jpg$/);
    if (!match) return null;

    const [, photoId, dateString] = match;
    const date = new Date(dateString + 'T12:00:00'); // Set to noon to avoid timezone issues
    
    if (isNaN(date.getTime())) return null;

    return { photoId, date };
  }

  private formatDateForFilename(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }
}
