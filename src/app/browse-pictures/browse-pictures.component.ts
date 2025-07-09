import { Component, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-browse-pictures',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './browse-pictures.component.html',
  styleUrl: './browse-pictures.component.css'
})
export class BrowsePicturesComponent implements OnInit {
  photos: CameraPhoto[] = [];
  photoSections: PhotoSection[] = [];
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
  
  // Virtual scrolling
  scrollContainerWidth = 0;
  virtualContentWidth = 0;
  visiblePhotos: { photo: CameraPhoto; dataUrl: string | null; position: number }[] = [];
  private photoCache = new Map<string, string>(); // Cache loaded photos
  
  // Swipe down to close (vertical only)
  swipeStartY = 0;
  swipeCurrentY = 0;
  isSwipeActive = false;
  swipeTransform = '';

  constructor(
    private cameraService: CameraService,
    private testDataGenerator: TestDataGeneratorService,
    private localeService: LocaleService
  ) {}

  ngOnInit() {
    this.loadPhotos();
  }

  async loadPhotos() {
    this.isLoading = true;
    try {
      this.photos = await this.cameraService.getStoredPhotos();
      
      // Group photos by month-year
      this.groupPhotosByMonth();
      
      // Load data URLs for display (load in batches for better performance)
      await this.loadPhotoDataUrls();
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPhotoDataUrls() {
    // Load photos in batches of 10 for better performance
    const batchSize = 10;
    for (let i = 0; i < this.photos.length; i += batchSize) {
      const batch = this.photos.slice(i, i + batchSize);
      const promises = batch.map(async (photo) => {
        const dataUrl = await this.cameraService.getPhotoDataUrl(photo);
        if (dataUrl) {
          this.photoDataUrls.set(photo.id, dataUrl);
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
    setTimeout(() => {
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
      setTimeout(async () => {
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
    setTimeout(() => {
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
      this.swipeStartY = event.touches[0].clientY;
      this.isSwipeActive = true;
    }
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isSwipeActive || event.touches.length !== 1) return;
    
    this.swipeCurrentY = event.touches[0].clientY;
    const deltaY = this.swipeCurrentY - this.swipeStartY;
    
    if (deltaY > 0) {
      // Vertical swipe down - close gesture
      const progress = Math.min(deltaY / 200, 1); // Max progress at 200px
      const scale = 1 - (progress * 0.1); // Scale down slightly
      const opacity = 1 - (progress * 0.3); // Fade background
      
      this.swipeTransform = `translateY(${deltaY}px) scale(${scale})`;
      
      // Update background opacity
      const fullscreenEl = document.querySelector('.photo-fullscreen') as HTMLElement;
      if (fullscreenEl) {
        fullscreenEl.style.backgroundColor = `rgba(0, 0, 0, ${opacity * 0.9})`;
      }
    }
  }

  onTouchEnd(event: TouchEvent) {
    if (!this.isSwipeActive) return;
    
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
    
    this.isSwipeActive = false;
    this.swipeStartY = 0;
    this.swipeCurrentY = 0;
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
      await this.cameraService.deletePhoto(this.photoToDelete.id);
      
      // Remove from local arrays
      this.photos = this.photos.filter(p => p.id !== this.photoToDelete!.id);
      this.photoDataUrls.delete(this.photoToDelete.id);
      
      // Regroup photos after deletion
      this.groupPhotosByMonth();
      
      // Update current photo if viewing deleted photo
      const currentPhoto = this.allPhotosFlat[this.currentPhotoIndex];
      if (currentPhoto?.id === this.photoToDelete.id) {
        if (this.allPhotosFlat.length > 0) {
          // Adjust current index if needed
          if (this.currentPhotoIndex >= this.allPhotosFlat.length) {
            this.currentPhotoIndex = this.allPhotosFlat.length - 1;
          }
          // Update visible photos and display info
          const containerWidth = window.innerWidth;
          await this.updateVisiblePhotos(containerWidth);
          this.updateDisplayedInfo();
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

  formatDate(date: Date): string {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return this.localeService.getTranslation('date.today');
    } else if (diffInDays === 1) {
      return this.localeService.getTranslation('date.yesterday');
    } else if (diffInDays < 7) {
      return this.localeService.getTranslation('date.days_ago').replace('{days}', diffInDays.toString());
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
      });
    }
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }

  trackByPhotoId(index: number, photo: CameraPhoto): string {
    return photo.id;
  }

  trackBySectionId(index: number, section: PhotoSection): string {
    return section.monthYear;
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
          // NOW we can get the actual scroll container width
          let actualContainerWidth = container.offsetWidth;
          
          // Fallback if container width is still 0 (shouldn't happen now but just in case)
          if (actualContainerWidth === 0) {
            const photoContainer = document.querySelector('.photo-container');
            actualContainerWidth = photoContainer ? photoContainer.clientWidth : window.innerWidth;
          }
          
          this.scrollContainerWidth = actualContainerWidth;
          this.virtualContentWidth = this.allPhotosFlat.length * actualContainerWidth;
          
          
          // Initialize visible photos with correct width
          await this.updateVisiblePhotos(actualContainerWidth);
          
          // Disable smooth scrolling AND scroll snap for instant positioning
          container.style.scrollBehavior = 'auto';
          container.style.scrollSnapType = 'none';
          
          // Scroll to current photo position using the correct width
          const targetScroll = this.currentPhotoIndex * actualContainerWidth;
          container.scrollLeft = targetScroll;
          
          // Wait a bit to ensure scroll has taken effect
          setTimeout(() => {
            // Show the scrollable view FIRST while keeping single photo visible
            this.showScrollablePhotos = true;
            
            // Then hide the single photo view after a brief moment to ensure overlap
            setTimeout(() => {
              // Re-enable smooth scrolling and scroll snap
              container.style.scrollBehavior = 'smooth';
              container.style.scrollSnapType = 'x mandatory';
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
      this.updateVisiblePhotos(containerWidth);
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

    // We'll calculate the actual container width later when we position the scroll
    // For now, just use a placeholder that will be updated
    this.scrollContainerWidth = 0;
    this.virtualContentWidth = 0;
    
    
    // Cache the current photo
    const currentPhoto = this.allPhotosFlat[this.currentPhotoIndex];
    if (currentPhoto && this.openingPhotoDataUrl) {
      this.photoCache.set(currentPhoto.id, this.openingPhotoDataUrl);
    }
    
    // We'll initialize visible photos in positionScrollContainer with correct width
  }
  
  private async updateVisiblePhotos(containerWidth: number) {
    const newVisiblePhotos: typeof this.visiblePhotos = [];
    
    // Ensure we use the correct container width
    if (!containerWidth || containerWidth === 0) {
      const photoContainer = document.querySelector('.photo-container');
      containerWidth = photoContainer ? photoContainer.clientWidth : window.innerWidth;
    }
    
    
    // Load current photo and its neighbors
    for (let offset = -1; offset <= 1; offset++) {
      const index = this.currentPhotoIndex + offset;
      if (index >= 0 && index < this.allPhotosFlat.length) {
        const photo = this.allPhotosFlat[index];
        const position = index * containerWidth;
        
        
        // Check cache first
        let dataUrl = this.photoCache.get(photo.id);
        if (!dataUrl) {
          const loadedUrl = await this.cameraService.getPhotoDataUrl(photo);
          if (loadedUrl) {
            dataUrl = loadedUrl;
            this.photoCache.set(photo.id, dataUrl);
          }
        }
        
        newVisiblePhotos.push({
          photo,
          dataUrl: dataUrl || null,
          position
        });
      }
    }
    
    this.visiblePhotos = newVisiblePhotos;
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
