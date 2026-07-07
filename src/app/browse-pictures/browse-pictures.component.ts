import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService, CameraPhoto } from '../services/camera.service';
import { TestDataGeneratorService } from '../services/test-data-generator.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocaleService } from '../services/locale.service';

interface PhotoSection {
  monthYear: string;
  displayName: string;
  photos: CameraPhoto[];
}

interface FlattenedItem {
  type: 'header' | 'photo';
  displayName?: string;
  count?: number;
  photo?: CameraPhoto;
}

@Component({
  selector: 'app-browse-pictures',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './browse-pictures.component.html',
  styleUrl: './browse-pictures.component.css'
})
export class BrowsePicturesComponent implements OnInit, OnDestroy {
  photos: CameraPhoto[] = [];
  photoSections: PhotoSection[] = [];
  flattenedPhotoItems: FlattenedItem[] = [];
  photoDataUrls: Map<string, string> = new Map();
  isLoading = true;
  showDeleteConfirm = false;
  photoToDelete: CameraPhoto | null = null;
  
  // Animation states
  showPhotoModal = false;
  animatePhotoOpen = false;
  animatePhotoClose = false;
  showPhotoInterface = false;
  transitionOrigin: { x: number; y: number; width: number; height: number } | null = null;
  closeScale = 0;
  
  // Photo navigation
  currentPhotoIndex = 0;
  allPhotosFlat: CameraPhoto[] = [];
  currentDisplayedDate = '';
  currentDisplayedTime = '';
  openedPhotoId = ''; // Track the ID of the photo that was clicked to open
  
  // Two-stage photo loading
  showScrollablePhotos = false;
  openingPhotoDataUrl: string | null = null;
  
  // Photo navigation
  scrollContainerWidth = 0;
  visiblePhotos: { photo: CameraPhoto; dataUrl: string | null }[] = [];
  private photoCache = new Map<string, string>(); // Cache loaded photos
  
  // Swipe down to close (vertical only)
  swipeStartX = 0;
  swipeStartY = 0;
  swipeCurrentX = 0;
  swipeCurrentY = 0;
  isSwipeActive = false;
  swipeTransform = '';
  isVerticalSwipe = false;

  constructor(
    private cameraService: CameraService,
    private testDataGenerator: TestDataGeneratorService,
    private localeService: LocaleService
  ) {}

  private destroyed = false;
  private pendingTimeouts: number[] = [];
  // Increments per updateVisiblePhotos run so stale async loads can bail out
  private visibleUpdateSeq = 0;

  ngOnInit() {
    this.loadPhotos();
  }

  ngOnDestroy() {
    this.destroyed = true;
    for (const id of this.pendingTimeouts) {
      clearTimeout(id);
    }
    this.pendingTimeouts = [];
  }

  private schedule(callback: () => void, delay: number): void {
    this.pendingTimeouts.push(window.setTimeout(callback, delay));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showDeleteConfirm) {
      this.cancelDelete();
    } else if (this.showPhotoModal) {
      this.closePhoto();
    }
  }

  async loadPhotos() {
    this.isLoading = true;
    try {
      // Metadata + thumbnails only — the grid must never hold every photo's
      // full-resolution bytes in memory
      this.photos = await this.cameraService.getPhotoIndex();

      // Group photos by month-year
      this.groupPhotosByMonth();

      // Load thumbnails for display (in batches for better performance)
      await this.loadThumbnails();
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadThumbnails() {
    const batchSize = 10;
    for (let i = 0; i < this.photos.length; i += batchSize) {
      if (this.destroyed) {
        return; // Stop hammering IndexedDB after the user navigates away
      }
      const batch = this.photos.slice(i, i + batchSize);
      const promises = batch.map(async (photo) => {
        try {
          // Stored thumbnail, or generated + persisted for pre-thumbnail photos
          const thumbnail = await this.cameraService.getOrCreateThumbnail(photo);
          if (thumbnail) {
            this.photoDataUrls.set(photo.id, thumbnail);
          } else {
            console.warn(`Failed to load thumbnail for ${photo.id} - corrupted or missing data`);
          }
        } catch (error) {
          console.error(`Error loading photo ${photo.id}:`, error);
        }
      });
      await Promise.all(promises);
    }
  }

  getPhotoDataUrl(photo: CameraPhoto): string | undefined {
    return this.photoDataUrls.get(photo.id);
  }

  async openPhoto(photo: CameraPhoto, event: Event) {
    const clickedElement = event.currentTarget as HTMLElement;
    const rect = clickedElement.getBoundingClientRect();
    
    // Store the clicked element's position and size for transition
    this.transitionOrigin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height
    };
    
    // Store the opened photo ID and data URL for single photo display
    this.openedPhotoId = photo.id;
    this.openingPhotoDataUrl = await this.cameraService.getPhotoDataUrl(photo);
    
    // Find the current photo index in the flat array
    this.currentPhotoIndex = this.allPhotosFlat.findIndex(p => p.id === photo.id);
    
    // Start with single photo mode for opening animation
    this.showScrollablePhotos = false;
    this.showPhotoModal = true;
    
    // Update displayed date and time
    this.updateDisplayedInfo();
    
    // Calculate initial scale based on thumbnail size
    this.schedule(() => {
      const photoContainer = document.querySelector('.photo-container') as HTMLElement;
      if (photoContainer && this.transitionOrigin) {
        const containerRect = photoContainer.getBoundingClientRect();
        this.closeScale = Math.min(
          this.transitionOrigin.width / containerRect.width,
          this.transitionOrigin.height / containerRect.height
        );
      }
      this.animatePhotoOpen = true;

      // Show interface elements after opening animation completes
      this.schedule(async () => {
        this.showPhotoInterface = true;
        // Prepare the scrollable photo container in the background
        await this.prepareScrollablePhotos();
        // Position the scroll container to center BEFORE showing it
        await this.positionScrollContainer();
        // Now switch to scrollable mode (container is already positioned)
        // Note: showScrollablePhotos is handled in positionScrollContainer to avoid flicker
      }, this.testDataGenerator.getAdjustedTimeout(300));
    }, this.testDataGenerator.getAdjustedTimeout(10));
  }

  closePhoto() {
    // Hide interface elements immediately when closing starts
    this.showPhotoInterface = false;
    
    // Find the current photo's thumbnail in the grid to animate back to it
    const currentPhoto = this.allPhotosFlat[this.currentPhotoIndex];
    if (currentPhoto) {
      // Find the thumbnail element using the data-photo-id attribute
      const thumbnail = document.querySelector(`[data-photo-id="${currentPhoto.id}"]`) as HTMLElement;
      if (thumbnail) {
        const rect = thumbnail.getBoundingClientRect();
        // Update transition origin to current photo's thumbnail
        this.transitionOrigin = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height
        };
        console.log('Found current photo thumbnail for:', currentPhoto.id);
      } else {
        console.log('Could not find thumbnail for current photo:', currentPhoto.id);
        // Keep the original transition origin as fallback
      }
    }
    
    // Calculate the target scale based on thumbnail size vs fullscreen
    if (this.transitionOrigin) {
      const photoContainer = document.querySelector('.photo-container') as HTMLElement;
      if (photoContainer) {
        const containerRect = photoContainer.getBoundingClientRect();
        this.closeScale = Math.min(
          this.transitionOrigin.width / containerRect.width,
          this.transitionOrigin.height / containerRect.height
        );
      }
    }
    
    // Start close animation
    this.animatePhotoClose = true;
    
    // Reset swipe transform
    this.swipeTransform = '';
    
    // Wait for closing animation to complete (2x slower than opening)
    this.schedule(() => {
      this.showPhotoModal = false;
      this.transitionOrigin = null;
      this.animatePhotoOpen = false;
      this.animatePhotoClose = false;
      this.showPhotoInterface = false;
      this.showScrollablePhotos = false;
      this.openingPhotoDataUrl = null;
      this.openedPhotoId = '';
      this.closeScale = 0;
      // Clear photo cache to free memory
      this.photoCache.clear();
    }, this.testDataGenerator.getAdjustedTimeout(600));
  }

  onTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      this.swipeStartX = event.touches[0].clientX;
      this.swipeStartY = event.touches[0].clientY;
      this.isSwipeActive = true;
      this.isVerticalSwipe = false; // Will be determined in touchmove
    }
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isSwipeActive || event.touches.length !== 1) return;
    
    this.swipeCurrentX = event.touches[0].clientX;
    this.swipeCurrentY = event.touches[0].clientY;
    
    const deltaX = Math.abs(this.swipeCurrentX - this.swipeStartX);
    const deltaY = Math.abs(this.swipeCurrentY - this.swipeStartY);
    
    // Determine swipe direction on first significant movement
    if (!this.isVerticalSwipe && (deltaX > 10 || deltaY > 10)) {
      this.isVerticalSwipe = deltaY > deltaX;
    }
    
    // Only handle vertical swipes for close gesture
    if (this.isVerticalSwipe) {
      const actualDeltaY = this.swipeCurrentY - this.swipeStartY;
      
      if (actualDeltaY > 0) {
        // Vertical swipe down - close gesture
        const progress = Math.min(actualDeltaY / 200, 1); // Max progress at 200px
        const scale = 1 - (progress * 0.1); // Scale down slightly
        const opacity = 1 - (progress * 0.3); // Fade background
        
        this.swipeTransform = `translateY(${actualDeltaY}px) scale(${scale})`;
        
        // Update background opacity
        const fullscreenEl = document.querySelector('.photo-fullscreen') as HTMLElement;
        if (fullscreenEl) {
          fullscreenEl.style.backgroundColor = `rgba(0, 0, 0, ${opacity * 0.9})`;
        }
        
        // Prevent default to avoid interfering with scroll
        event.preventDefault();
      }
    }
    // For horizontal swipes, don't prevent default - let the scroll container handle it
  }

  onTouchEnd(event: TouchEvent) {
    if (!this.isSwipeActive) return;
    
    // Only handle vertical swipe close gesture
    if (this.isVerticalSwipe) {
      const deltaY = this.swipeCurrentY - this.swipeStartY;
      
      if (deltaY > 100) {
        // Vertical swipe down - close photo
        this.closePhoto();
      } else {
        // Snap back to original position
        this.swipeTransform = 'translateY(0px) scale(1)';
        const fullscreenEl = document.querySelector('.photo-fullscreen') as HTMLElement;
        if (fullscreenEl) {
          fullscreenEl.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        }
      }
    }
    
    this.isSwipeActive = false;
    this.swipeStartX = 0;
    this.swipeStartY = 0;
    this.swipeCurrentX = 0;
    this.swipeCurrentY = 0;
    this.isVerticalSwipe = false;
  }


  confirmDeletePhoto(photo: CameraPhoto, event: Event) {
    event.stopPropagation(); // Prevent opening the photo
    this.photoToDelete = photo;
    this.showDeleteConfirm = true;
  }
  
  confirmDeleteCurrentPhoto(event: Event) {
    event.stopPropagation();
    const currentPhoto = this.allPhotosFlat[this.currentPhotoIndex];
    if (currentPhoto) {
      this.photoToDelete = currentPhoto;
      this.showDeleteConfirm = true;
    }
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.photoToDelete = null;
  }

  async deletePhoto() {
    if (!this.photoToDelete) return;

    try {
      // Check if we're viewing the photo being deleted in fullscreen
      const currentPhoto = this.allPhotosFlat[this.currentPhotoIndex];
      const isDeletingCurrentPhoto = currentPhoto?.id === this.photoToDelete.id;
      
      if (isDeletingCurrentPhoto && this.showPhotoModal) {
        // We're in fullscreen mode - animate the deletion
        await this.animatePhotoDeletion();
      }
      
      // Actually delete from storage
      await this.cameraService.deletePhoto(this.photoToDelete.id);
      
      // Remove from local arrays
      this.photos = this.photos.filter(p => p.id !== this.photoToDelete!.id);
      this.photoDataUrls.delete(this.photoToDelete.id);
      
      // Regroup photos after deletion
      this.groupPhotosByMonth();
      
      // Update current photo if we were viewing deleted photo
      if (isDeletingCurrentPhoto) {
        if (this.allPhotosFlat.length > 0) {
          // Adjust current index if needed
          if (this.currentPhotoIndex >= this.allPhotosFlat.length) {
            this.currentPhotoIndex = this.allPhotosFlat.length - 1;
          }
          // Update visible photos and display info only if still in fullscreen mode
          if (this.showPhotoModal) {
            await this.updateVisiblePhotos();
            this.updateDisplayedInfo();
          }
        } else {
          // No photos left, close the viewer
          this.closePhoto();
        }
      }
      
      this.cancelDelete();
    } catch (error) {
      console.error('Error deleting photo:', error);
      // Could add user-facing error message here
    }
  }

  private async animatePhotoDeletion(): Promise<void> {
    return new Promise((resolve) => {
      // Find the current photo element in the scrollable view
      const currentPhotoSlide = document.querySelector('.photo-slide img') as HTMLElement;
      
      if (currentPhotoSlide) {
        // Apply fade-out animation with debug speed support
        const fadeOutDuration = this.testDataGenerator.getAdjustedTimeout(300);
        
        currentPhotoSlide.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        currentPhotoSlide.style.opacity = '0';
        
        // Wait for fade-out to complete, then move to next photo
        this.schedule(() => {
          // Move to the next photo (or previous if at end)
          this.moveToNextPhotoAfterDeletion();
          resolve();
        }, fadeOutDuration);
      } else {
        // No animation element found, just resolve immediately
        resolve();
      }
    });
  }

  private moveToNextPhotoAfterDeletion(): void {
    if (this.allPhotosFlat.length <= 1) {
      // Only one photo (the one being deleted), no need to move
      return;
    }
    
    // Determine next photo index
    let nextIndex = this.currentPhotoIndex;
    
    // If we're not at the last photo, stay at the same index (which will show the next photo)
    // If we're at the last photo, move to the previous one
    if (this.currentPhotoIndex >= this.allPhotosFlat.length - 1) {
      nextIndex = this.currentPhotoIndex - 1;
    }
    
    // Update current index
    this.currentPhotoIndex = nextIndex;
    
    // Animate the scroll container to the new position
    const container = document.querySelector('.photo-scroll-container') as HTMLElement;
    if (container && this.scrollContainerWidth > 0) {
      const targetScroll = this.currentPhotoIndex * this.scrollContainerWidth;
      
      // Use smooth scrolling for the transition
      container.style.scrollBehavior = 'smooth';
      container.scrollLeft = targetScroll;
      
      // Update display info immediately for responsiveness
      this.updateDisplayedInfo();
    }
  }

  formatDate(date: Date): string {
    return this.localeService.formatRelativeDate(date);
  }

  formatTime(date: Date): string {
    return this.localeService.formatTime(date);
  }

  trackByPhotoId(index: number, photo: CameraPhoto): string {
    return photo.id;
  }

  trackBySectionId(index: number, section: PhotoSection): string {
    return section.monthYear;
  }

  trackByFlattenedItem(index: number, item: FlattenedItem): string {
    if (item.type === 'header') {
      return `header-${item.displayName}`;
    } else {
      return `photo-${item.photo!.id}`;
    }
  }

  private groupPhotosByMonth() {
    const groupedPhotos = new Map<string, CameraPhoto[]>();
    
    this.photos.forEach(photo => {
      const date = new Date(photo.timestamp);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!groupedPhotos.has(monthYear)) {
        groupedPhotos.set(monthYear, []);
      }
      groupedPhotos.get(monthYear)!.push(photo);
    });
    
    // Convert to sections array and sort by month-year descending (newest first)
    this.photoSections = Array.from(groupedPhotos.entries())
      .map(([monthYear, photos]) => ({
        monthYear,
        displayName: this.formatMonthYear(monthYear),
        photos: photos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      }))
      .sort((a, b) => b.monthYear.localeCompare(a.monthYear));
    
    // Create flat array of all photos in display order (newest first)
    this.allPhotosFlat = this.photoSections.flatMap(section => section.photos);
    
    // Create flattened structure for unified grid
    this.createFlattenedItems();
  }

  private createFlattenedItems() {
    this.flattenedPhotoItems = [];
    
    for (const section of this.photoSections) {
      // Add section header
      this.flattenedPhotoItems.push({
        type: 'header',
        displayName: section.displayName,
        count: section.photos.length
      });
      
      // Add photos for this section
      for (const photo of section.photos) {
        this.flattenedPhotoItems.push({
          type: 'photo',
          photo: photo
        });
      }
    }
  }

  private formatMonthYear(monthYear: string): string {
    const [year, month] = monthYear.split('-').map(Number);
    const date = new Date(year, month - 1);
    const now = new Date();
    
    const monthNames = [
      this.localeService.getTranslation('month.january'),
      this.localeService.getTranslation('month.february'),
      this.localeService.getTranslation('month.march'),
      this.localeService.getTranslation('month.april'),
      this.localeService.getTranslation('month.may'),
      this.localeService.getTranslation('month.june'),
      this.localeService.getTranslation('month.july'),
      this.localeService.getTranslation('month.august'),
      this.localeService.getTranslation('month.september'),
      this.localeService.getTranslation('month.october'),
      this.localeService.getTranslation('month.november'),
      this.localeService.getTranslation('month.december')
    ];
    
    if (year === now.getFullYear()) {
      return monthNames[month - 1];
    } else {
      return `${monthNames[month - 1]} ${year}`;
    }
  }


  private async positionScrollContainer(): Promise<void> {
    return new Promise(async (resolve) => {
      // Wait for next frame to ensure DOM is ready
      requestAnimationFrame(async () => {
        const container = document.querySelector('.photo-scroll-container') as HTMLElement;
        if (container) {
          // Get the actual scroll container width
          let actualContainerWidth = container.offsetWidth;
          
          // Fallback if container width is still 0
          if (actualContainerWidth === 0) {
            const photoContainer = document.querySelector('.photo-container');
            actualContainerWidth = photoContainer ? photoContainer.clientWidth : window.innerWidth;
          }
          
          this.scrollContainerWidth = actualContainerWidth;
          
          // Load visible photos for flexbox layout
          await this.updateVisiblePhotos();
          
          // Disable smooth scrolling for instant positioning
          container.style.scrollBehavior = 'auto';
          
          // Scroll to current photo position - with flexbox each photo is 100vw wide
          const targetScroll = this.currentPhotoIndex * actualContainerWidth;
          container.scrollLeft = targetScroll;
          
          // Wait a bit to ensure scroll has taken effect
          this.schedule(() => {
            // Show the scrollable view
            this.showScrollablePhotos = true;

            this.schedule(() => {
              // Re-enable smooth scrolling
              container.style.scrollBehavior = 'smooth';
              resolve();
            }, 10);
          }, 50);
        } else {
          resolve();
        }
      });
    });
  }


  onPhotoScroll(event: Event) {
    const container = event.target as HTMLElement;
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.offsetWidth;
    
    // Calculate which photo should be current based on scroll position
    const newIndex = Math.round(scrollLeft / containerWidth);
    
    
    if (newIndex !== this.currentPhotoIndex && newIndex >= 0 && newIndex < this.allPhotosFlat.length) {
      this.currentPhotoIndex = newIndex;
      this.updateDisplayedInfo();
      this.updateVisiblePhotos();
    }
  }


  private async prepareScrollablePhotos() {
    // Ensure currentPhotoIndex is correct for the opened photo
    if (this.openedPhotoId) {
      const correctIndex = this.allPhotosFlat.findIndex(p => p.id === this.openedPhotoId);
      if (correctIndex !== -1) {
        this.currentPhotoIndex = correctIndex;
      }
    }

    // Cache the current photo
    const currentPhoto = this.allPhotosFlat[this.currentPhotoIndex];
    if (currentPhoto && this.openingPhotoDataUrl) {
      this.photoCache.set(currentPhoto.id, this.openingPhotoDataUrl);
    }
  }
  
  private async updateVisiblePhotos() {
    const seq = ++this.visibleUpdateSeq;

    // Build the slide list only when the photo set changed (open, deletion) —
    // replacing the array on every scroll event recreates all slide DOM nodes
    // mid-swipe. With trackBy + in-place mutation, scrolling only fills in
    // dataUrls on existing entries.
    if (this.visiblePhotos.length !== this.allPhotosFlat.length
        || this.visiblePhotos.some((slide, i) => slide.photo.id !== this.allPhotosFlat[i].id)) {
      this.visiblePhotos = this.allPhotosFlat.map(photo => ({
        photo,
        dataUrl: this.photoCache.get(photo.id) || null
      }));
    }

    // Only load dataUrls for a window around the current photo
    const windowSize = 10;
    const start = Math.max(0, this.currentPhotoIndex - windowSize);
    const end = Math.min(this.allPhotosFlat.length - 1, this.currentPhotoIndex + windowSize);

    for (let index = start; index <= end; index++) {
      const slide = this.visiblePhotos[index];
      if (slide.dataUrl) continue;

      const cached = this.photoCache.get(slide.photo.id);
      if (cached) {
        slide.dataUrl = cached;
        continue;
      }

      const loadedUrl = await this.cameraService.getPhotoDataUrl(slide.photo);
      if (this.destroyed || seq !== this.visibleUpdateSeq) {
        return; // A newer scroll position superseded this run
      }
      if (loadedUrl) {
        this.photoCache.set(slide.photo.id, loadedUrl);
        slide.dataUrl = loadedUrl;
      }
    }
  }

  trackByVisiblePhoto(index: number, item: { photo: CameraPhoto; dataUrl: string | null }): string {
    return item.photo.id;
  }

  private updateDisplayedInfo() {
    const currentPhoto = this.allPhotosFlat[this.currentPhotoIndex];
    if (currentPhoto) {
      this.currentDisplayedDate = this.formatDate(new Date(currentPhoto.timestamp));
      this.currentDisplayedTime = this.formatTime(new Date(currentPhoto.timestamp));
    }
  }

  // Helper methods for i18n
  getPhotoCountText(): string {
    if (this.photos.length === 1) {
      return this.localeService.getTranslation('browse.photo_count_single');
    } else {
      return this.localeService.getTranslation('browse.photo_count_plural').replace('{count}', this.photos.length.toString());
    }
  }

  getPhotoAltText(photo: CameraPhoto): string {
    const template = this.localeService.getTranslation('browse.photo_alt');
    return template.replace('{date}', this.formatDate(photo.timestamp));
  }

  getGenericPhotoAltText(): string {
    return this.localeService.getTranslation('browse.generic_photo_alt');
  }
}
