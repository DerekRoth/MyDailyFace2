import { Injectable } from '@angular/core';
import { gapi } from 'gapi-script';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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
  private readonly FOLDER_NAME = 'MyDailyFace';
  
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

  constructor() {
    // Load auto-sync preference from localStorage
    const autoSyncEnabled = localStorage.getItem('googleDriveAutoSync') === 'true';
    this.updateSyncStatus({ isEnabled: autoSyncEnabled });
  }

  async initializeGapi(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.isConfigured()) {
      throw new Error('Google Drive API credentials not configured in environment');
    }

    try {
      await new Promise<void>((resolve, reject) => {
        gapi.load('client:auth2', async () => {
          try {
            await gapi.client.init({
              apiKey: this.config.apiKey,
              clientId: this.config.clientId,
              discoveryDocs: this.config.discoveryDocs,
              scope: this.config.scopes.join(' ')
            });
            
            this.isInitialized = true;
            this.updateAuthStatus();
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

  async signIn(): Promise<boolean> {
    try {
      await this.initializeGapi();
      const authInstance = gapi.auth2.getAuthInstance();
      const user = await authInstance.signIn();
      
      if (user.isSignedIn()) {
        await this.ensureFolderExists();
        this.updateAuthStatus();
        this.updateSyncStatus({ 
          isAuthenticated: true, 
          error: null 
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Sign-in failed:', error);
      this.updateSyncStatus({ error: 'Sign-in failed' });
      return false;
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.isInitialized) {
        const authInstance = gapi.auth2.getAuthInstance();
        await authInstance.signOut();
        this.updateAuthStatus();
      }
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
          'Authorization': `Bearer ${gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token}`
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

  async syncPhoto(photoBlob: Blob, photoId: string, timestamp: Date): Promise<boolean> {
    try {
      const fileName = `mydailyface_${photoId}_${timestamp.toISOString().split('T')[0]}.jpg`;
      const fileId = await this.uploadPhoto(photoBlob, fileName);
      return fileId !== null;
    } catch (error) {
      console.error('Photo sync failed:', error);
      return false;
    }
  }

  private async ensureFolderExists(): Promise<void> {
    if (this.folderId) return;

    try {
      // Check if folder already exists
      const response = await (gapi.client as any).drive.files.list({
        q: `name='${this.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        spaces: 'drive'
      });

      if (response.result.files && response.result.files.length > 0) {
        this.folderId = response.result.files[0].id!;
      } else {
        // Create the folder
        const folderResponse = await (gapi.client as any).drive.files.create({
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

  private updateAuthStatus(): void {
    if (!this.isInitialized) return;
    
    const authInstance = gapi.auth2.getAuthInstance();
    const isSignedIn = authInstance.isSignedIn.get();
    
    this.updateSyncStatus({ isAuthenticated: isSignedIn });
  }

  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    const currentStatus = this.syncStatusSubject.value;
    this.syncStatusSubject.next({
      ...currentStatus,
      ...updates
    });
  }

  isAuthenticated(): boolean {
    return this.syncStatusSubject.value.isAuthenticated;
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
}