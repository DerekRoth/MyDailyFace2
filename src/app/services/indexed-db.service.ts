import { Injectable } from '@angular/core';

export interface PhotoRecord {
  id: string;
  data: ArrayBuffer;
  timestamp: Date;
  thumbnail?: string;
  googleDriveFileId?: string;
  syncedToGoogleDrive?: boolean;
  // For backward compatibility during migration
  blob?: Blob;
}

@Injectable({
  providedIn: 'root'
})
export class IndexedDbService {
  private dbName = 'MyDailyFaceDB';
  private dbVersion = 2;
  private storeName = 'photos';
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Migration from version 1 to 2: Convert blobs to ArrayBuffers
        if (oldVersion < 2) {
          this.migrateToArrayBuffer(event);
        }
      };
    });
  }

  async savePhoto(photoBlob: Blob, id: string, timestamp: Date): Promise<void> {
    await this.ensureDBReady();
    
    // Convert Blob to ArrayBuffer for iOS Safari compatibility
    const arrayBuffer = await this.blobToArrayBuffer(photoBlob);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const photoRecord: PhotoRecord = {
        id,
        data: arrayBuffer,
        timestamp
      };
      
      const request = store.put(photoRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPhoto(id: string): Promise<PhotoRecord | null> {
    await this.ensureDBReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPhotos(): Promise<PhotoRecord[]> {
    await this.ensureDBReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      const request = index.getAll();
      
      request.onsuccess = () => {
        // Sort by timestamp descending (newest first)
        const photos = request.result.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        resolve(photos);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deletePhoto(id: string): Promise<void> {
    await this.ensureDBReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAllPhotos(): Promise<void> {
    await this.ensureDBReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPhotoCount(): Promise<number> {
    await this.ensureDBReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updatePhotoSyncStatus(id: string, googleDriveFileId: string | null, synced: boolean): Promise<void> {
    await this.ensureDBReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // First get the existing photo
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const photo = getRequest.result;
        if (photo) {
          photo.googleDriveFileId = googleDriveFileId;
          photo.syncedToGoogleDrive = synced;
          
          const putRequest = store.put(photo);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error('Photo not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getUnsyncedPhotos(): Promise<PhotoRecord[]> {
    await this.ensureDBReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const allPhotos = request.result;
        const unsyncedPhotos = allPhotos.filter(photo => !photo.syncedToGoogleDrive);
        resolve(unsyncedPhotos);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async ensureDBReady(): Promise<void> {
    if (!this.db) {
      await this.initDB();
    }
  }

  private async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  arrayBufferToBlob(arrayBuffer: ArrayBuffer, type: string = 'image/jpeg'): Blob {
    return new Blob([arrayBuffer], { type });
  }

  private async migrateToArrayBuffer(event: IDBVersionChangeEvent): Promise<void> {
    const transaction = (event.target as IDBOpenDBRequest).transaction;
    if (!transaction) return;

    const store = transaction.objectStore(this.storeName);
    const request = store.getAll();

    request.onsuccess = async () => {
      const records = request.result as PhotoRecord[];
      
      for (const record of records) {
        // If record has blob but no data, migrate it
        if (record.blob && !record.data) {
          try {
            const arrayBuffer = await this.blobToArrayBuffer(record.blob);
            const updatedRecord: PhotoRecord = {
              ...record,
              data: arrayBuffer
            };
            delete updatedRecord.blob; // Remove old blob property
            
            const putRequest = store.put(updatedRecord);
            putRequest.onerror = () => {
              console.warn(`Failed to migrate photo ${record.id} to ArrayBuffer`);
            };
          } catch (error) {
            console.warn(`Failed to convert blob to ArrayBuffer for photo ${record.id}:`, error);
          }
        }
      }
    };

    request.onerror = () => {
      console.warn('Failed to retrieve photos for migration');
    };
  }
}
