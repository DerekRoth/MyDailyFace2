import { Injectable } from '@angular/core';
import { IndexedDbService } from './indexed-db.service';
import { GoogleDriveService } from './google-drive.service';
import { OfflineQueueService } from './offline-queue.service';

export interface CameraPhoto {
  id: string;
  timestamp: Date;
  dataUrl?: string;
  data?: ArrayBuffer;
  thumbnail?: string;
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

      // Small thumbnail for the gallery grid, generated while we have the frame
      const thumbnail = this.renderThumbnail(canvas);

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
            await this.indexedDbService.savePhoto(blob, id, timestamp, thumbnail ?? undefined);
            
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
              await this.offlineQueueService.queuePhotoUpload(id, timestamp);
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

  // (There is intentionally no "load all photos with bytes" API — with years of
  // daily photos that materializes hundreds of MB. Use getPhotoIndex + on-demand
  // getPhotoDataUrl instead.)

  // Metadata + thumbnails only, newest first. Use this for lists;
  // getPhotoDataUrl fetches full resolution on demand by id.
  async getPhotoIndex(): Promise<CameraPhoto[]> {
    try {
      const metas = await this.indexedDbService.getAllPhotoMeta();
      return metas
        .map(meta => ({
          id: meta.id,
          timestamp: meta.timestamp,
          thumbnail: meta.thumbnail
        }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Error getting photo index:', error);
      return [];
    }
  }

  // Returns the stored thumbnail, generating and persisting one for photos
  // taken before thumbnails existed
  async getOrCreateThumbnail(photo: CameraPhoto): Promise<string | null> {
    if (photo.thumbnail) {
      return photo.thumbnail;
    }

    try {
      const record = await this.indexedDbService.getPhoto(photo.id);
      if (!record) return null;
      if (record.thumbnail) return record.thumbnail;
      if (!record.data) return null;

      const thumbnail = await this.generateThumbnailFromData(record.data);
      if (thumbnail) {
        await this.indexedDbService.updatePhotoThumbnail(photo.id, thumbnail);
      }
      return thumbnail;
    } catch (error) {
      console.error('Error creating thumbnail for photo:', photo.id, error);
      return null;
    }
  }

  private readonly THUMBNAIL_MAX_SIZE = 320;

  private renderThumbnail(source: HTMLCanvasElement | HTMLImageElement): string | null {
    try {
      const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
      const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
      if (!width || !height) return null;

      const scale = Math.min(1, this.THUMBNAIL_MAX_SIZE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (error) {
      console.error('Error rendering thumbnail:', error);
      return null;
    }
  }

  private generateThumbnailFromData(data: ArrayBuffer): Promise<string | null> {
    return new Promise((resolve) => {
      const blob = this.indexedDbService.arrayBufferToBlob(data);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(this.renderThumbnail(img));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  async getLatestPhoto(): Promise<CameraPhoto | null> {
    try {
      const record = await this.indexedDbService.getLatestPhoto();
      return record ? { id: record.id, timestamp: record.timestamp, data: record.data } : null;
    } catch (error) {
      console.error('Error getting latest photo:', error);
      return null;
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

      // Queue the Drive deletion whenever a Drive copy exists or may be created.
      // This must not depend on being authenticated right now — the token expires
      // hourly, and a deletion skipped here would resurrect on the next sync
      if (photoRecord && (photoRecord.googleDriveFileId || this.googleDriveService.isAutoSyncEnabled())) {
        await this.offlineQueueService.queuePhotoDelete(
          photoId, photoRecord.timestamp, photoRecord.googleDriveFileId || undefined
        );
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
      const photosToDelete = await this.indexedDbService.getAllPhotoMeta();

      // Delete from local storage
      await this.indexedDbService.deleteAllPhotos();

      // Queue Drive deletions regardless of the current auth state (see deletePhoto)
      const autoSync = this.googleDriveService.isAutoSyncEnabled();
      let queued = 0;
      for (const photo of photosToDelete) {
        if (photo.googleDriveFileId || autoSync) {
          await this.offlineQueueService.queuePhotoDelete(
            photo.id, photo.timestamp, photo.googleDriveFileId || undefined
          );
          queued++;
        }
      }
      if (queued > 0) {
        console.log(`Queued ${queued} photos for Google Drive deletion`);
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

    // Only photos that aren't backed up yet — re-uploading synced photos would
    // duplicate the whole library in Drive
    const photos = await this.indexedDbService.getUnsyncedPhotos();
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
