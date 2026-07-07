import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService, CameraPhoto } from '../services/camera.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocaleService } from '../services/locale.service';

@Component({
  selector: 'app-play',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './play.component.html',
  styleUrl: './play.component.css'
})
export class PlayComponent implements OnInit, OnDestroy {
  photos: CameraPhoto[] = [];
  currentPhotoIndex = 0;
  currentPhotoUrl: string | null = null;
  isPlaying = false;
  intervalId: any = null;
  showControls = false;
  isDragging = false;
  progressContainer: HTMLElement | null = null;
  dragHandlers: {
    mouseMove?: (e: MouseEvent) => void;
    mouseUp?: (e: MouseEvent) => void;
    touchMove?: (e: TouchEvent) => void;
    touchUp?: (e: TouchEvent) => void;
  } = {};
  
  // Slideshow settings
  readonly FPS = 10;
  readonly INTERVAL_MS = 1000 / this.FPS; // 100ms for 10 FPS

  // Frame pipeline: decoded data URLs are cached ahead of the playhead so a
  // 100ms tick doesn't have to wait on IndexedDB + FileReader, and a sequence
  // counter drops late loads so frames can't flash out of order
  private readonly FRAME_CACHE_LIMIT = 60;
  private readonly PRELOAD_AHEAD = 10;
  private frameCache = new Map<string, string>();
  private pendingFrames = new Set<string>();
  private displaySeq = 0;
  private tickInFlight = false;

  constructor(
    private cameraService: CameraService,
    private localeService: LocaleService
  ) {}

  async ngOnInit() {
    await this.loadPhotos();
  }

  ngOnDestroy() {
    this.stopSlideshow();
    this.endDrag();
  }

  async loadPhotos() {
    try {
      // Metadata only — frames are loaded on demand through the frame cache
      this.photos = await this.cameraService.getPhotoIndex();
      // Sort photos by timestamp (oldest to newest)
      this.photos.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      if (this.photos.length > 0) {
        await this.displayPhoto(0);
      }
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  }

  async displayPhoto(index: number) {
    if (index < 0 || index >= this.photos.length) return;

    this.currentPhotoIndex = index;
    const seq = ++this.displaySeq;
    const url = await this.getFrame(this.photos[index]);
    // Only apply if no newer frame was requested while this one loaded
    if (url && seq === this.displaySeq) {
      this.currentPhotoUrl = url;
    }
  }

  private async getFrame(photo: CameraPhoto): Promise<string | null> {
    const cached = this.frameCache.get(photo.id);
    if (cached) return cached;

    const url = await this.cameraService.getPhotoDataUrl(photo);
    if (url) {
      this.cacheFrame(photo.id, url);
    }
    return url;
  }

  private cacheFrame(id: string, url: string): void {
    if (this.frameCache.size >= this.FRAME_CACHE_LIMIT) {
      const oldest = this.frameCache.keys().next().value;
      if (oldest !== undefined) {
        this.frameCache.delete(oldest);
      }
    }
    this.frameCache.set(id, url);
  }

  private preloadAhead(fromIndex: number): void {
    for (let i = 1; i <= this.PRELOAD_AHEAD; i++) {
      const photo = this.photos[(fromIndex + i) % this.photos.length];
      if (this.frameCache.has(photo.id) || this.pendingFrames.has(photo.id)) continue;

      this.pendingFrames.add(photo.id);
      this.cameraService.getPhotoDataUrl(photo)
        .then(url => {
          if (url) this.cacheFrame(photo.id, url);
        })
        .finally(() => this.pendingFrames.delete(photo.id));
    }
  }

  async startSlideshow() {
    if (this.photos.length === 0) return;

    this.isPlaying = true;
    // Don't reset to 0, continue from current position
    this.preloadAhead(this.currentPhotoIndex);

    this.intervalId = setInterval(() => this.advanceFrame(), this.INTERVAL_MS);
  }

  private async advanceFrame(): Promise<void> {
    if (this.tickInFlight) return; // Previous frame still loading — skip, don't stack

    this.tickInFlight = true;
    try {
      const nextIndex = (this.currentPhotoIndex + 1) % this.photos.length;
      await this.displayPhoto(nextIndex);
      this.preloadAhead(nextIndex);
    } finally {
      this.tickInFlight = false;
    }
  }

  stopSlideshow() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  togglePlayback() {
    if (this.isPlaying) {
      this.stopSlideshow();
    } else {
      this.startSlideshow();
    }
  }

  async goToFirstPhoto() {
    this.stopSlideshow();
    if (this.photos.length > 0) {
      await this.displayPhoto(0);
    }
  }

  async goToLastPhoto() {
    this.stopSlideshow();
    if (this.photos.length > 0) {
      await this.displayPhoto(this.photos.length - 1);
    }
  }

  async previousPhoto() {
    this.stopSlideshow();
    const newIndex = this.currentPhotoIndex > 0 ? this.currentPhotoIndex - 1 : this.photos.length - 1;
    await this.displayPhoto(newIndex);
  }

  async nextPhoto() {
    this.stopSlideshow();
    const newIndex = this.currentPhotoIndex < this.photos.length - 1 ? this.currentPhotoIndex + 1 : 0;
    await this.displayPhoto(newIndex);
  }

  getProgressPercentage(): number {
    if (this.photos.length === 0) return 0;
    if (this.photos.length === 1) return 0;
    return (this.currentPhotoIndex / (this.photos.length - 1)) * 100;
  }

  seekToPosition(event: MouseEvent): void {
    if (this.photos.length === 0 || this.isDragging) return;
    
    // Don't seek if clicking on the thumb itself
    const target = event.target as HTMLElement;
    if (target.classList.contains('progress-thumb')) {
      return;
    }
    
    const progressContainer = event.currentTarget as HTMLElement;
    const rect = progressContainer.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const progressWidth = rect.width;
    const percentage = (clickX / progressWidth) * 100;
    
    // Convert percentage to photo index
    const targetIndex = Math.round((percentage / 100) * (this.photos.length - 1));
    const clampedIndex = Math.max(0, Math.min(targetIndex, this.photos.length - 1));
    
    this.displayPhoto(clampedIndex);
  }
  
  seekToPositionTouch(event: TouchEvent): void {
    if (this.photos.length === 0 || this.isDragging) return;
    
    // Don't seek if touching the thumb itself
    const target = event.target as HTMLElement;
    if (target.classList.contains('progress-thumb')) {
      return;
    }
    
    const touch = event.changedTouches[0];
    if (!touch) return;
    
    const progressContainer = event.currentTarget as HTMLElement;
    const rect = progressContainer.getBoundingClientRect();
    const clickX = touch.clientX - rect.left;
    const progressWidth = rect.width;
    const percentage = (clickX / progressWidth) * 100;
    
    // Convert percentage to photo index
    const targetIndex = Math.round((percentage / 100) * (this.photos.length - 1));
    const clampedIndex = Math.max(0, Math.min(targetIndex, this.photos.length - 1));
    
    this.displayPhoto(clampedIndex);
  }

  handleMouseDown(event: MouseEvent): void {
    this.startDrag(event);
  }
  
  handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    this.startDragTouch(event, true);
  }

  startDragTouch(event: MouseEvent | TouchEvent, isTouch: boolean = false): void {
    event.preventDefault();
    event.stopPropagation();
    
    this.isDragging = true;
    this.stopSlideshow();
    
    // Find the progress container
    let element = event.target as HTMLElement;
    while (element && !element.classList.contains('progress-container')) {
      element = element.parentElement as HTMLElement;
    }
    this.progressContainer = element;
    
    if (!this.progressContainer) {
      return;
    }
    
    if (isTouch) {
      // Touch event handlers
      this.dragHandlers.touchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (touch) {
          this.handleDragMoveTouch(touch.clientX, touch.clientY);
        }
      };
      
      this.dragHandlers.touchUp = (e: TouchEvent) => {
        this.endDrag();
      };
      
      // Add touch event listeners
      document.addEventListener('touchmove', this.dragHandlers.touchMove, { passive: false });
      document.addEventListener('touchend', this.dragHandlers.touchUp);
      document.addEventListener('touchcancel', this.dragHandlers.touchUp);
      
    } else {
      // Mouse event handlers
      this.dragHandlers.mouseMove = (e: MouseEvent) => {
        this.handleDragMove(e);
      };

      this.dragHandlers.mouseUp = (e: MouseEvent) => {
        this.endDrag();
      };

      // One capture-phase listener on window is enough — mouse events bubble
      // through window regardless of where the pointer is
      window.addEventListener('mousemove', this.dragHandlers.mouseMove, true);
      window.addEventListener('mouseup', this.dragHandlers.mouseUp, true);
    }
  }

  startDrag(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Delegate to the unified touch/mouse handler
    this.startDragTouch(event, false);
  }
  
  private handleDragMove(e: MouseEvent): void {
    if (!this.isDragging || !this.progressContainer || this.photos.length === 0) {
      return;
    }
    
    this.handleDragMoveTouch(e.clientX, e.clientY);
  }
  
  private handleDragMoveTouch(clientX: number, clientY: number): void {
    if (!this.isDragging || !this.progressContainer || this.photos.length === 0) {
      return;
    }
    
    const rect = this.progressContainer.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const progressWidth = rect.width;
    const percentage = Math.max(0, Math.min(100, (clickX / progressWidth) * 100));
    
    const targetIndex = Math.round((percentage / 100) * (this.photos.length - 1));
    const clampedIndex = Math.max(0, Math.min(targetIndex, this.photos.length - 1));
    
    if (clampedIndex !== this.currentPhotoIndex) {
      this.displayPhoto(clampedIndex);
    }
  }
  
  private endDrag(): void {
    this.isDragging = false;
    this.progressContainer = null;
    
    // Remove mouse event listeners
    if (this.dragHandlers.mouseMove) {
      window.removeEventListener('mousemove', this.dragHandlers.mouseMove, true);
    }

    if (this.dragHandlers.mouseUp) {
      window.removeEventListener('mouseup', this.dragHandlers.mouseUp, true);
    }
    
    // Remove touch event listeners
    if (this.dragHandlers.touchMove) {
      document.removeEventListener('touchmove', this.dragHandlers.touchMove);
    }
    
    if (this.dragHandlers.touchUp) {
      document.removeEventListener('touchend', this.dragHandlers.touchUp);
      document.removeEventListener('touchcancel', this.dragHandlers.touchUp);
    }
    
    this.dragHandlers = {};
  }

  // Helper methods for i18n
  getPhotoAltText(): string {
    const template = this.localeService.getTranslation('play.photo_alt');
    return template.replace('{index}', (this.currentPhotoIndex + 1).toString());
  }
}