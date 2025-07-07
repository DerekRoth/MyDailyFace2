import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'MyDailyFace';

  constructor(private router: Router, private swUpdate: SwUpdate) {}

  ngOnInit() {
    // Debug navigation
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        console.log('Navigation to:', event.url);
      });

    // Service worker update handling
    this.checkForUpdates();
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
}
