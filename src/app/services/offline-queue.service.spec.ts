import { OfflineQueueService } from './offline-queue.service';
import { IndexedDbService, PhotoRecord } from './indexed-db.service';
import { GoogleDriveService } from './google-drive.service';

describe('OfflineQueueService', () => {
  let indexedDb: jasmine.SpyObj<IndexedDbService>;
  let googleDrive: jasmine.SpyObj<GoogleDriveService>;
  let service: OfflineQueueService;

  const photoId = 'photo_1';
  const timestamp = new Date('2026-07-01T10:00:00');

  function makeService(): OfflineQueueService {
    return new OfflineQueueService(indexedDb, googleDrive);
  }

  function photoRecord(overrides: Partial<PhotoRecord> = {}): PhotoRecord {
    return {
      id: photoId,
      data: new ArrayBuffer(8),
      timestamp,
      syncedToGoogleDrive: false,
      ...overrides
    };
  }

  beforeEach(() => {
    localStorage.removeItem('offline_queue');
    indexedDb = jasmine.createSpyObj<IndexedDbService>('IndexedDbService', [
      'getPhoto', 'updatePhotoSyncStatus', 'arrayBufferToBlob'
    ]);
    indexedDb.arrayBufferToBlob.and.callFake(
      (buffer: ArrayBuffer) => new Blob([buffer], { type: 'image/jpeg' })
    );
    googleDrive = jasmine.createSpyObj<GoogleDriveService>('GoogleDriveService', [
      'isAuthenticated', 'syncPhoto', 'deletePhoto'
    ]);
  });

  afterEach(() => {
    service?.destroy();
    localStorage.removeItem('offline_queue');
  });

  it('persists queued uploads by photoId and survives a reload', async () => {
    service = makeService();
    await service.queuePhotoUpload(photoId, timestamp);

    // The persisted queue must not contain photo bytes — JSON.stringify turns
    // an ArrayBuffer into {}, which was a silent data-loss bug
    const stored = JSON.parse(localStorage.getItem('offline_queue')!);
    expect(stored.length).toBe(1);
    expect(stored[0].photoId).toBe(photoId);
    expect(stored[0].data).toBeUndefined();

    // A fresh instance (app reload) restores the action
    service.destroy();
    service = makeService();
    expect(service.getQueueStatus().uploads).toBe(1);
    expect(service.hasPendingUpload(photoId)).toBeTrue();
  });

  it('does not queue the same upload twice', async () => {
    service = makeService();
    await service.queuePhotoUpload(photoId, timestamp);
    await service.queuePhotoUpload(photoId, timestamp);

    expect(service.getQueueStatus().uploads).toBe(1);
  });

  it('drops a pending upload when the photo is deleted', async () => {
    service = makeService();
    await service.queuePhotoUpload(photoId, timestamp);
    await service.queuePhotoDelete(photoId, timestamp, 'drive-file-1');

    const status = service.getQueueStatus();
    expect(status.uploads).toBe(0);
    expect(status.deletes).toBe(1);
  });

  it('keeps actions untouched while not authenticated (no retry burned)', async () => {
    googleDrive.isAuthenticated.and.returnValue(false);
    service = makeService();
    await service.queuePhotoDelete(photoId, timestamp);

    // Many sync ticks while signed out must never discard the delete —
    // otherwise the Drive copy resurrects on the next download sync
    for (let i = 0; i < 5; i++) {
      await service.forceSync();
    }

    expect(service.getQueueStatus().deletes).toBe(1);
    expect(googleDrive.deletePhoto).not.toHaveBeenCalled();
  });

  it('uploads a queued photo by re-reading its bytes from IndexedDB', async () => {
    googleDrive.isAuthenticated.and.returnValue(true);
    googleDrive.syncPhoto.and.resolveTo('drive-file-1');
    indexedDb.getPhoto.and.resolveTo(photoRecord());
    service = makeService();

    await service.queuePhotoUpload(photoId, timestamp);
    await service.forceSync();

    expect(googleDrive.syncPhoto).toHaveBeenCalledWith(jasmine.any(Blob), photoId, timestamp);
    expect(service.getQueueStatus().total).toBe(0);
  });

  it('completes an upload action without calling Drive when the photo no longer exists locally', async () => {
    googleDrive.isAuthenticated.and.returnValue(true);
    indexedDb.getPhoto.and.resolveTo(null);
    service = makeService();

    await service.queuePhotoUpload(photoId, timestamp);
    await service.forceSync();

    expect(googleDrive.syncPhoto).not.toHaveBeenCalled();
    expect(service.getQueueStatus().total).toBe(0);
  });

  it('skips uploading photos already synced by another path', async () => {
    googleDrive.isAuthenticated.and.returnValue(true);
    indexedDb.getPhoto.and.resolveTo(photoRecord({ syncedToGoogleDrive: true }));
    service = makeService();

    await service.queuePhotoUpload(photoId, timestamp);
    await service.forceSync();

    expect(googleDrive.syncPhoto).not.toHaveBeenCalled();
    expect(service.getQueueStatus().total).toBe(0);
  });

  it('drops an action after repeated real failures', async () => {
    googleDrive.isAuthenticated.and.returnValue(true);
    googleDrive.syncPhoto.and.resolveTo(null);
    indexedDb.getPhoto.and.resolveTo(photoRecord());
    service = makeService();

    await service.queuePhotoUpload(photoId, timestamp);
    for (let i = 0; i < 3; i++) {
      await service.forceSync();
    }

    expect(service.getQueueStatus().total).toBe(0);
    expect(googleDrive.syncPhoto).toHaveBeenCalledTimes(3);
  });

  it('passes the known Drive file id to deletions', async () => {
    googleDrive.isAuthenticated.and.returnValue(true);
    googleDrive.deletePhoto.and.resolveTo(true);
    service = makeService();

    await service.queuePhotoDelete(photoId, timestamp, 'drive-file-1');
    await service.forceSync();

    expect(googleDrive.deletePhoto).toHaveBeenCalledWith(photoId, timestamp, 'drive-file-1');
    expect(service.getQueueStatus().total).toBe(0);
  });
});
