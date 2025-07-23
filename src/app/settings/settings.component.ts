import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd, RouterLink } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CameraService } from '../services/camera.service';
import { GoogleDriveService, SyncStatus } from '../services/google-drive.service';
import { TestDataGeneratorService } from '../services/test-data-generator.service';
import { PwaInstallService } from '../services/pwa-install.service';
import { ThemeService, ThemePreference } from '../services/theme.service';
import { LocaleService, SupportedLanguage } from '../services/locale.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { ErrorTrackerService, ErrorEntry } from '../services/error-tracker.service';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit, OnDestroy, AfterViewInit {
  photoCount = 0;
  syncStatus: SyncStatus = {
    isAuthenticated: false,
    isEnabled: false,
    lastSync: null,
    totalPhotos: 0,
    syncedPhotos: 0,
    isSyncing: false,
    error: null
  };
  
  // Google Drive configuration status
  isGoogleDriveConfigured = false;
  
  // Hidden testing features
  showTestingFeatures = false;
  versionTapCount = 0;
  isGeneratingTestData = false;
  currentAnimationSpeed = 1;
  
  // Overlay settings
  overlayOpacity = 0.5;
  
  // Alignment overlay settings
  eyeLinePosition = 40; // Percentage from top
  mouthLinePosition = 70; // Percentage from top
  
  // Alignment configuration modal
  showAlignmentConfig = false;
  latestPhotoUrl: string | null = null;
  isDragging = false;
  dragType: 'eye' | 'mouth' | null = null;
  
  // Error tracking
  showErrorOverlay = false;
  errors: ErrorEntry[] = [];
  
  // PWA installation
  canInstall = false;
  isInstalled = false;
  showInstallInstructions = false;
  installInstructions: { platform: string; instructions: string[] } = { platform: '', instructions: [] };
  
  // Theme settings
  currentThemePreference: ThemePreference = 'system';
  
  // Language settings
  currentLanguage = '';
  supportedLanguages: SupportedLanguage[] = [];
  
  private destroy$ = new Subject<void>();

  constructor(
    private cameraService: CameraService,
    private router: Router,
    private googleDriveService: GoogleDriveService,
    private testDataGenerator: TestDataGeneratorService,
    private pwaInstallService: PwaInstallService,
    private themeService: ThemeService,
    private localeService: LocaleService,
    private cdr: ChangeDetectorRef,
    private errorTracker: ErrorTrackerService
  ) {
    // Initialize language settings immediately
    this.supportedLanguages = this.localeService.supportedLanguages;
    this.currentLanguage = this.localeService.currentLanguage;
  }

  ngOnInit() {
    this.updatePhotoCount();
    
    // Check if Google Drive is configured
    this.isGoogleDriveConfigured = this.googleDriveService.isConfigured();
    
    // Load current animation speed
    this.currentAnimationSpeed = this.testDataGenerator.getAnimationSpeed();
    
    // Load overlay settings
    this.loadOverlaySettings();
    this.loadAlignmentOverlaySettings();
    
    // Load latest photo for alignment configuration
    this.loadLatestPhotoForAlignment();
    
    // Load debug menu visibility state
    const savedDebugVisibility = localStorage.getItem('showTestingFeatures');
    if (savedDebugVisibility === 'true') {
      this.showTestingFeatures = true;
    }
    
    // Subscribe to sync status updates
    this.googleDriveService.syncStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.syncStatus = status;
      });

    // Subscribe to PWA installation status
    this.pwaInstallService.canInstall
      .pipe(takeUntil(this.destroy$))
      .subscribe(canInstall => {
        this.canInstall = canInstall;
      });

    this.pwaInstallService.isInstalled
      .pipe(takeUntil(this.destroy$))
      .subscribe(isInstalled => {
        this.isInstalled = isInstalled;
      });

    // Get installation instructions
    this.installInstructions = this.pwaInstallService.getInstallInstructions();
    
    // Load theme preference
    this.currentThemePreference = this.themeService.getCurrentPreference();
    
    // Subscribe to language changes
    this.localeService.currentLanguage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(language => {
        this.currentLanguage = language;
        this.cdr.detectChanges(); // Force change detection
      });
    
    // Subscribe to error tracking
    this.errorTracker.errors
      .pipe(takeUntil(this.destroy$))
      .subscribe(errors => {
        this.errors = errors;
      });

    // Subscribe to overlay visibility
    this.errorTracker.overlayVisible
      .pipe(takeUntil(this.destroy$))
      .subscribe(visible => {
        this.showErrorOverlay = visible;
      });
    
    // Update photo count when navigating to settings
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        if (event.url === '/settings') {
          this.updatePhotoCount();
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit() {
    // Set initial slider progress
    const sliderElement = document.querySelector('.opacity-slider') as HTMLInputElement;
    if (sliderElement) {
      const progressPercent = ((this.overlayOpacity - 0.1) / (1 - 0.1)) * 100;
      sliderElement.style.setProperty('--slider-progress', `${progressPercent}%`);
    }
  }

  async updatePhotoCount() {
    this.photoCount = await this.cameraService.getPhotoCount();
  }

  async clearAllPhotos() {
    if (confirm(this.localeService.getTranslation('settings.confirm_delete_all_photos'))) {
      await this.cameraService.deleteAllPhotos();
      await this.updatePhotoCount();
    }
  }

  // Google Drive Methods
  async connectGoogleDrive() {
    if (!this.isGoogleDriveConfigured) {
      alert(this.localeService.getTranslation('settings.alert_google_drive_not_configured'));
      return;
    }

    try {
      const success = await this.googleDriveService.signIn();
      if (success) {
        alert(this.localeService.getTranslation('settings.alert_google_drive_connected'));
      } else {
        alert(this.localeService.getTranslation('settings.alert_google_drive_connection_failed'));
      }
    } catch (error) {
      console.error('Google Drive connection error:', error);
      alert(this.localeService.getTranslation('settings.alert_google_drive_connection_error'));
    }
  }

  async disconnectGoogleDrive() {
    if (confirm(this.localeService.getTranslation('settings.confirm_disconnect_google_drive'))) {
      await this.googleDriveService.signOut();
      this.toggleAutoSync(false);
    }
  }

  onAutoSyncToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    this.toggleAutoSync(target.checked);
  }

  toggleAutoSync(enabled: boolean) {
    this.googleDriveService.enableAutoSync(enabled);
  }

  async forceSync() {
    if (!this.syncStatus.isAuthenticated) {
      alert(this.localeService.getTranslation('settings.alert_connect_google_drive_first'));
      return;
    }

    try {
      await this.googleDriveService.forceSync();
      alert(this.localeService.getTranslation('settings.alert_force_sync_completed'));
    } catch (error) {
      console.error('Force sync failed:', error);
      alert(this.localeService.getTranslation('settings.alert_force_sync_failed'));
    }
  }

  async syncAllPhotos() {
    if (!this.syncStatus.isAuthenticated) {
      alert(this.localeService.getTranslation('settings.alert_connect_google_drive_first'));
      return;
    }

    if (confirm(this.localeService.getTranslation('settings.confirm_sync_all_photos'))) {
      try {
        // Update sync status to show syncing
        this.googleDriveService['updateSyncStatus']({ isSyncing: true });
        
        const result = await this.cameraService.syncAllPhotosToGoogleDrive();
        
        this.googleDriveService['updateSyncStatus']({ 
          isSyncing: false,
          lastSync: new Date(),
          error: null
        });
        
        const template = this.localeService.getTranslation('settings.alert_sync_completed');
        const failedText = result.failed > 0 ? ` ${result.failed} photos failed.` : '';
        alert(template.replace('{success}', result.success.toString()).replace('{failed}', failedText));
      } catch (error) {
        console.error('Sync failed:', error);
        this.googleDriveService['updateSyncStatus']({ 
          isSyncing: false,
          error: error instanceof Error ? error.message : 'Sync failed'
        });
        alert(this.localeService.getTranslation('settings.alert_sync_failed'));
      }
    }
  }

  // Hidden testing features
  onVersionTap() {
    this.versionTapCount++;
    
    if (this.versionTapCount >= 7) {
      this.showTestingFeatures = true;
      this.versionTapCount = 0;
      // Save debug visibility state
      localStorage.setItem('showTestingFeatures', 'true');
      // Start error tracking when debug mode is enabled
      this.errorTracker.startTracking();
      alert(this.localeService.getTranslation('settings.alert_testing_features_unlocked'));
    }
    
    // Reset counter after 3 seconds of no taps
    setTimeout(() => {
      if (this.versionTapCount < 7) {
        this.versionTapCount = 0;
      }
    }, 3000);
  }

  async generateTestData() {
    if (this.isGeneratingTestData) return;
    
    const confirmed = confirm(this.localeService.getTranslation('settings.confirm_generate_test_data'));
    
    if (!confirmed) return;
    
    this.isGeneratingTestData = true;
    
    try {
      console.log('🧪 Starting test data generation...');
      const startTime = Date.now();
      
      const result = await this.testDataGenerator.generateTestData();
      
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      await this.updatePhotoCount();
      
      const template = this.localeService.getTranslation('settings.alert_test_data_generation_complete');
      alert(template
        .replace('{success}', result.success.toString())
        .replace('{failed}', result.failed.toString())
        .replace('{duration}', duration.toString()));
      
      console.log('🧪 Test data generation completed:', result);
    } catch (error) {
      console.error('Test data generation failed:', error);
      alert(this.localeService.getTranslation('settings.alert_test_data_clear_failed'));
    } finally {
      this.isGeneratingTestData = false;
    }
  }

  async clearTestData() {
    const confirmed = confirm(this.localeService.getTranslation('settings.confirm_clear_test_data'));
    
    if (!confirmed) return;
    
    try {
      await this.testDataGenerator.clearTestData();
      await this.updatePhotoCount();
      alert(this.localeService.getTranslation('settings.alert_test_data_cleared'));
    } catch (error) {
      console.error('Error clearing test data:', error);
      alert(this.localeService.getTranslation('settings.alert_test_data_clear_failed'));
    }
  }

  hideTestingFeatures() {
    this.showTestingFeatures = false;
    this.showErrorOverlay = false;
    this.versionTapCount = 0;
    // Stop error tracking when debug mode is disabled
    this.errorTracker.stopTracking();
    // Save debug visibility state
    localStorage.setItem('showTestingFeatures', 'false');
  }

  setAnimationSpeed(multiplier: number) {
    this.currentAnimationSpeed = multiplier;
    this.testDataGenerator.setAnimationSpeed(multiplier);
  }

  resetAnimationSpeed() {
    this.currentAnimationSpeed = 1;
    this.testDataGenerator.resetAnimationSpeed();
  }

  getAnimationSpeedText(): string {
    if (this.currentAnimationSpeed === 1) {
      return this.localeService.getTranslation('settings.animation_speed_normal');
    }
    return this.localeService.getTranslation('settings.animation_speed_slower').replace('{speed}', this.currentAnimationSpeed.toString());
  }

  // Error tracking methods
  toggleErrorOverlay() {
    this.errorTracker.toggleOverlay();
  }

  clearErrors() {
    this.errorTracker.clearErrors();
  }

  formatErrorTime(timestamp: Date): string {
    return timestamp.toLocaleTimeString();
  }

  getErrorTypeClass(type: string): string {
    switch (type) {
      case 'error': return 'error-type-error';
      case 'warn': return 'error-type-warn';
      case 'log': return 'error-type-log';
      default: return '';
    }
  }

  trackByErrorIndex(index: number): number {
    return index;
  }

  getLastSyncText(): string {
    if (this.syncStatus.lastSync) {
      const template = this.localeService.getTranslation('settings.last_sync');
      const dateStr = this.syncStatus.lastSync.toLocaleString();
      return template.replace('{date}', dateStr);
    }
    return '';
  }

  getOverlayOpacityText(): string {
    const template = this.localeService.getTranslation('settings.overlay_opacity_description');
    const opacityPercent = (this.overlayOpacity * 100).toFixed(0);
    return template.replace('{opacity}', opacityPercent);
  }

  getPhotosStoredText(): string {
    const template = this.localeService.getTranslation('settings.photos_saved_locally');
    return template.replace('{count}', this.photoCount.toString());
  }

  getAnimationSpeedDescriptionText(): string {
    const template = this.localeService.getTranslation('settings.animation_speed_description');
    return template.replace('{speed}', this.getAnimationSpeedText());
  }

  private loadOverlaySettings() {
    const savedOpacity = localStorage.getItem('overlayOpacity');
    if (savedOpacity) {
      this.overlayOpacity = parseFloat(savedOpacity);
    }
  }

  private loadAlignmentOverlaySettings() {
    const savedEyePosition = localStorage.getItem('alignmentEyeLinePosition');
    if (savedEyePosition) {
      this.eyeLinePosition = parseFloat(savedEyePosition);
    }
    
    const savedMouthPosition = localStorage.getItem('alignmentMouthLinePosition');
    if (savedMouthPosition) {
      this.mouthLinePosition = parseFloat(savedMouthPosition);
    }
  }

  onOverlayOpacityChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.overlayOpacity = parseFloat(target.value);
    localStorage.setItem('overlayOpacity', this.overlayOpacity.toString());
    
    // Update the visual progress indicator
    const progressPercent = ((this.overlayOpacity - 0.1) / (1 - 0.1)) * 100;
    target.style.setProperty('--slider-progress', `${progressPercent}%`);
  }


  // Alignment configuration methods
  async showAlignmentConfiguration() {
    // Reload the latest photo in case it changed
    await this.loadLatestPhotoForAlignment();
    this.showAlignmentConfig = true;
  }

  closeAlignmentConfiguration() {
    this.showAlignmentConfig = false;
    this.isDragging = false;
    this.dragType = null;
  }

  async loadLatestPhotoForAlignment() {
    try {
      const photos = await this.cameraService.getStoredPhotos();
      if (photos.length > 0) {
        const latestPhoto = photos[0];
        this.latestPhotoUrl = await this.cameraService.getPhotoDataUrl(latestPhoto);
      }
    } catch (error) {
      console.error('Error loading latest photo for alignment configuration:', error);
    }
  }

  startDragLine(event: MouseEvent | TouchEvent, lineType: 'eye' | 'mouth') {
    event.preventDefault();
    this.isDragging = true;
    this.dragType = lineType;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!this.isDragging || !this.dragType) return;

      const previewContainer = document.querySelector('.alignment-preview') as HTMLElement;
      if (!previewContainer) return;

      const rect = previewContainer.getBoundingClientRect();
      let clientY: number;

      if (moveEvent instanceof MouseEvent) {
        clientY = moveEvent.clientY;
      } else {
        clientY = moveEvent.touches[0].clientY;
      }

      const y = clientY - rect.top;
      const percentage = Math.max(0, Math.min(100, (y / rect.height) * 100));

      // Apply constraints based on line type
      if (this.dragType === 'eye') {
        this.eyeLinePosition = Math.max(10, Math.min(70, percentage));
      } else if (this.dragType === 'mouth') {
        this.mouthLinePosition = Math.max(30, Math.min(90, percentage));
      }
    };

    const handleEnd = () => {
      this.isDragging = false;
      this.dragType = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
  }

  resetToDefaultPositions() {
    this.eyeLinePosition = 40;
    this.mouthLinePosition = 70;
  }

  saveAlignmentConfiguration() {
    localStorage.setItem('alignmentEyeLinePosition', this.eyeLinePosition.toString());
    localStorage.setItem('alignmentMouthLinePosition', this.mouthLinePosition.toString());
    
    // Dispatch storage event to notify the take-picture component
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'alignmentEyeLinePosition',
      newValue: this.eyeLinePosition.toString()
    }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'alignmentMouthLinePosition',
      newValue: this.mouthLinePosition.toString()
    }));
    
    this.closeAlignmentConfiguration();
  }

  // PWA Installation Methods
  async installApp() {
    if (this.canInstall) {
      const success = await this.pwaInstallService.promptInstall();
      if (success) {
        console.log('App installation initiated');
      } else {
        console.log('App installation cancelled by user');
      }
    } else {
      this.showInstallInstructions = true;
    }
  }


  closeInstallInstructions() {
    this.showInstallInstructions = false;
  }

  // Theme Methods
  onThemeChange(preference: ThemePreference) {
    this.currentThemePreference = preference;
    this.themeService.setPreference(preference);
  }

  // Language Methods
  onLanguageChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const languageCode = target.value;
    // Don't update currentLanguage directly - let the subscription handle it
    this.localeService.setLanguage(languageCode);
  }
}
