import { Injectable } from '@angular/core';
import { IndexedDbService, PhotoRecord } from './indexed-db.service';
import { GoogleDriveService } from './google-drive.service';

export interface CameraPhoto {
  id: string;
  timestamp: Date;
  dataUrl?: string;
  blob?: Blob;
}

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  constructor(
    private indexedDbService: IndexedDbService,
    private googleDriveService: GoogleDriveService
  ) { }

  async takePictureFromVideo(videoElement: HTMLVideoElement): Promise<CameraPhoto | null> {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Unable to get canvas context');
      }

      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      
      // Draw the video frame normally (not mirrored) for the saved photo
      context.drawImage(videoElement, 0, 0);
      
      // Convert to blob for IndexedDB storage
      return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }

          const id = this.generateId();
          const timestamp = new Date();
          
          // Save to IndexedDB
          try {
            await this.indexedDbService.savePhoto(blob, id, timestamp);
            
            const photo: CameraPhoto = {
              id,
              timestamp,
              blob
            };
            
            // Auto-sync to Google Drive if enabled
            await this.autoSyncPhoto(photo);
            
            resolve(photo);
          } catch (error) {
            console.error('Error saving photo to IndexedDB:', error);
            resolve(null);
          }
        }, 'image/jpeg', 0.8);
      });
    } catch (error) {
      console.error('Error taking picture:', error);
      return null;
    }
  }

  async getStoredPhotos(): Promise<CameraPhoto[]> {
    try {
      const photoRecords = await this.indexedDbService.getAllPhotos();
      return photoRecords.map(record => ({
        id: record.id,
        timestamp: record.timestamp,
        blob: record.blob
      }));
    } catch (error) {
      console.error('Error getting stored photos:', error);
      return [];
    }
  }

  async getPhotoDataUrl(photo: CameraPhoto): Promise<string | null> {
    if (photo.dataUrl) {
      return photo.dataUrl;
    }
    
    if (photo.blob) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(photo.blob!);
      });
    }
    
    try {
      const photoRecord = await this.indexedDbService.getPhoto(photo.id);
      if (photoRecord?.blob) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(photoRecord.blob);
        });
      }
    } catch (error) {
      console.error('Error getting photo data URL:', error);
    }
    
    return null;
  }

  async deletePhoto(photoId: string): Promise<void> {
    try {
      await this.indexedDbService.deletePhoto(photoId);
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  }

  async deleteAllPhotos(): Promise<void> {
    try {
      await this.indexedDbService.deleteAllPhotos();
    } catch (error) {
      console.error('Error deleting all photos:', error);
    }
  }

  async getPhotoCount(): Promise<number> {
    try {
      return await this.indexedDbService.getPhotoCount();
    } catch (error) {
      console.error('Error getting photo count:', error);
      return 0;
    }
  }

  private async autoSyncPhoto(photo: CameraPhoto): Promise<void> {
    try {
      const syncStatus = this.googleDriveService.getCurrentStatus();
      
      // Check if auto-sync is enabled and user is authenticated
      if (!syncStatus.isEnabled || !syncStatus.isAuthenticated || !photo.blob) {
        return;
      }

      // Sync the photo in the background
      const success = await this.googleDriveService.syncPhoto(photo.blob, photo.id, photo.timestamp);
      
      if (success) {
        console.log('Photo automatically synced to Google Drive:', photo.id);
      } else {
        console.warn('Failed to auto-sync photo to Google Drive:', photo.id);
      }
    } catch (error) {
      console.error('Error during auto-sync:', error);
    }
  }

  async syncAllPhotosToGoogleDrive(): Promise<{ success: number; failed: number }> {
    const syncStatus = this.googleDriveService.getCurrentStatus();
    
    if (!syncStatus.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    const photos = await this.getStoredPhotos();
    let success = 0;
    let failed = 0;

    for (const photo of photos) {
      try {
        if (photo.blob) {
          const syncSuccess = await this.googleDriveService.syncPhoto(photo.blob, photo.id, photo.timestamp);
          if (syncSuccess) {
            success++;
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      } catch (error) {
        console.error('Error syncing photo:', photo.id, error);
        failed++;
      }
    }

    return { success, failed };
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
