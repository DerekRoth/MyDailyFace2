import { ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes, withViewTransitions({ skipInitialTransition: true })), provideServiceWorker('ngsw-worker.js', {
            // Disabled during ng serve — a service worker in dev serves stale
            // bundles and there is no ngsw-worker.js in the dev server anyway
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })]
};
