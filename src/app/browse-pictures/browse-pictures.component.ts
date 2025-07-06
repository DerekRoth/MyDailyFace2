import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService, CameraPhoto } from '../services/camera.service';

interface PhotoSection {
  monthYear: string;
  displayName: string;
  photos: CameraPhoto[];
}

@Component({
  selector: 'app-browse-pictures',
  imports: [CommonModule],
  templateUrl: './browse-pictures.component.html',
  styleUrl: './browse-pictures.component.css'
})
export class BrowsePicturesComponent implements OnInit {
  photos: CameraPhoto[] = [];
  photoSections: PhotoSection[] = [];
  photoDataUrls: Map<string, string> = new Map();
  isLoading = true;
  selectedPhoto: CameraPhoto | null = null;
  selectedPhotoDataUrl: string | null = null;
  showDeleteConfirm = false;
  photoToDelete: CameraPhoto | null = null;

  constructor(private cameraService: CameraService) {}

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

  async openPhoto(photo: CameraPhoto) {
    this.selectedPhoto = photo;
    this.selectedPhotoDataUrl = await this.cameraService.getPhotoDataUrl(photo);
  }

  closePhoto() {
    this.selectedPhoto = null;
    this.selectedPhotoDataUrl = null;
  }

  confirmDeletePhoto(photo: CameraPhoto, event: Event) {
    event.stopPropagation(); // Prevent opening the photo
    this.photoToDelete = photo;
    this.showDeleteConfirm = true;
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
      
      // Close photo if it's currently selected
      if (this.selectedPhoto?.id === this.photoToDelete.id) {
        this.closePhoto();
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
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
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
  }

  private formatMonthYear(monthYear: string): string {
    const [year, month] = monthYear.split('-').map(Number);
    const date = new Date(year, month - 1);
    const now = new Date();
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    if (year === now.getFullYear()) {
      return monthNames[month - 1];
    } else {
      return `${monthNames[month - 1]} ${year}`;
    }
  }
}
