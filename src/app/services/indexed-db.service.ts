import { Injectable } from '@angular/core';

export interface PhotoRecord {
  id: string;
  data: ArrayBuffer;
  timestamp: Date;
  thumbnail?: string;
  googleDriveFileId?: string;
  syncedToGoogleDrive?: boolean;
  // Numeric mirror of syncedToGoogleDrive (0/1) — booleans are not valid IndexedDB
  // index keys, so the 'synced' index is built on this field
  syncedFlag?: number;
  // For backward compatibility during migration
  blob?: Blob;
}

export interface PhotoMeta {
  id: string;
  timestamp: Date;
  thumbnail?: string;
  googleDriveFileId?: string;
  syncedToGoogleDrive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class IndexedDbService {
  private dbName = 'DailyFace.me';
  private dbVersion = 3;
  private storeName = 'photos';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initDB().catch(error => console.error('Failed to open IndexedDB:', error));
  }

  private initDB(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };
      request.onblocked = () => {
        console.warn('IndexedDB upgrade blocked by another open tab');
      };
      request.onsuccess = () => {
        this.db = request.result;
        // Close this connection if another tab needs to upgrade the schema
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(this.storeName)) {
          store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        } else {
          store = transaction.objectStore(this.storeName);
        }

        // Version 3: index sync status so unsynced lookups and synced counts
        // don't require materializing every photo's ArrayBuffer.
        // (Blob→ArrayBuffer conversion from v1 happens lazily in getPhoto —
        // FileReader can't run inside a versionchange transaction.)
        if (oldVersion < 3) {
          if (!store.indexNames.contains('synced')) {
            store.createIndex('synced', 'syncedFlag', { unique: false });
          }
          // Backfill the numeric flag on existing records; cursor iteration is
          // event-driven with no macrotask breaks, so it is safe in an upgrade
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
              const record = cursor.value as PhotoRecord;
              record.syncedFlag = record.syncedToGoogleDrive ? 1 : 0;
              cursor.update(record);
              cursor.continue();
            }
          };
        }
      };
    });

    return this.initPromise;
  }

  async savePhoto(photoBlob: Blob, id: string, timestamp: Date, thumbnail?: string): Promise<void> {
    await this.ensureDBReady();

    // Convert Blob to ArrayBuffer for iOS Safari compatibility
    const arrayBuffer = await this.blobToArrayBuffer(photoBlob);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const photoRecord: PhotoRecord = {
        id,
        data: arrayBuffer,
        timestamp,
        thumbnail,
        syncedToGoogleDrive: false,
        syncedFlag: 0
      };

      const request = store.put(photoRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPhoto(id: string): Promise<PhotoRecord | null> {
    await this.ensureDBReady();

    const record = await new Promise<PhotoRecord | null>((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    // Lazy migration of v1 records: convert legacy Blob storage to ArrayBuffer
    // on first read (can't be done in the upgrade transaction — FileReader is async)
    if (record && record.blob && !record.data) {
      try {
        record.data = await this.blobToArrayBuffer(record.blob);
        delete record.blob;
        await new Promise<void>((resolve, reject) => {
          const transaction = this.db!.transaction([this.storeName], 'readwrite');
          const request = transaction.objectStore(this.storeName).put(record);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (error) {
        console.warn(`Failed to migrate photo ${id} to ArrayBuffer:`, error);
      }
    }

    return record;
  }

  // Cursor over the timestamp index — avoids materializing every photo just to
  // read the newest one
  async getLatestPhoto(): Promise<PhotoRecord | null> {
    await this.ensureDBReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.index('timestamp').openCursor(null, 'prev');

      request.onsuccess = () => resolve(request.result ? request.result.value : null);
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
          photo.syncedFlag = synced ? 1 : 0;

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

  async updatePhotoThumbnail(id: string, thumbnail: string): Promise<void> {
    await this.ensureDBReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const photo = getRequest.result;
        if (!photo) {
          resolve(); // Photo was deleted meanwhile — nothing to update
          return;
        }
        photo.thumbnail = thumbnail;
        const putRequest = store.put(photo);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getUnsyncedPhotos(): Promise<PhotoRecord[]> {
    await this.ensureDBReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.index('synced').getAll(IDBKeyRange.only(0));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncedPhotosCount(): Promise<number> {
    await this.ensureDBReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.index('synced').count(IDBKeyRange.only(1));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Metadata-only listing so callers (e.g. the sync loop) don't hold every
  // photo's ArrayBuffer in memory at once
  async getAllPhotoMeta(): Promise<PhotoMeta[]> {
    await this.ensureDBReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      const metas: PhotoMeta[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value as PhotoRecord;
          metas.push({
            id: record.id,
            timestamp: record.timestamp,
            thumbnail: record.thumbnail,
            googleDriveFileId: record.googleDriveFileId,
            syncedToGoogleDrive: record.syncedToGoogleDrive
          });
          cursor.continue();
        } else {
          resolve(metas);
        }
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
}
