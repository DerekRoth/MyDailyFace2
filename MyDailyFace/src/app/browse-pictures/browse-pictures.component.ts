import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService, CameraPhoto } from '../services/camera.service';

@Component({
  selector: 'app-browse-pictures',
  imports: [CommonModule],
  templateUrl: './browse-pictures.component.html',
  styleUrl: './browse-pictures.component.css'
})
export class BrowsePicturesComponent implements OnInit {
  photos: CameraPhoto[] = [];
  photoDataUrls: Map<string, string> = new Map();

  constructor(private cameraService: CameraService) {}

  ngOnInit() {
    this.loadPhotos();
  }

  async loadPhotos() {
    this.photos = await this.cameraService.getStoredPhotos();
    
    // Load data URLs for display
    for (const photo of this.photos) {
      const dataUrl = await this.cameraService.getPhotoDataUrl(photo);
      if (dataUrl) {
        this.photoDataUrls.set(photo.id, dataUrl);
      }
    }
  }

  getPhotoDataUrl(photo: CameraPhoto): string | undefined {
    return this.photoDataUrls.get(photo.id);
  }

  openPhoto(photo: CameraPhoto) {
    // Future implementation for viewing full-size photo
    console.log('Opening photo:', photo);
  }
}
