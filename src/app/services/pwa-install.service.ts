import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({
  providedIn: 'root'
})
export class PwaInstallService {
  private deferredPrompt: InstallPromptEvent | null = null;
  private installable$ = new BehaviorSubject<boolean>(false);
  private installed$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.initializeInstallPrompt();
    this.checkIfInstalled();
  }

  get canInstall() {
    return this.installable$.asObservable();
  }

  get isInstalled() {
    return this.installed$.asObservable();
  }

  get isInstallable(): boolean {
    return this.installable$.value;
  }

  get isAppInstalled(): boolean {
    return this.installed$.value;
  }

  private initializeInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as InstallPromptEvent;
      this.installable$.next(true);
      console.log('PWA installation prompt available');
    });

    window.addEventListener('appinstalled', () => {
      this.installed$.next(true);
      this.installable$.next(false);
      this.deferredPrompt = null;
      console.log('PWA installed successfully');
    });
  }

  private checkIfInstalled() {
    // Check if running in standalone mode (already installed)
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      this.installed$.next(true);
      return;
    }

    // Check if running as PWA on mobile
    if ((window.navigator as any).standalone === true) {
      this.installed$.next(true);
      return;
    }

    // Check for Chrome PWA
    if (document.referrer.includes('android-app://')) {
      this.installed$.next(true);
      return;
    }
  }

  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.log('No install prompt available');
      return false;
    }

    try {
      await this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
        this.installable$.next(false);
        this.deferredPrompt = null;
        return true;
      } else {
        console.log('User dismissed the install prompt');
        return false;
      }
    } catch (error) {
      console.error('Error during install prompt:', error);
      return false;
    }
  }

  getInstallInstructions(): { platform: string; instructions: string[] } {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
      // Chrome desktop
      if (!userAgent.includes('mobile')) {
        return {
          platform: 'Chrome Desktop',
          instructions: [
            'Look for the install icon (⬇️ or ⊕) in the address bar',
            'Click the icon and select "Install MyDailyFace"',
            'Or click the three dots menu (⋮) → "Install MyDailyFace"',
            'The app will be added to your desktop and Start menu'
          ]
        };
      } else {
        // Chrome mobile
        return {
          platform: 'Chrome Mobile',
          instructions: [
            'Tap the three dots menu (⋮) in the top right',
            'Select "Add to Home screen" or "Install app"',
            'Tap "Add" to confirm',
            'The app will appear on your home screen'
          ]
        };
      }
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      // Safari mobile
      if (userAgent.includes('mobile')) {
        return {
          platform: 'Safari Mobile',
          instructions: [
            'Tap the Share button (□↗) at the bottom of the screen',
            'Scroll down and tap "Add to Home Screen"',
            'Tap "Add" to confirm',
            'The app will appear on your home screen'
          ]
        };
      } else {
        // Safari desktop
        return {
          platform: 'Safari Desktop',
          instructions: [
            'Click Safari menu → "Add to Dock"',
            'Or drag the URL to your dock',
            'The app will open in its own window'
          ]
        };
      }
    } else if (userAgent.includes('firefox')) {
      return {
        platform: 'Firefox',
        instructions: [
          'Click the three lines menu (☰) in the top right',
          'Select "Install MyDailyFace"',
          'Or look for the install icon in the address bar',
          'Click "Install" to add to your system'
        ]
      };
    } else if (userAgent.includes('edg')) {
      return {
        platform: 'Microsoft Edge',
        instructions: [
          'Look for the install icon (⊕) in the address bar',
          'Click the icon and select "Install MyDailyFace"',
          'Or click the three dots menu (⋯) → "Apps" → "Install MyDailyFace"',
          'The app will be added to your desktop and Start menu'
        ]
      };
    } else {
      return {
        platform: 'Your Browser',
        instructions: [
          'Look for an install icon in the address bar',
          'Check your browser\'s menu for "Install" or "Add to Home Screen"',
          'The app can be installed for offline use',
          'Contact support if you need help with installation'
        ]
      };
    }
  }
}