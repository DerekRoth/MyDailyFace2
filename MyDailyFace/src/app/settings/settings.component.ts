import { Component, OnInit } from '@angular/core';
import { CameraService } from '../services/camera.service';

@Component({
  selector: 'app-settings',
  imports: [],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit {
  photoCount = 0;

  constructor(private cameraService: CameraService) {}

  ngOnInit() {
    this.updatePhotoCount();
  }

  async updatePhotoCount() {
    this.photoCount = await this.cameraService.getPhotoCount();
  }

  async clearAllPhotos() {
    if (confirm('Are you sure you want to delete all photos? This action cannot be undone.')) {
      await this.cameraService.deleteAllPhotos();
      await this.updatePhotoCount();
    }
  }
}
