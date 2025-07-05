import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CameraService } from '../services/camera.service';
import { GoogleDriveService, SyncStatus } from '../services/google-drive.service';
import { TestDataGeneratorService } from '../services/test-data-generator.service';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit, OnDestroy {
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
  
  private destroy$ = new Subject<void>();

  constructor(
    private cameraService: CameraService,
    private router: Router,
    private googleDriveService: GoogleDriveService,
    private testDataGenerator: TestDataGeneratorService
  ) {}

  ngOnInit() {
    this.updatePhotoCount();
    
    // Check if Google Drive is configured
    this.isGoogleDriveConfigured = this.googleDriveService.isConfigured();
    
    // Load current animation speed
    this.currentAnimationSpeed = this.testDataGenerator.getAnimationSpeed();
    
    // Subscribe to sync status updates
    this.googleDriveService.syncStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.syncStatus = status;
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

  async updatePhotoCount() {
    this.photoCount = await this.cameraService.getPhotoCount();
  }

  async clearAllPhotos() {
    if (confirm('Are you sure you want to delete all photos? This action cannot be undone.')) {
      await this.cameraService.deleteAllPhotos();
      await this.updatePhotoCount();
    }
  }

  // Google Drive Methods
  async connectGoogleDrive() {
    if (!this.isGoogleDriveConfigured) {
      alert('Google Drive integration not configured. Please contact the app developer.');
      return;
    }

    try {
      const success = await this.googleDriveService.signIn();
      if (success) {
        alert('Successfully connected to Google Drive!');
      } else {
        alert('Failed to connect to Google Drive. Please try again.');
      }
    } catch (error) {
      console.error('Google Drive connection error:', error);
      alert('Error connecting to Google Drive. Please try again later.');
    }
  }

  async disconnectGoogleDrive() {
    if (confirm('Are you sure you want to disconnect from Google Drive?')) {
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

  async syncAllPhotos() {
    if (!this.syncStatus.isAuthenticated) {
      alert('Please connect to Google Drive first');
      return;
    }

    if (confirm('This will upload all your photos to Google Drive. Continue?')) {
      try {
        // Update sync status to show syncing
        this.googleDriveService['updateSyncStatus']({ isSyncing: true });
        
        const result = await this.cameraService.syncAllPhotosToGoogleDrive();
        
        this.googleDriveService['updateSyncStatus']({ 
          isSyncing: false,
          lastSync: new Date(),
          error: null
        });
        
        alert(`Sync completed! ${result.success} photos uploaded successfully.${result.failed > 0 ? ` ${result.failed} photos failed.` : ''}`);
      } catch (error) {
        console.error('Sync failed:', error);
        this.googleDriveService['updateSyncStatus']({ 
          isSyncing: false,
          error: error instanceof Error ? error.message : 'Sync failed'
        });
        alert('Sync failed. Please try again.');
      }
    }
  }

  // Hidden testing features
  onVersionTap() {
    this.versionTapCount++;
    
    if (this.versionTapCount >= 7) {
      this.showTestingFeatures = true;
      this.versionTapCount = 0;
      alert('🧪 Testing features unlocked!');
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
    
    const confirmed = confirm(
      '⚠️ This will generate ~730 test photos (2 years of daily photos). ' +
      'This may take a few minutes and use significant storage space. ' +
      'Continue?'
    );
    
    if (!confirmed) return;
    
    this.isGeneratingTestData = true;
    
    try {
      console.log('🧪 Starting test data generation...');
      const startTime = Date.now();
      
      const result = await this.testDataGenerator.generateTestData();
      
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      await this.updatePhotoCount();
      
      alert(
        `✅ Test data generation complete!\n\n` +
        `📸 ${result.success} photos generated\n` +
        `❌ ${result.failed} failed\n` +
        `⏱️ Duration: ${duration} seconds\n\n` +
        `Go to the Play tab to see your 2-year timeline!`
      );
      
      console.log('🧪 Test data generation completed:', result);
    } catch (error) {
      console.error('Test data generation failed:', error);
      alert('❌ Test data generation failed. Check console for details.');
    } finally {
      this.isGeneratingTestData = false;
    }
  }

  async clearTestData() {
    const confirmed = confirm(
      '⚠️ This will delete all test-generated photos (keeping real photos). ' +
      'Continue?'
    );
    
    if (!confirmed) return;
    
    try {
      await this.testDataGenerator.clearTestData();
      await this.updatePhotoCount();
      alert('✅ Test data cleared successfully!');
    } catch (error) {
      console.error('Error clearing test data:', error);
      alert('❌ Failed to clear test data. Check console for details.');
    }
  }

  hideTestingFeatures() {
    this.showTestingFeatures = false;
    this.versionTapCount = 0;
  }

  setAnimationSpeed(multiplier: number) {
    this.currentAnimationSpeed = multiplier;
    this.testDataGenerator.setAnimationSpeed(multiplier);
    
    const speedText = multiplier === 1 ? 'Normal' : `${multiplier}x slower`;
    alert(`🎬 Animation speed set to: ${speedText}`);
  }

  resetAnimationSpeed() {
    this.currentAnimationSpeed = 1;
    this.testDataGenerator.resetAnimationSpeed();
    alert('🎬 Animation speed reset to normal');
  }

  getAnimationSpeedText(): string {
    if (this.currentAnimationSpeed === 1) return 'Normal';
    return `${this.currentAnimationSpeed}x slower`;
  }
}
