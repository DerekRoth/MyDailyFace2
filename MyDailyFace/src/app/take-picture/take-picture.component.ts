import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CameraService, CameraPhoto } from '../services/camera.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-take-picture',
  imports: [CommonModule],
  templateUrl: './take-picture.component.html',
  styleUrl: './take-picture.component.css'
})
export class TakePictureComponent implements OnInit, OnDestroy {
  @ViewChild('video', { static: false }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: false }) canvasElement!: ElementRef<HTMLCanvasElement>;

  isStreaming = false;
  isTakingPicture = false;
  error: string | null = null;
  lastPhoto: CameraPhoto | null = null;
  lastPhotoDataUrl: string | null = null;
  private stream: MediaStream | null = null;

  constructor(private cameraService: CameraService) {}

  ngOnInit() {
    this.initializeCamera();
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async initializeCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });

      if (this.videoElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
        this.isStreaming = true;
        this.error = null;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      this.error = 'Unable to access camera. Please ensure camera permissions are granted.';
    }
  }

  async takePicture() {
    if (!this.stream || this.isTakingPicture) return;

    this.isTakingPicture = true;
    
    try {
      const video = this.videoElement.nativeElement;
      const photo = await this.cameraService.takePictureFromVideo(video);
      
      if (photo) {
        this.lastPhoto = photo;
        
        // Get the data URL for display
        this.lastPhotoDataUrl = await this.cameraService.getPhotoDataUrl(photo);
        
        setTimeout(() => {
          this.lastPhoto = null;
          this.lastPhotoDataUrl = null;
        }, 3000);
      } else {
        this.error = 'Failed to save picture. Please try again.';
      }

    } catch (error) {
      console.error('Error taking picture:', error);
      this.error = 'Failed to take picture. Please try again.';
    } finally {
      this.isTakingPicture = false;
    }
  }

  private stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.isStreaming = false;
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
