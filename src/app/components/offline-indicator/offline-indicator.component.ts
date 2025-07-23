import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { OfflineQueueService, OfflineStatus } from '../../services/offline-queue.service';
import { AppUpdateService, UpdateStatus } from '../../services/app-update.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <!-- Offline Status Banner -->
    <div *ngIf="!offlineStatus.isOnline" class="offline-banner">
      <div class="offline-content">
        <span class="offline-icon">📡</span>
        <span class="offline-text">{{ 'offline.no_connection' | translate }}</span>
        <span *ngIf="offlineStatus.hasQueuedActions > 0" class="queue-indicator">
          {{ offlineStatus.hasQueuedActions }} {{ 'offline.queued_actions' | translate }}
        </span>
      </div>
    </div>

    <!-- Sync Status Banner -->
    <div *ngIf="offlineStatus.isOnline && offlineStatus.syncInProgress" class="sync-banner">
      <div class="sync-content">
        <span class="sync-icon rotating">⟳</span>
        <span class="sync-text">{{ 'offline.syncing' | translate }}</span>
      </div>
    </div>

    <!-- Update Available Banner -->
    <div *ngIf="updateStatus.updateAvailable && !updateStatus.isUpdating" class="update-banner">
      <div class="update-content">
        <span class="update-icon">⬆️</span>
        <span class="update-text">{{ 'app_update.available' | translate }}</span>
        <button class="update-button" (click)="applyUpdate()">
          {{ 'app_update.update_now' | translate }}
        </button>
        <button class="dismiss-button" (click)="dismissUpdate()">
          {{ 'app_update.later' | translate }}
        </button>
      </div>
    </div>

    <!-- Update In Progress Banner -->
    <div *ngIf="updateStatus.isUpdating" class="updating-banner">
      <div class="updating-content">
        <span class="updating-icon rotating">⟳</span>
        <span class="updating-text">{{ 'app_update.updating' | translate }}</span>
      </div>
    </div>

    <!-- Connection Restored Banner -->
    <div *ngIf="showConnectionRestored" class="connection-restored-banner">
      <div class="connection-content">
        <span class="connection-icon">✅</span>
        <span class="connection-text">{{ 'offline.connection_restored' | translate }}</span>
      </div>
    </div>
  `,
  styles: [`
    .offline-banner, .sync-banner, .update-banner, .updating-banner, .connection-restored-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      color: white;
      text-align: center;
      padding: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      animation: slideDown 0.3s ease-out;
    }

    .offline-banner {
      background-color: #dc3545;
    }

    .sync-banner {
      background-color: #17a2b8;
    }

    .update-banner {
      background-color: #28a745;
    }

    .updating-banner {
      background-color: #ffc107;
      color: #212529;
    }

    .connection-restored-banner {
      background-color: #28a745;
      animation: slideDown 0.3s ease-out, fadeOut 0.3s ease-out 2.7s;
    }

    .offline-content, .sync-content, .update-content, .updating-content, .connection-content {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .offline-icon, .sync-icon, .update-icon, .updating-icon, .connection-icon {
      font-size: 16px;
    }

    .rotating {
      animation: rotate 1s linear infinite;
    }

    .queue-indicator {
      background-color: rgba(255,255,255,0.2);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
    }

    .update-button, .dismiss-button {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .update-button:hover {
      background: rgba(255,255,255,0.3);
    }

    .dismiss-button:hover {
      background: rgba(255,255,255,0.1);
    }

    @keyframes slideDown {
      from {
        transform: translateY(-100%);
      }
      to {
        transform: translateY(0);
      }
    }

    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }

    @keyframes rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    /* Adjust main content padding when banners are visible */
    :host {
      display: block;
    }
  `]
})
export class OfflineIndicatorComponent implements OnInit, OnDestroy {
  offlineStatus: OfflineStatus = {
    isOnline: true,
    hasQueuedActions: 0,
    lastSyncAttempt: null,
    syncInProgress: false
  };

  updateStatus: UpdateStatus = {
    updateAvailable: false,
    isUpdating: false,
    updateError: null,
    currentVersion: null,
    availableVersion: null,
    lastCheck: null
  };

  showConnectionRestored = false;
  private subscriptions: Subscription[] = [];
  private wasOffline = false;

  constructor(
    private offlineQueueService: OfflineQueueService,
    private appUpdateService: AppUpdateService
  ) {}

  ngOnInit(): void {
    // Subscribe to offline status
    this.subscriptions.push(
      this.offlineQueueService.offlineStatus$.subscribe(status => {
        const wasOffline = this.wasOffline;
        this.wasOffline = !status.isOnline;
        
        // Show connection restored message briefly
        if (wasOffline && status.isOnline && !this.showConnectionRestored) {
          this.showConnectionRestored = true;
          setTimeout(() => {
            this.showConnectionRestored = false;
          }, 3000);
        }
        
        this.offlineStatus = status;
      })
    );

    // Subscribe to update status
    this.subscriptions.push(
      this.appUpdateService.updateStatus$.subscribe(status => {
        this.updateStatus = status;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  applyUpdate(): void {
    this.appUpdateService.applyUpdate();
  }

  dismissUpdate(): void {
    this.appUpdateService.dismissUpdate();
  }

  forceSync(): void {
    this.offlineQueueService.forceSync();
  }
}