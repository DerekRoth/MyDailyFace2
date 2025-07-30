import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent, merge } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { IndexedDbService, PhotoRecord } from './indexed-db.service';
import { GoogleDriveService } from './google-drive.service';

export interface QueuedAction {
  id: string;
  type: 'upload' | 'delete';
  photoId: string;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  data?: ArrayBuffer;
  fileName?: string;
}

export interface OfflineStatus {
  isOnline: boolean;
  hasQueuedActions: number;
  lastSyncAttempt: Date | null;
  syncInProgress: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineQueueService {
  private readonly STORAGE_KEY = 'offline_queue';
  private readonly MAX_RETRIES = 3;
  private readonly SYNC_INTERVAL = 10000; // 10 seconds

  private offlineStatusSubject = new BehaviorSubject<OfflineStatus>({
    isOnline: navigator.onLine,
    hasQueuedActions: 0,
    lastSyncAttempt: null,
    syncInProgress: false
  });

  public offlineStatus$ = this.offlineStatusSubject.asObservable();
  private syncInterval: any = null;
  private queue: QueuedAction[] = [];

  constructor(
    private indexedDbService: IndexedDbService,
    private googleDriveService: GoogleDriveService
  ) {
    this.initializeService();
  }

  private initializeService(): void {
    // Load queued actions from localStorage
    this.loadQueue();

    // Monitor online/offline status
    this.setupConnectivityMonitoring();

    // Start background sync when online
    this.startBackgroundSync();
  }

  private setupConnectivityMonitoring(): void {
    // Listen for online/offline events
    merge(
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    ).pipe(
      startWith(navigator.onLine)
    ).subscribe((isOnline: boolean) => {
      this.updateOfflineStatus({ isOnline });

      if (isOnline && this.queue.length > 0) {
        // Trigger immediate sync when coming back online
        setTimeout(() => this.processQueue(), 1000);
      }
    });
  }

  private startBackgroundSync(): void {
    // Process queue every 10 seconds when online
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && this.queue.length > 0) {
        this.processQueue();
      }
    }, this.SYNC_INTERVAL);
  }

  async queuePhotoUpload(photoBlob: Blob, photoId: string, timestamp: Date): Promise<void> {
    // Convert blob to ArrayBuffer for storage
    const arrayBuffer = await this.blobToArrayBuffer(photoBlob);
    const fileName = `dailyface_${photoId}_${timestamp.toISOString().split('T')[0]}.jpg`;

    const queuedAction: QueuedAction = {
      id: this.generateActionId(),
      type: 'upload',
      photoId,
      timestamp,
      retryCount: 0,
      maxRetries: this.MAX_RETRIES,
      data: arrayBuffer,
      fileName
    };

    this.queue.push(queuedAction);
    this.saveQueue();
    this.updateOfflineStatus({ hasQueuedActions: this.queue.length });

    // Try immediate processing if online
    if (navigator.onLine) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  async queuePhotoDelete(photoId: string, timestamp: Date): Promise<void> {
    const queuedAction: QueuedAction = {
      id: this.generateActionId(),
      type: 'delete',
      photoId,
      timestamp,
      retryCount: 0,
      maxRetries: this.MAX_RETRIES
    };

    this.queue.push(queuedAction);
    this.saveQueue();
    this.updateOfflineStatus({ hasQueuedActions: this.queue.length });

    // Try immediate processing if online
    if (navigator.onLine) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  private async processQueue(): Promise<void> {
    if (!navigator.onLine || this.queue.length === 0) {
      return;
    }

    const currentStatus = this.offlineStatusSubject.value;
    if (currentStatus.syncInProgress) {
      return; // Already processing
    }

    this.updateOfflineStatus({
      syncInProgress: true,
      lastSyncAttempt: new Date()
    });

    const actionsToProcess = [...this.queue];
    let processedCount = 0;

    for (const action of actionsToProcess) {
      try {
        let success = false;

        if (action.type === 'upload') {
          success = await this.processUploadAction(action);
        } else if (action.type === 'delete') {
          success = await this.processDeleteAction(action);
        }

        if (success) {
          // Remove from queue
          this.queue = this.queue.filter(a => a.id !== action.id);
          processedCount++;
        } else {
          // Increment retry count
          action.retryCount++;
          if (action.retryCount >= action.maxRetries) {
            // Remove failed action after max retries
            this.queue = this.queue.filter(a => a.id !== action.id);
            console.warn(`Action ${action.id} failed after ${action.maxRetries} retries`);
          }
        }
      } catch (error) {
        console.error(`Error processing queued action ${action.id}:`, error);
        action.retryCount++;
        if (action.retryCount >= action.maxRetries) {
          this.queue = this.queue.filter(a => a.id !== action.id);
        }
      }
    }

    this.saveQueue();
    this.updateOfflineStatus({
      syncInProgress: false,
      hasQueuedActions: this.queue.length
    });

    if (processedCount > 0) {
      console.log(`Processed ${processedCount} queued actions`);
    }
  }

  private async processUploadAction(action: QueuedAction): Promise<boolean> {
    if (!action.data || !action.fileName) {
      return false;
    }

    try {
      // Check if Google Drive service is authenticated
      if (!this.googleDriveService.isAuthenticated()) {
        return false; // Can't sync without authentication
      }

      const blob = this.arrayBufferToBlob(action.data);
      const fileId = await this.googleDriveService.uploadPhoto(blob, action.fileName);

      if (fileId) {
        // Update local photo record with sync status
        await this.indexedDbService.updatePhotoSyncStatus(action.photoId, fileId, true);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Upload action failed:', error);
      return false;
    }
  }

  private async processDeleteAction(action: QueuedAction): Promise<boolean> {
    try {
      // Check if Google Drive service is authenticated
      if (!this.googleDriveService.isAuthenticated()) {
        return false; // Can't sync without authentication
      }

      return await this.googleDriveService.deletePhoto(action.photoId, action.timestamp);
    } catch (error) {
      console.error('Delete action failed:', error);
      return false;
    }
  }

  async forceSync(): Promise<void> {
    await this.processQueue();
  }

  clearQueue(): void {
    this.queue = [];
    this.saveQueue();
    this.updateOfflineStatus({ hasQueuedActions: 0 });
  }

  getQueueStatus(): { total: number; uploads: number; deletes: number } {
    const uploads = this.queue.filter(a => a.type === 'upload').length;
    const deletes = this.queue.filter(a => a.type === 'delete').length;

    return {
      total: this.queue.length,
      uploads,
      deletes
    };
  }

  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        // Convert timestamp strings back to Date objects
        this.queue.forEach(action => {
          action.timestamp = new Date(action.timestamp);
        });
      }
      this.updateOfflineStatus({ hasQueuedActions: this.queue.length });
    } catch (error) {
      console.error('Failed to load offline queue:', error);
      this.queue = [];
    }
  }

  private saveQueue(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  private updateOfflineStatus(updates: Partial<OfflineStatus>): void {
    const currentStatus = this.offlineStatusSubject.value;
    this.offlineStatusSubject.next({
      ...currentStatus,
      ...updates
    });
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  private arrayBufferToBlob(arrayBuffer: ArrayBuffer, type: string = 'image/jpeg'): Blob {
    return new Blob([arrayBuffer], { type });
  }

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}
