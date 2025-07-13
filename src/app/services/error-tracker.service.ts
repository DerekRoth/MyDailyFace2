import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ErrorEntry {
  timestamp: Date;
  message: string;
  source?: string;
  stack?: string;
  type: 'error' | 'warn' | 'log';
}

@Injectable({
  providedIn: 'root'
})
export class ErrorTrackerService {
  private errors$ = new BehaviorSubject<ErrorEntry[]>([]);
  private overlayVisible$ = new BehaviorSubject<boolean>(false);
  private maxErrors = 50; // Keep only last 50 errors
  private originalConsole = {
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    log: console.log.bind(console)
  };
  
  private isTracking = false;

  constructor() {
    // Auto-start tracking if debug is enabled
    const savedDebugVisibility = localStorage.getItem('showTestingFeatures');
    if (savedDebugVisibility === 'true') {
      this.startTracking();
    }
    
    // Load overlay visibility state
    const savedOverlayVisibility = localStorage.getItem('showErrorOverlay');
    if (savedOverlayVisibility === 'true') {
      this.overlayVisible$.next(true);
    }
  }

  get errors() {
    return this.errors$.asObservable();
  }

  get currentErrors() {
    return this.errors$.value;
  }

  get overlayVisible() {
    return this.overlayVisible$.asObservable();
  }

  get isOverlayVisible() {
    return this.overlayVisible$.value;
  }

  startTracking() {
    if (this.isTracking) return;
    
    this.isTracking = true;
    
    // Override console methods with safe guards
    console.error = (...args: any[]) => {
      this.originalConsole.error(...args);
      try {
        this.addError('error', args.join(' '));
      } catch (e) {
        // Prevent infinite loops
      }
    };
    
    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
      try {
        this.addError('warn', args.join(' '));
      } catch (e) {
        // Prevent infinite loops
      }
    };
    
    // Capture unhandled errors
    const errorHandler = (event: ErrorEvent) => {
      try {
        this.addError('error', event.message, event.filename, event.error?.stack);
      } catch (e) {
        // Prevent infinite loops
      }
    };
    
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      try {
        this.addError('error', `Unhandled Promise Rejection: ${event.reason}`);
      } catch (e) {
        // Prevent infinite loops
      }
    };
    
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    
    // Store handlers for cleanup
    (this as any).errorHandler = errorHandler;
    (this as any).rejectionHandler = rejectionHandler;
  }

  stopTracking() {
    if (!this.isTracking) return;
    
    this.isTracking = false;
    
    // Restore original console methods
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    
    // Remove event listeners
    if ((this as any).errorHandler) {
      window.removeEventListener('error', (this as any).errorHandler);
    }
    if ((this as any).rejectionHandler) {
      window.removeEventListener('unhandledrejection', (this as any).rejectionHandler);
    }
  }

  private addError(type: ErrorEntry['type'], message: string, source?: string, stack?: string) {
    const currentErrors = this.errors$.value;
    const newError: ErrorEntry = {
      timestamp: new Date(),
      message,
      source,
      stack,
      type
    };
    
    const updatedErrors = [newError, ...currentErrors].slice(0, this.maxErrors);
    this.errors$.next(updatedErrors);
  }

  clearErrors() {
    this.errors$.next([]);
  }

  toggleOverlay() {
    const newVisibility = !this.overlayVisible$.value;
    this.overlayVisible$.next(newVisibility);
    localStorage.setItem('showErrorOverlay', newVisibility.toString());
  }

  setOverlayVisible(visible: boolean) {
    this.overlayVisible$.next(visible);
    localStorage.setItem('showErrorOverlay', visible.toString());
  }
}