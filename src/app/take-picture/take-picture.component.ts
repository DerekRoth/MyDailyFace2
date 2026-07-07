import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CameraService, CameraPhoto } from '../services/camera.service';
import { CameraStreamService } from '../services/camera-stream.service';
import { TestDataGeneratorService } from '../services/test-data-generator.service';
import { CaptureSettingsService } from '../services/capture-settings.service';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocaleService } from '../services/locale.service';

@Component({
  selector: 'app-take-picture',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './take-picture.component.html',
  styleUrl: './take-picture.component.css'
})
export class TakePictureComponent implements OnInit, OnDestroy {
  @ViewChild('video', { static: false }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: false }) canvasElement!: ElementRef<HTMLCanvasElement>;
  @ViewChild('freezeFrame', { static: false }) freezeFrameElement!: ElementRef<HTMLDivElement>;

  isStreaming = false;
  videoReady = false;
  isTakingPicture = false;
  error: string | null = null;

  // Overlay feature
  showOverlay = false;
  overlayImageUrl: string | null = null;
  overlayOpacity = 0.5; // Default opacity

  // Alignment guides overlay
  showAlignmentGuides = false;
  eyeLinePosition = 40; // Default percentage from top
  mouthLinePosition = 70; // Default percentage from top

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

  private destroy$ = new Subject<void>();
  private pendingTimeouts: number[] = [];
  private jumpAnimation: Animation | null = null;

  constructor(
    private cameraService: CameraService,
    private cameraStreamService: CameraStreamService,
    private router: Router,
    private testDataGenerator: TestDataGeneratorService,
    private captureSettings: CaptureSettingsService,
    private localeService: LocaleService
  ) {}

  ngOnInit() {
    this.initializeCamera();
    this.loadLatestPhoto();
    this.subscribeToCaptureSettings();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    for (const id of this.pendingTimeouts) {
      clearTimeout(id);
    }
    this.pendingTimeouts = [];
    this.jumpAnimation?.cancel();
    this.jumpAnimation = null;
    this.cameraStreamService.pauseStream();
  }

  private schedule(callback: () => void, delay: number): void {
    this.pendingTimeouts.push(window.setTimeout(callback, delay));
  }

  async initializeCamera() {
    try {
      const stream = await this.cameraStreamService.getStream();

      if (this.videoElement) {
        const video = this.videoElement.nativeElement;
        video.srcObject = stream;
        this.isStreaming = true;
        this.error = null;

        // Listen for when video is actually playing and has dimensions.
        // once:true so a retry doesn't stack a duplicate listener
        video.addEventListener('playing', () => {
          this.videoReady = true;
        }, { once: true });

        // Also handle case where video might already be playing
        if (video.readyState >= 3) { // HAVE_FUTURE_DATA or greater
          this.videoReady = true;
        }
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      this.error = this.localeService.getTranslation('take_picture.camera_access_error');
    }
  }

  async takePicture() {
    if (!this.cameraStreamService.hasStream() || this.isTakingPicture) return;

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
      this.schedule(() => {
        this.showFlash = false;
      }, this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.FLASH_DURATION));

      // 4. Save the actual photo (unmirrored) in background
      const photo = await this.cameraService.takePictureFromVideo(video);

      if (photo) {
        // Update overlay with the new latest photo
        this.overlayImageUrl = await this.cameraService.getPhotoDataUrl(photo);
        // 5. Start animation to Browse tab after user sees freeze frame
        this.schedule(() => {
          this.animateToBottomNav();
        }, this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.ANIMATION_START_TIME));

        // 6. Reset state after animation completes (no navigation).
        // isTakingPicture stays true until here — releasing it earlier lets a
        // second tap start a capture that fights this one's animation timeouts
        this.schedule(() => {
          this.resetAnimationState();
        }, this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.NAVIGATION_TIME));
      } else {
        this.error = this.localeService.getTranslation('take_picture.save_error');
        this.resetAnimationState();
      }

    } catch (error) {
      console.error('Error taking picture:', error);
      this.error = this.localeService.getTranslation('take_picture.capture_error');
      this.resetAnimationState();
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
    this.jumpAnimation = null;
    this.isTakingPicture = false;
  }

  private animateToBottomNav() {
    // Small delay to ensure freeze frame is rendered
    this.schedule(() => {
      // Get the Browse navigation item position
      const browseNavItem = document.querySelector('.bottom-navigation .nav-item:nth-child(2)');
      if (!browseNavItem || !this.freezeFrameElement || !this.videoElement) {
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

      // Mark animation as started; keep a handle so ngOnDestroy can cancel it
      this.jumpAnimation = animation;
      this.animatingToBrowse = true;
    }, this.testDataGenerator.getAdjustedTimeout(this.ANIMATION_TIMINGS.DOM_READY_DELAY));
  }

  toggleOverlay() {
    this.showOverlay = !this.showOverlay;
    // Save the user's choice
    localStorage.setItem('overlayEnabled', this.showOverlay.toString());
  }

  toggleAlignmentGuides() {
    this.captureSettings.setAlignmentGuidesEnabled(!this.showAlignmentGuides);
  }

  private async loadLatestPhoto() {
    try {
      const latestPhoto = await this.cameraService.getLatestPhoto();
      if (latestPhoto) {
        this.overlayImageUrl = await this.cameraService.getPhotoDataUrl(latestPhoto);

        // Initialize overlay visibility based on saved preference or default to enabled
        this.initializeOverlayVisibility();
      }
    } catch (error) {
      console.error('Error loading latest photo for overlay:', error);
    }
  }

  private subscribeToCaptureSettings() {
    this.captureSettings.overlayOpacity$
      .pipe(takeUntil(this.destroy$))
      .subscribe(opacity => this.overlayOpacity = opacity);

    this.captureSettings.alignmentGuidesEnabled$
      .pipe(takeUntil(this.destroy$))
      .subscribe(enabled => this.showAlignmentGuides = enabled);

    this.captureSettings.eyeLinePosition$
      .pipe(takeUntil(this.destroy$))
      .subscribe(position => this.eyeLinePosition = position);

    this.captureSettings.mouthLinePosition$
      .pipe(takeUntil(this.destroy$))
      .subscribe(position => this.mouthLinePosition = position);
  }

  private initializeOverlayVisibility() {
    const savedOverlayEnabled = localStorage.getItem('overlayEnabled');
    
    if (savedOverlayEnabled !== null) {
      // Use saved preference
      this.showOverlay = savedOverlayEnabled === 'true';
    } else {
      // Default to enabled if there's at least one photo
      this.showOverlay = this.overlayImageUrl !== null;
    }
  }

  // Helper methods for i18n
  getOverlayAltText(): string {
    return this.localeService.getTranslation('take_picture.overlay_alt');
  }

  getToggleTooltip(): string {
    return this.localeService.getTranslation('take_picture.toggle_tooltip');
  }

  getAlignmentGuidesTooltip(): string {
    return this.localeService.getTranslation('take_picture.alignment_guides_tooltip');
  }

  getCapturedPhotoAltText(): string {
    return this.localeService.getTranslation('take_picture.captured_photo_alt');
  }
}
