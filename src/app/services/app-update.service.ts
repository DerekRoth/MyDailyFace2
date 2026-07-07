import { Injectable } from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';

export interface UpdateStatus {
  updateAvailable: boolean;
  isUpdating: boolean;
  updateError: string | null;
  currentVersion: string | null;
  availableVersion: string | null;
  lastCheck: Date | null;
}

@Injectable({
  providedIn: 'root'
})
export class AppUpdateService {
  private updateStatusSubject = new BehaviorSubject<UpdateStatus>({
    updateAvailable: false,
    isUpdating: false,
    updateError: null,
    currentVersion: null,
    availableVersion: null,
    lastCheck: null
  });

  public updateStatus$ = this.updateStatusSubject.asObservable();
  private checkInterval: any = null;
  private readonly CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
  // True once a VERSION_READY event arrived and the update hasn't been applied
  private versionReady = false;

  constructor(private swUpdate: SwUpdate) {
    if (this.swUpdate.isEnabled) {
      this.initializeUpdateChecking();
    }
  }

  private initializeUpdateChecking(): void {
    // Listen for all version events
    this.swUpdate.versionUpdates.subscribe((evt) => {
      switch (evt.type) {
        case 'VERSION_DETECTED':
          // Only detected, not downloaded yet — activateUpdate() would fail,
          // so don't offer the update to the user until VERSION_READY
          console.log('New version detected, downloading...');
          this.updateStatus({ lastCheck: new Date() });
          break;

        case 'VERSION_READY':
          console.log('New version ready');
          this.versionReady = true;
          this.updateStatus({
            updateAvailable: true,
            lastCheck: new Date()
          });
          break;

        case 'VERSION_INSTALLATION_FAILED':
          console.error('Version installation failed');
          this.updateStatus({
            isUpdating: false,
            updateError: 'Update installation failed'
          });
          break;
      }
    });

    // Check for unrecoverable state
    this.swUpdate.unrecoverable.subscribe((event) => {
      console.error('Service worker in unrecoverable state:', event);
      this.updateStatus({
        updateError: 'App is in an unrecoverable state. Please reload the page.'
      });
    });

    // Start periodic update checks
    this.startPeriodicUpdateChecks();

    // Check for updates immediately
    this.checkForUpdates();
  }

  private startPeriodicUpdateChecks(): void {
    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, this.CHECK_INTERVAL);
  }

  async checkForUpdates(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      console.log('Checking for app updates...');
      const updateAvailable = await this.swUpdate.checkForUpdate();

      this.updateStatus({
        lastCheck: new Date(),
        updateError: null
      });

      if (updateAvailable) {
        console.log('Update is available');
        return true;
      } else {
        console.log('No update available');
        // checkForUpdate() returning false only means no NEW version was found.
        // A previously downloaded update may still be READY and waiting — don't
        // hide the banner from a user who clicked "Later"
        if (!this.versionReady) {
          this.updateStatus({
            updateAvailable: false,
            availableVersion: null
          });
        }
        return false;
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      this.updateStatus({
        lastCheck: new Date(),
        updateError: `Failed to check for updates: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  }

  async applyUpdate(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      this.updateStatus({
        isUpdating: true,
        updateError: null
      });

      console.log('Applying app update...');
      await this.swUpdate.activateUpdate();
      this.versionReady = false;

      this.updateStatus({
        isUpdating: false,
        updateAvailable: false,
        updateError: null
      });

      // Reload the page to use the new version
      window.location.reload();
      return true;
    } catch (error) {
      console.error('Error applying update:', error);
      this.updateStatus({
        isUpdating: false,
        updateError: `Failed to apply update: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  }

  getCurrentStatus(): UpdateStatus {
    return this.updateStatusSubject.value;
  }

  dismissUpdate(): void {
    this.updateStatus({
      updateAvailable: false
    });
  }

  // Force reload the app (useful for unrecoverable states)
  forceReload(): void {
    window.location.reload();
  }

  private updateStatus(updates: Partial<UpdateStatus>): void {
    const currentStatus = this.updateStatusSubject.value;
    this.updateStatusSubject.next({
      ...currentStatus,
      ...updates
    });
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}
