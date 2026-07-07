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
  private gapiInitPromise: Promise<void> | null = null;
  // Registered by an in-flight signIn() so token-client failures (blocked or
  // closed popup, denied consent) settle it immediately instead of leaving it
  // to its 30s timeout
  private authFailureCallback: ((reason: string) => void) | null = null;
  // The access token is kept in memory only — persisting it (e.g. in
  // localStorage) would expose it to any script on the origin. Renewal goes
  // through the GIS token client with an empty prompt instead.
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private autoSyncInterval: any = null;
  private isSyncing: boolean = false;

  constructor(
    private indexedDbService: IndexedDbService
  ) {
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

    // Share one in-flight initialization: the eager call from the settings
    // page and a Connect click's signIn() can overlap, and running the init
    // sequence twice would create two token clients.
    if (!this.gapiInitPromise) {
      this.gapiInitPromise = this.doInitializeGapi().catch((error) => {
        this.gapiInitPromise = null; // allow the next caller to retry
        throw error;
      });
    }
    return this.gapiInitPromise;
  }

  private async doInitializeGapi(): Promise<void> {
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
                  this.authFailureCallback?.(response.error);
                  return;
                }
                this.handleTokenResponse(response);
              },
              // Non-OAuth failures (popup blocked/closed) never reach the
              // callback above — only this hook sees them
              error_callback: (error: any) => {
                console.error('Token client error:', error?.type || error);
                this.authFailureCallback?.(error?.type || 'unknown');
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

      // Request access token - use select_account for published apps to reduce friction
      // Use consent only for first-time users or when permissions change
      const isFirstTime = !localStorage.getItem('googleDriveHasConsented');

      // Set up the wait before opening the popup: a blocked popup fires
      // error_callback synchronously from requestAccessToken()
      const result = new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (success: boolean) => {
          if (done) return;
          done = true;
          this.authFailureCallback = null;
          resolve(success);
        };

        this.authFailureCallback = (reason: string) => {
          this.updateSyncStatus({
            error: reason === 'popup_failed_to_open'
              ? 'Sign-in popup was blocked by the browser'
              : reason === 'popup_closed'
                ? 'Sign-in was cancelled'
                : 'Authentication failed'
          });
          finish(false);
        };

        // Wait for the callback to set the access token
        const checkAuth = async () => {
          if (done) return;
          if (this.accessToken) {
            try {
              await this.ensureFolderExists();
              // Store authentication state
              this.storeAuthenticationState();
              finish(true);
            } catch (error) {
              console.error('Folder creation failed:', error);
              finish(false);
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
            finish(false);
          }
        }, 30000);
      });

      this.tokenClient.requestAccessToken({
        prompt: isFirstTime ? 'consent' : 'select_account',
        include_granted_scopes: true,
        enable_granular_consent: true // For published apps
      });

      if (isFirstTime) {
        localStorage.setItem('googleDriveHasConsented', 'true');
      }

      return result;
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

      // Uploads must be idempotent: the offline queue and the background sync can
      // both attempt the same photo, and a retry after a lost success response
      // must not create a second copy
      const existingFileId = await this.findExistingFileId(fileName);
      if (existingFileId) {
        return existingFileId;
      }

      const metadata = {
        name: fileName,
        parents: this.folderId ? [this.folderId] : undefined
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', photoBlob);

      const response = await this.makeAuthenticatedRequest(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          body: form
        }
      );

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
    const fileName = `dailyface_${photoId}_${timestamp.toISOString().split('T')[0]}.jpg`;
    const fileId = await this.uploadPhoto(photoBlob, fileName);

    // Mark as synced in local storage
    if (fileId) {
      try {
        await this.indexedDbService.updatePhotoSyncStatus(photoId, fileId, true);
      } catch (error) {
        // The upload succeeded — a bookkeeping failure (e.g. the photo was just
        // deleted locally) must not be reported as an upload failure, or the
        // caller will retry and duplicate the file
        console.warn('Photo uploaded but sync status update failed:', photoId, error);
      }
    }

    return fileId;
  }

  async deletePhoto(photoId: string, timestamp: Date, knownFileId?: string): Promise<boolean> {
    const fileName = `dailyface_${photoId}_${timestamp.toISOString().split('T')[0]}.jpg`;

    try {
      if (!await this.ensureValidToken()) {
        console.warn('Not authenticated with Google Drive');
        return false;
      }

      await this.ensureFolderExists();

      if (knownFileId) {
        await this.deleteDriveFile(knownFileId);
      }

      // Also delete any same-named copies (duplicates from earlier sync races),
      // scoped to the app folder so unrelated files can't be matched
      const response = await window.gapi.client.drive.files.list({
        q: `name='${this.escapeDriveQueryValue(fileName)}' and '${this.folderId}' in parents and trashed=false`,
        spaces: 'drive',
        fields: 'files(id)'
      });

      const files = response.result.files || [];
      for (const file of files) {
        await this.deleteDriveFile(file.id!);
      }

      console.log('Photo deleted from Google Drive:', fileName);
      return true;
    } catch (error) {
      console.error('Failed to delete photo from Google Drive:', error);
      return false;
    }
  }

  private async deleteDriveFile(fileId: string): Promise<void> {
    try {
      await window.gapi.client.drive.files.delete({ fileId });
    } catch (error: any) {
      // Already gone is success
      const status = error?.status ?? error?.result?.error?.code;
      if (status !== 404) {
        throw error;
      }
    }
  }

  private escapeDriveQueryValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private async findExistingFileId(fileName: string): Promise<string | null> {
    const response = await window.gapi.client.drive.files.list({
      q: `name='${this.escapeDriveQueryValue(fileName)}' and '${this.folderId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id)'
    });

    const files = response.result.files || [];
    return files.length > 0 ? files[0].id! : null;
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
      // No tokens here — only the fact that the user connected Drive and the
      // app folder id, so the next session can re-authorize silently via GIS
      const authData = {
        authenticated: true,
        folderId: this.folderId
      };
      localStorage.setItem('googleDriveAuthData', JSON.stringify(authData));

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
      const storedData = localStorage.getItem('googleDriveAuthData');
      const legacyFlag = localStorage.getItem('googleDriveAuthenticated') === 'true';

      if (!storedData && !legacyFlag) {
        return;
      }

      if (storedData) {
        try {
          const authData = JSON.parse(storedData);
          this.folderId = authData.folderId || null;
        } catch {
          // Pre-existing base64-encoded format (which contained tokens) — ignore;
          // it gets overwritten in the new format on the next successful sign-in
        }
      }

      // Tokens are never persisted, so get a fresh one silently through GIS
      await this.initializeGapi();
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        console.log('Silent re-authentication failed, user needs to reconnect');
        this.clearAuthenticationState();
        return;
      }

      await this.ensureFolderExists();
      this.updateSyncStatus({
        isAuthenticated: true,
        error: null
      });

      console.log('Authentication state restored successfully');
    } catch (error) {
      console.error('Failed to restore authentication state:', error);
      this.clearAuthenticationState();
    }
  }

  private clearAuthenticationState(): void {
    try {
      // Clear tokens from memory
      this.accessToken = null;
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
      
      // Store authentication state with client ID for background refresh
      this.storeAuthenticationState();
      
      this.updateSyncStatus({
        isAuthenticated: true,
        error: null
      });
      
      console.log('Token received, expires at:', this.tokenExpiresAt);

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
      await this.initializeGapi();
      
      if (!this.tokenClient) {
        throw new Error('Token client not initialized');
      }
      
      // Request a new token with minimal user interaction
      return new Promise((resolve) => {
        const originalCallback = this.tokenClient.callback;
        
        this.tokenClient.callback = (response: any) => {
          if (response.error) {
            console.error('Token refresh error:', response.error);
            resolve(false);
          } else {
            this.handleTokenResponse(response);
            resolve(true);
          }
          
          // Restore original callback
          this.tokenClient.callback = originalCallback;
        };
        
        this.tokenClient.requestAccessToken({ 
          prompt: '',  // Empty prompt for silent renewal
          include_granted_scopes: true
        });

        // Set timeout for token renewal
        setTimeout(() => {
          if (this.accessToken && !this.isTokenExpired()) {
            console.log('Token refreshed successfully');
            resolve(true);
          } else {
            console.log('Token refresh failed or timed out');
            resolve(false);
          }
        }, 10000); // 10 second timeout for interactive refresh
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
      const response = await this.makeAuthenticatedRequest(
        'https://www.googleapis.com/drive/v3/about?fields=user'
      );
      
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

  // Manual sync state, driven by the settings screen's "sync all" flow
  markManualSyncStarted(): void {
    this.updateSyncStatus({ isSyncing: true });
  }

  markManualSyncFinished(error: string | null = null): void {
    this.updateSyncStatus({
      isSyncing: false,
      lastSync: error ? this.syncStatusSubject.value.lastSync : new Date(),
      error
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
      // Get all files from the DailyFace.me folder, following pagination —
      // a single list request returns at most 1000 files
      await this.ensureFolderExists();

      const driveFiles: any[] = [];
      let pageToken: string | undefined;
      do {
        const response = await window.gapi.client.drive.files.list({
          q: `'${this.folderId}' in parents and name contains 'dailyface_' and trashed=false`,
          spaces: 'drive',
          pageSize: 1000,
          fields: 'nextPageToken, files(id,name,modifiedTime)',
          pageToken
        });
        driveFiles.push(...(response.result.files || []));
        pageToken = response.result.nextPageToken;
      } while (pageToken);

      console.log(`Found ${driveFiles.length} photos in Google Drive`);

      if (driveFiles.length === 0) {
        return { downloaded: 0, failed: 0 };
      }

      // Metadata only — the sync loop must not materialize every photo's bytes
      const localPhotos = await this.indexedDbService.getAllPhotoMeta();
      const localFileIds = new Set(localPhotos.map(p => p.googleDriveFileId).filter(id => id));
      const driveFileIds = new Set(driveFiles.map(f => f.id));

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
            // Never overwrite a local photo that hasn't been backed up yet, and
            // when both this file and the local photo's own Drive copy exist,
            // keep the local one — replacing would just ping-pong between copies
            const localCopyStillInDrive = existingPhoto.googleDriveFileId
              && driveFileIds.has(existingPhoto.googleDriveFileId);
            if (!existingPhoto.syncedToGoogleDrive || localCopyStillInDrive) {
              continue;
            }
          }

          // Download and save first — the conflicting local photo is only
          // removed once its replacement is safely stored
          const photoData = await this.downloadPhoto(file.id!);
          if (!photoData) {
            failed++;
            continue;
          }

          await this.indexedDbService.savePhoto(photoData, parsedInfo.photoId, parsedInfo.date);
          await this.indexedDbService.updatePhotoSyncStatus(parsedInfo.photoId, file.id!, true);
          if (existingPhoto && existingPhoto.id !== parsedInfo.photoId) {
            await this.indexedDbService.deletePhoto(existingPhoto.id);
          }

          // Keep the in-memory view current so a second Drive file for the same
          // date within this pass is handled as a conflict, not a fresh download
          localFileIds.add(file.id!);
          localPhotos.push({
            id: parsedInfo.photoId,
            timestamp: parsedInfo.date,
            googleDriveFileId: file.id!,
            syncedToGoogleDrive: true
          });

          downloaded++;
          console.log(`Downloaded photo for date ${dateString}`);
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
      const response = await this.makeAuthenticatedRequest(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      );

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

  // Enhanced error handling for API calls
  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    let response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`
      }
    });
    
    // If token expired, try to refresh and retry once. Only 401 means bad
    // credentials — 403 is also returned for rate limiting and quota, and
    // treating it as an auth failure signs the user out on a transient error
    if (response.status === 401) {
      console.log('Token expired, attempting refresh and retry');
      
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Retry the request with new token
        response = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`
          }
        });
      } else {
        // If refresh failed, clear auth state
        this.clearAuthenticationState();
        throw new Error('Authentication failed - please sign in again');
      }
    }
    
    return response;
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }
}
