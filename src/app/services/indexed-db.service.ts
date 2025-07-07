import { Injectable } from '@angular/core';

export interface PhotoRecord {
  id: string;
  blob: Blob;
  timestamp: Date;
  thumbnail?: string;
  googleDriveFileId?: string;
  syncedToGoogleDrive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class IndexedDbService {
  private dbName = 'MyDailyFaceDB';
  private dbVersion = 1;
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
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async savePhoto(photoBlob: Blob, id: string, timestamp: Date): Promise<void> {
    await this.ensureDBReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const photoRecord: PhotoRecord = {
        id,
        blob: photoBlob,
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
}
