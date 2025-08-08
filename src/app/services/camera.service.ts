import { Injectable } from '@angular/core';
import { IndexedDbService, PhotoRecord } from './indexed-db.service';
import { GoogleDriveService } from './google-drive.service';
import { OfflineQueueService } from './offline-queue.service';

export interface CameraPhoto {
  id: string;
  timestamp: Date;
  dataUrl?: string;
  data?: ArrayBuffer;
}

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  constructor(
    private indexedDbService: IndexedDbService,
    private googleDriveService: GoogleDriveService,
    private offlineQueueService: OfflineQueueService
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
            
            // Convert blob to ArrayBuffer for the return object too
            const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as ArrayBuffer);
              reader.onerror = () => reject(reader.error);
              reader.readAsArrayBuffer(blob);
            });

            const photo: CameraPhoto = {
              id,
              timestamp,
              data: arrayBuffer
            };
            
            // Queue for Google Drive sync if auto-sync is enabled
            if (this.googleDriveService.isAutoSyncEnabled()) {
              await this.offlineQueueService.queuePhotoUpload(blob, id, timestamp);
            }
            
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
        data: record.data
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
    
    if (photo.data) {
      return new Promise((resolve) => {
        const blob = this.indexedDbService.arrayBufferToBlob(photo.data!);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
    
    try {
      const photoRecord = await this.indexedDbService.getPhoto(photo.id);
      if (photoRecord?.data) {
        return new Promise((resolve) => {
          const blob = this.indexedDbService.arrayBufferToBlob(photoRecord.data);
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
      // Fallback for old blob data during migration
      else if (photoRecord?.blob) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(photoRecord.blob!);
        });
      }
    } catch (error) {
      console.error('Error getting photo data URL:', error);
    }
    
    return null;
  }

  async deletePhoto(photoId: string): Promise<void> {
    try {
      // Get photo info before deleting from local storage
      const photoRecord = await this.indexedDbService.getPhoto(photoId);
      
      // Delete from local storage
      await this.indexedDbService.deletePhoto(photoId);
      
      // Queue deletion for Google Drive if photo exists and user is connected
      // Note: We sync deletions regardless of auto-sync setting for data consistency
      if (photoRecord && this.googleDriveService.isAuthenticated()) {
        await this.offlineQueueService.queuePhotoDelete(photoId, photoRecord.timestamp);
        console.log(`Queued deletion of photo ${photoId} for Google Drive sync`);
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw error;
    }
  }

  async deleteAllPhotos(): Promise<void> {
    try {
      // Get all photos before deleting to queue Drive deletions
      let photosToDelete: PhotoRecord[] = [];
      if (this.googleDriveService.isAuthenticated()) {
        photosToDelete = await this.indexedDbService.getAllPhotos();
      }
      
      // Delete from local storage
      await this.indexedDbService.deleteAllPhotos();
      
      // Queue all photos for deletion from Google Drive if user is connected
      if (photosToDelete.length > 0 && this.googleDriveService.isAuthenticated()) {
        for (const photo of photosToDelete) {
          await this.offlineQueueService.queuePhotoDelete(photo.id, photo.timestamp);
        }
        console.log(`Queued ${photosToDelete.length} photos for Google Drive deletion`);
      }
    } catch (error) {
      console.error('Error deleting all photos:', error);
      throw error;
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
        if (photo.data) {
          const blob = this.indexedDbService.arrayBufferToBlob(photo.data);
          const fileId = await this.googleDriveService.syncPhoto(blob, photo.id, photo.timestamp);
          if (fileId) {
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
