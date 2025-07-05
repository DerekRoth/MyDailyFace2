import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService, CameraPhoto } from '../services/camera.service';

@Component({
  selector: 'app-play',
  imports: [CommonModule],
  templateUrl: './play.component.html',
  styleUrl: './play.component.css'
})
export class PlayComponent implements OnInit, OnDestroy {
  photos: CameraPhoto[] = [];
  currentPhotoIndex = 0;
  currentPhotoUrl: string | null = null;
  isPlaying = false;
  intervalId: any = null;
  
  // Slideshow settings
  readonly FPS = 10;
  readonly INTERVAL_MS = 1000 / this.FPS; // 100ms for 10 FPS

  constructor(private cameraService: CameraService) {}

  async ngOnInit() {
    await this.loadPhotos();
  }

  ngOnDestroy() {
    this.stopSlideshow();
  }

  async loadPhotos() {
    try {
      this.photos = await this.cameraService.getStoredPhotos();
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
    if (index >= 0 && index < this.photos.length) {
      this.currentPhotoIndex = index;
      this.currentPhotoUrl = await this.cameraService.getPhotoDataUrl(this.photos[index]);
    }
  }

  async startSlideshow() {
    if (this.photos.length === 0) return;
    
    this.isPlaying = true;
    this.currentPhotoIndex = 0;
    await this.displayPhoto(0);
    
    this.intervalId = setInterval(async () => {
      this.currentPhotoIndex++;
      
      if (this.currentPhotoIndex >= this.photos.length) {
        // Loop back to the beginning
        this.currentPhotoIndex = 0;
      }
      
      await this.displayPhoto(this.currentPhotoIndex);
    }, this.INTERVAL_MS);
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

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getProgressPercentage(): number {
    if (this.photos.length === 0) return 0;
    if (this.photos.length === 1) return 0;
    return (this.currentPhotoIndex / (this.photos.length - 1)) * 100;
  }
}