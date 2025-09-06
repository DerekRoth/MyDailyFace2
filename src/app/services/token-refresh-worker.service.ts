import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

interface TokenRefreshStatus {
  isActive: boolean;
  lastRefresh: Date | null;
  nextRefresh: Date | null;
  error: string | null;
}

interface WorkerMessage {
  type: string;
  token?: any;
  reason?: string;
  status?: any;
}

@Injectable({
  providedIn: 'root'
})
export class TokenRefreshWorkerService {
  private worker: ServiceWorker | null = null;
  private statusSubject = new BehaviorSubject<TokenRefreshStatus>({
    isActive: false,
    lastRefresh: null,
    nextRefresh: null,
    error: null
  });

  public status$ = this.statusSubject.asObservable();

  constructor(private ngZone: NgZone) {
    this.initializeWorker();
  }

  private async initializeWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        // Register the token refresh worker
        const registration = await navigator.serviceWorker.register(
          '/token-refresh-worker.js',
          {
            scope: '/',
            updateViaCache: 'none'
          }
        );

        console.log('Token refresh worker registered:', registration);

        // Wait for the worker to be ready
        if (registration.active) {
          this.worker = registration.active;
          this.setupMessageHandling();
        } else if (registration.installing) {
          registration.installing.addEventListener('statechange', (e) => {
            const sw = e.target as ServiceWorker;
            if (sw.state === 'activated') {
              this.worker = sw;
              this.setupMessageHandling();
            }
          });
        }

        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('Token refresh worker updated');
                this.worker = newWorker;
                this.setupMessageHandling();
              }
            });
          }
        });

      } catch (error) {
        console.error('Failed to register token refresh worker:', error);
        this.updateStatus({ error: `Worker registration failed: ${error}` });
      }
    } else {
      console.warn('Service workers not supported');
      this.updateStatus({ error: 'Service workers not supported' });
    }
  }

  private setupMessageHandling(): void {
    if (!this.worker) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      this.ngZone.run(() => {
        this.handleWorkerMessage(event.data);
      });
    });

    // Start the background refresh scheduling
    this.scheduleTokenRefresh();
    this.updateStatus({ isActive: true, error: null });
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    console.log('Received message from token worker:', message);

    switch (message.type) {
      case 'TOKEN_REFRESHED':
        this.updateStatus({
          lastRefresh: new Date(),
          nextRefresh: new Date(Date.now() + 45 * 60 * 1000), // 45 minutes
          error: null
        });
        
        // Notify other parts of the app that token was refreshed
        window.dispatchEvent(new CustomEvent('tokenRefreshed', {
          detail: message.token
        }));
        break;

      case 'REFRESH_FAILED':
        this.updateStatus({
          error: `Token refresh failed: ${message.reason}`
        });
        
        // Notify app that manual re-authentication may be needed
        window.dispatchEvent(new CustomEvent('tokenRefreshFailed', {
          detail: message.reason
        }));
        break;
    }
  }

  public scheduleTokenRefresh(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'SCHEDULE_REFRESH' });
      console.log('Scheduled background token refresh');
    }
  }

  public forceTokenRefresh(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'REFRESH_TOKEN' });
      console.log('Forced token refresh');
    }
  }

  public async checkTokenStatus(): Promise<any> {
    if (!this.worker) return null;

    return new Promise((resolve) => {
      const channel = new MessageChannel();
      
      channel.port1.onmessage = (event) => {
        resolve(event.data.status);
      };

      this.worker!.postMessage(
        { type: 'CHECK_TOKEN_STATUS' },
        [channel.port2]
      );

      // Timeout after 5 seconds
      setTimeout(() => resolve(null), 5000);
    });
  }

  public getCurrentStatus(): TokenRefreshStatus {
    return this.statusSubject.value;
  }

  private updateStatus(updates: Partial<TokenRefreshStatus>): void {
    const currentStatus = this.statusSubject.value;
    this.statusSubject.next({
      ...currentStatus,
      ...updates
    });
  }

  public isSupported(): boolean {
    return 'serviceWorker' in navigator;
  }

  public isActive(): boolean {
    return this.statusSubject.value.isActive && !!this.worker;
  }
}