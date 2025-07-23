import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from './pipes/translate.pipe';
import { ErrorTrackerService, ErrorEntry } from './services/error-tracker.service';
import { CameraStreamService } from './services/camera-stream.service';
import { OfflineIndicatorComponent } from './components/offline-indicator/offline-indicator.component';
import { AppUpdateService } from './services/app-update.service';
import { OfflineQueueService } from './services/offline-queue.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, CommonModule, OfflineIndicatorComponent],
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
    private cameraStreamService: CameraStreamService,
    private appUpdateService: AppUpdateService,
    private offlineQueueService: OfflineQueueService
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

    // Service worker update handling (using new AppUpdateService)
    // The AppUpdateService handles all update logic now

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
