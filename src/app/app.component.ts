import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from './pipes/translate.pipe';
import { ErrorTrackerService, ErrorEntry } from './services/error-tracker.service';
import { CameraStreamService } from './services/camera-stream.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'MyDailyFace';
  
  // Error overlay state
  showErrorOverlay = false;
  errors: ErrorEntry[] = [];
  
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router, 
    private swUpdate: SwUpdate,
    private errorTracker: ErrorTrackerService,
    private cameraStreamService: CameraStreamService
  ) {}

  ngOnInit() {
    // Debug navigation
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe((event: NavigationEnd) => {
        console.log('Navigation to:', event.url);
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

    // Service worker update handling
    this.checkForUpdates();

    // Clean up camera when page is about to unload
    window.addEventListener('beforeunload', () => {
      this.cameraStreamService.stopStream();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    // Clean up camera stream when app is destroyed
    this.cameraStreamService.stopStream();
  }

  private checkForUpdates() {
    if (this.swUpdate.isEnabled) {
      // Check for updates immediately
      this.swUpdate.checkForUpdate().then(() => {
        console.log('Checked for app updates');
      }).catch(err => {
        console.error('Error checking for updates:', err);
      });

      // Check for updates every 30 seconds
      setInterval(() => {
        this.swUpdate.checkForUpdate().then(() => {
          console.log('Periodic update check completed');
        }).catch(err => {
          console.error('Error during periodic update check:', err);
        });
      }, 30000);

      // Handle available updates
      this.swUpdate.versionUpdates.subscribe(event => {
        switch (event.type) {
          case 'VERSION_DETECTED':
            console.log('New version detected, downloading...');
            break;
          case 'VERSION_READY':
            console.log('New version ready, activating...');
            // Activate the new version immediately
            this.swUpdate.activateUpdate().then(() => {
              console.log('App updated successfully, reloading page');
              // Reload the page to use the new version
              window.location.reload();
            }).catch(err => {
              console.error('Error activating update:', err);
            });
            break;
          case 'VERSION_INSTALLATION_FAILED':
            console.error('Failed to install new version');
            break;
        }
      });

      // Handle unrecoverable state
      this.swUpdate.unrecoverable.subscribe(event => {
        console.error('Service worker is in unrecoverable state:', event.reason);
        // Force reload to recover
        window.location.reload();
      });
    }
  }

  onNavClick(route: string) {
    console.log('Nav clicked:', route);
  }

  // Error overlay methods
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
    return `error-type-${type.toLowerCase()}`;
  }

  trackByErrorIndex(index: number): number {
    return index;
  }
}
