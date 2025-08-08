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
    isSyncing: false,
    error: null
  });

  public syncStatus$ = this.syncStatusSubject.asObservable();
  private isInitialized = false;
  private folderId: string | null = null;
  private tokenClient: any = null;
  private accessToken: string | null = null;
  private autoSyncInterval: any = null;
  private isSyncing: boolean = false;

  constructor(private indexedDbService: IndexedDbService) {
    // Load auto-sync preference from localStorage
    const autoSyncEnabled = localStorage.getItem('googleDriveAutoSync') === 'true';
    this.updateSyncStatus({ isEnabled: autoSyncEnabled });

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
                this.accessToken = response.access_token;
                this.updateSyncStatus({
                  isAuthenticated: true,
                  error: null
                });
                // Trigger automatic sync when authenticated
                this.triggerBackgroundSync();
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

      // Request access token
      this.tokenClient.requestAccessToken({ prompt: 'consent' });

      // Wait for the callback to set the access token
      return new Promise((resolve) => {
        const checkAuth = async () => {
          if (this.accessToken) {
            try {
              await this.ensureFolderExists();
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
      if (!this.isAuthenticated()) {
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
    try {
      if (!this.isAuthenticated()) {
        console.warn('Not authenticated with Google Drive');
        return false;
      }

      // Find the file by searching for the specific filename pattern
      const fileName = `dailyface_${photoId}_${timestamp.toISOString().split('T')[0]}.jpg`;

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
        return false;
      }
    } catch (error) {
      console.error('Failed to delete photo from Google Drive:', error);
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


  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    const currentStatus = this.syncStatusSubject.value;
    this.syncStatusSubject.next({
      ...currentStatus,
      ...updates
    });
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && this.syncStatusSubject.value.isAuthenticated;
  }

  isConfigured(): boolean {
    const configured = !!(this.config.clientId && this.config.apiKey &&
             this.config.clientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE' &&
             this.config.apiKey !== 'YOUR_GOOGLE_API_KEY_HERE');
    
    // Debug logging for production troubleshooting
    if (!configured) {
      console.log('🔍 Google Drive not configured:', {
        hasClientId: !!this.config.clientId,
        hasApiKey: !!this.config.apiKey,
        clientId: this.config.clientId?.substring(0, 20) + '...',
        apiKey: this.config.apiKey?.substring(0, 20) + '...',
        isPlaceholderClientId: this.config.clientId === 'YOUR_GOOGLE_CLIENT_ID_HERE',
        isPlaceholderApiKey: this.config.apiKey === 'YOUR_GOOGLE_API_KEY_HERE'
      });
    }
    
    return configured;
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

    // Only sync if enabled, authenticated, and online
    if (!syncStatus.isEnabled || !syncStatus.isAuthenticated || !navigator.onLine) {
      return;
    }

    this.isSyncing = true;
    this.updateSyncStatus({ isSyncing: true });

    try {
      const unsyncedPhotos = await this.indexedDbService.getUnsyncedPhotos();

      if (unsyncedPhotos.length === 0) {
        this.updateSyncStatus({
          isSyncing: false,
          lastSync: new Date()
        });
        this.isSyncing = false;
        return;
      }

      let syncedCount = 0;
      let failedCount = 0;

      for (const photo of unsyncedPhotos) {
        try {
          const blob = photo.data ? this.indexedDbService.arrayBufferToBlob(photo.data) : null;
          if (!blob) {
            failedCount++;
            continue;
          }
          const fileId = await this.syncPhoto(blob, photo.id, photo.timestamp);
          if (fileId) {
            syncedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error('Failed to sync photo:', photo.id, error);
          failedCount++;
        }
      }

      console.log(`Background sync completed: ${syncedCount} synced, ${failedCount} failed`);

      this.updateSyncStatus({
        isSyncing: false,
        lastSync: new Date(),
        syncedPhotos: this.syncStatusSubject.value.syncedPhotos + syncedCount,
        error: failedCount > 0 ? `${failedCount} photos failed to sync` : null
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

  async forceSync(): Promise<void> {
    await this.triggerBackgroundSync();
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }
}
