import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LocaleService } from './locale.service';

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

  constructor(private localeService: LocaleService) {
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
          platform: this.localeService.getTranslation('install.chrome_desktop'),
          instructions: [
            this.localeService.getTranslation('install.chrome_desktop_1'),
            this.localeService.getTranslation('install.chrome_desktop_2'),
            this.localeService.getTranslation('install.chrome_desktop_3'),
            this.localeService.getTranslation('install.chrome_desktop_4')
          ]
        };
      } else {
        // Chrome mobile
        return {
          platform: this.localeService.getTranslation('install.chrome_mobile'),
          instructions: [
            this.localeService.getTranslation('install.chrome_mobile_1'),
            this.localeService.getTranslation('install.chrome_mobile_2'),
            this.localeService.getTranslation('install.chrome_mobile_3'),
            this.localeService.getTranslation('install.chrome_mobile_4')
          ]
        };
      }
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      // Safari mobile
      if (userAgent.includes('mobile')) {
        return {
          platform: this.localeService.getTranslation('install.safari_mobile'),
          instructions: [
            this.localeService.getTranslation('install.safari_mobile_1'),
            this.localeService.getTranslation('install.safari_mobile_2'),
            this.localeService.getTranslation('install.safari_mobile_3'),
            this.localeService.getTranslation('install.safari_mobile_4')
          ]
        };
      } else {
        // Safari desktop
        return {
          platform: this.localeService.getTranslation('install.safari_desktop'),
          instructions: [
            this.localeService.getTranslation('install.safari_desktop_1'),
            this.localeService.getTranslation('install.safari_desktop_2'),
            this.localeService.getTranslation('install.safari_desktop_3')
          ]
        };
      }
    } else if (userAgent.includes('firefox')) {
      return {
        platform: this.localeService.getTranslation('install.firefox'),
        instructions: [
          this.localeService.getTranslation('install.firefox_1'),
          this.localeService.getTranslation('install.firefox_2'),
          this.localeService.getTranslation('install.firefox_3'),
          this.localeService.getTranslation('install.firefox_4')
        ]
      };
    } else if (userAgent.includes('edg')) {
      return {
        platform: this.localeService.getTranslation('install.edge'),
        instructions: [
          this.localeService.getTranslation('install.edge_1'),
          this.localeService.getTranslation('install.edge_2'),
          this.localeService.getTranslation('install.edge_3'),
          this.localeService.getTranslation('install.edge_4')
        ]
      };
    } else {
      return {
        platform: this.localeService.getTranslation('install.generic'),
        instructions: [
          this.localeService.getTranslation('install.generic_1'),
          this.localeService.getTranslation('install.generic_2'),
          this.localeService.getTranslation('install.generic_3'),
          this.localeService.getTranslation('install.generic_4')
        ]
      };
    }
  }
}