import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { GoogleDriveService } from '../../services/google-drive.service';

interface NotificationMessage {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  action?: string;
  actionCallback?: () => void;
  duration?: number; // in milliseconds, 0 means persistent
}

@Component({
  selector: 'app-auth-status-notification',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      *ngIf="currentNotification" 
      class="auth-notification"
      [class]="'notification-' + currentNotification.type">

      <div class="notification-content">
        <div class="notification-icon">
          <span *ngIf="currentNotification.type === 'success'">✓</span>
          <span *ngIf="currentNotification.type === 'warning'">⚠</span>
          <span *ngIf="currentNotification.type === 'error'">✗</span>
          <span *ngIf="currentNotification.type === 'info'">ⓘ</span>
        </div>
        
        <div class="notification-text">
          {{ currentNotification.message }}
        </div>
        
        <div class="notification-actions" *ngIf="currentNotification.action">
          <button 
            class="notification-action-btn"
            (click)="handleAction()">
            {{ currentNotification.action }}
          </button>
        </div>
        
        <button 
          class="notification-close"
          (click)="dismissNotification()"
          aria-label="Close notification">
          ×
        </button>
      </div>
    </div>
  `,
  styles: [`
    .auth-notification {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      min-width: 300px;
      max-width: 90vw;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border-radius: 8px;
      overflow: hidden;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
      animation: notification-slide-in 0.3s ease;
    }

    @keyframes notification-slide-in {
      from {
        opacity: 0;
        translate: 0 -20px;
      }
      to {
        opacity: 1;
        translate: 0 0;
      }
    }
    
    .notification-success {
      background: rgba(76, 175, 80, 0.95);
      border-left: 4px solid #4CAF50;
      color: white;
    }
    
    .notification-warning {
      background: rgba(255, 152, 0, 0.95);
      border-left: 4px solid #FF9800;
      color: white;
    }
    
    .notification-error {
      background: rgba(244, 67, 54, 0.95);
      border-left: 4px solid #F44336;
      color: white;
    }
    
    .notification-info {
      background: rgba(33, 150, 243, 0.95);
      border-left: 4px solid #2196F3;
      color: white;
    }
    
    .notification-content {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      gap: 12px;
    }
    
    .notification-icon {
      font-size: 18px;
      font-weight: bold;
      flex-shrink: 0;
    }
    
    .notification-text {
      flex: 1;
      font-size: 14px;
      line-height: 1.4;
    }
    
    .notification-actions {
      flex-shrink: 0;
    }
    
    .notification-action-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    .notification-action-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .notification-close {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background-color 0.2s ease;
      flex-shrink: 0;
    }
    
    .notification-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    @media (max-width: 600px) {
      .auth-notification {
        top: 10px;
        left: 10px;
        right: 10px;
        transform: none;
        min-width: auto;
      }
      
      .notification-content {
        padding: 10px 12px;
        gap: 8px;
      }
      
      .notification-text {
        font-size: 13px;
      }
    }
  `]
})
export class AuthStatusNotificationComponent implements OnInit, OnDestroy {
  currentNotification: NotificationMessage | null = null;
  private destroy$ = new Subject<void>();
  private notificationTimeout: number | null = null;

  constructor(
    private googleDriveService: GoogleDriveService
  ) {}

  ngOnInit(): void {
    // Listen for authentication status changes
    this.googleDriveService.syncStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.handleSyncStatusChange(status);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }
  }

  private handleSyncStatusChange(status: any): void {
    // Show notifications for important sync status changes
    if (status.error && status.error.includes('Authentication')) {
      this.showNotification({
        type: 'error',
        message: status.error,
        action: 'Sign In',
        actionCallback: () => this.reconnectGoogleDrive(),
        duration: 0
      });
    } else if (status.isAuthenticated && status.lastSync) {
      // Don't show success message on every sync - only on initial auth
      const lastSync = new Date(status.lastSync);
      const now = new Date();
      const timeSinceSync = now.getTime() - lastSync.getTime();
      
      // Show success only if it's a recent sync (within 10 seconds)
      if (timeSinceSync < 10000) {
        this.showNotification({
          type: 'success',
          message: 'Google Drive sync completed',
          duration: 2000
        });
      }
    }
  }

  private showNotification(notification: NotificationMessage): void {
    // Clear existing timeout
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
    }

    this.currentNotification = notification;

    // Auto-dismiss after duration if specified
    if (notification.duration && notification.duration > 0) {
      this.notificationTimeout = window.setTimeout(() => {
        this.dismissNotification();
      }, notification.duration);
    }
  }

  public dismissNotification(): void {
    this.currentNotification = null;
    
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
    }
  }

  public handleAction(): void {
    if (this.currentNotification?.actionCallback) {
      this.currentNotification.actionCallback();
    }
    this.dismissNotification();
  }

  private reconnectGoogleDrive(): void {
    // Trigger Google Drive sign-in
    this.googleDriveService.signIn().then(success => {
      if (success) {
        this.showNotification({
          type: 'success',
          message: 'Google Drive reconnected successfully',
          duration: 3000
        });
      } else {
        this.showNotification({
          type: 'error',
          message: 'Failed to reconnect to Google Drive',
          duration: 5000
        });
      }
    });
  }
}