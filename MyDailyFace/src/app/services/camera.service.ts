import { Injectable } from '@angular/core';
import { IndexedDbService, PhotoRecord } from './indexed-db.service';

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
  constructor(private indexedDbService: IndexedDbService) { }

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

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
