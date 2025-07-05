import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CameraService, CameraPhoto } from '../services/camera.service';
import { TestDataGeneratorService } from '../services/test-data-generator.service';
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
  @ViewChild('freezeFrame', { static: false }) freezeFrameElement!: ElementRef<HTMLDivElement>;

  isStreaming = false;
  isTakingPicture = false;
  error: string | null = null;

  // Animation timing configuration (all times in milliseconds)
  private readonly ANIMATION_TIMINGS = {
    FLASH_DURATION: 500,              // How long the white flash shows
    FREEZE_FRAME_VIEW_TIME: 500,      // How long user sees the freeze frame before animation
    JUMP_ANIMATION_DURATION: 1000,     // Duration of the jump-to-browse animation
    DOM_READY_DELAY: 50,              // Small delay to ensure DOM elements are ready
    // Calculated timings
    get ANIMATION_START_TIME() {      // When to start the jump animation
      return this.FLASH_DURATION + this.FREEZE_FRAME_VIEW_TIME;
    },
    get NAVIGATION_TIME() {           // When to navigate to browse page
      return this.ANIMATION_START_TIME + this.JUMP_ANIMATION_DURATION;
    }
  };

  // Animation states
  showFlash = false;
  showFreezeFrame = false;
  animatingToBrowse = false;
  freezeFrameUrl: string | null = null;

  private stream: MediaStream | null = null;

  constructor(
    private cameraService: CameraService,
    private router: Router,
    private testDataGenerator: TestDataGeneratorService
  ) {}

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

      // 1. Capture freeze frame (mirrored like the video)
      const freezeFrame = this.captureVideoFrame(video, true); // true = mirrored
      this.freezeFrameUrl = freezeFrame;

      // 2. Show freeze frame immediately (hidden behind flash)
      this.showFreezeFrame = true;

      // 3. Show flash effect (starts at full brightness)
      this.showFlash = true;
      setTimeout(() => {
        this.showFlash = false;
      }, this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.FLASH_DURATION));

      // 4. Save the actual photo (unmirrored) in background
      const photo = await this.cameraService.takePictureFromVideo(video);

      if (photo) {
        // 5. Start animation to Browse tab after user sees freeze frame
        setTimeout(() => {
          this.animateToBottomNav();
        }, this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.ANIMATION_START_TIME));

        // 6. Reset state after animation completes (no navigation)
        setTimeout(() => {
          this.resetAnimationState();
        }, this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.NAVIGATION_TIME));
      } else {
        this.error = 'Failed to save picture. Please try again.';
        this.resetAnimationState();
      }

    } catch (error) {
      console.error('Error taking picture:', error);
      this.error = 'Failed to take picture. Please try again.';
      this.resetAnimationState();
    } finally {
      this.isTakingPicture = false;
    }
  }

  private captureVideoFrame(video: HTMLVideoElement, mirrored: boolean = false): string {
    const canvas = this.canvasElement.nativeElement;
    const context = canvas.getContext('2d')!;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (mirrored) {
      // Mirror the canvas for freeze frame (same as video display)
      context.scale(-1, 1);
      context.translate(-canvas.width, 0);
    }

    context.drawImage(video, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.8);
  }

  private resetAnimationState() {
    this.showFlash = false;
    this.showFreezeFrame = false;
    this.animatingToBrowse = false;
    this.freezeFrameUrl = null;
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

  private animateToBottomNav() {
    // Small delay to ensure freeze frame is rendered
    setTimeout(() => {
      // Get the Browse navigation item position
      const browseNavItem = document.querySelector('.bottom-navigation .nav-item:nth-child(2)');
      if (!browseNavItem || !this.freezeFrameElement) {
        // Fallback if elements not found
        this.resetAnimationState();
        return;
      }

      const freezeFrame = this.freezeFrameElement.nativeElement;
      const browseRect = browseNavItem.getBoundingClientRect();
      const freezeRect = freezeFrame.getBoundingClientRect();

      // Calculate the center positions
      const browseCenterX = browseRect.left + browseRect.width / 2;
      const browseCenterY = browseRect.top + browseRect.height / 2;
      const freezeCenterX = freezeRect.left + freezeRect.width / 2;
      const freezeCenterY = freezeRect.top + freezeRect.height / 2;

      // Calculate total translation needed
      const totalTranslateX = browseCenterX - freezeCenterX;
      const totalTranslateY = browseCenterY - freezeCenterY;

      // Calculate target scale (Browse icon size ~40px)
      const targetSize = 40;
      const targetScale = Math.min(targetSize / freezeRect.width, targetSize / freezeRect.height);

      // Animation duration with speed multiplier
      const duration = this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.JUMP_ANIMATION_DURATION);

      // Use Web Animations API for smooth animation
      const animation = freezeFrame.animate([
        // Keyframe 0: Start position
        {
          transform: 'translate(0, 0) scale(1)',
          opacity: '1',
          borderRadius: '0',
          zIndex: '5'
        },
        // Keyframe 1: Jump up (30% through animation)
        {
          transform: `translate(${totalTranslateX * 0.3}px, ${totalTranslateY * 0.3 - 100}px) scale(0.6)`,
          opacity: '1',
          borderRadius: '12px',
          zIndex: '5',
          offset: 0.3
        },
        // Keyframe 2: Final position
        {
          transform: `translate(${totalTranslateX}px, ${totalTranslateY}px) scale(${targetScale})`,
          opacity: '1',
          borderRadius: '50%',
          zIndex: '1'
        }
      ], {
        duration: duration,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'forwards'
      });

      // Mark animation as started
      this.animatingToBrowse = true;

      // Clean up after animation completes
      animation.onfinish = () => {
        // Animation complete - the state reset will happen from the parent setTimeout
      };
    }, this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.DOM_READY_DELAY));
  }
}
