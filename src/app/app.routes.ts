import { Routes } from '@angular/router';
import { TakePictureComponent } from './take-picture/take-picture.component';

export const routes: Routes = [
  { path: '', redirectTo: '/take-picture', pathMatch: 'full' },
  // The camera screen is the default route, so it stays eager; everything else
  // loads on demand to keep the initial bundle inside its budget
  { path: 'take-picture', component: TakePictureComponent },
  { path: 'home', loadComponent: () => import('./homepage/homepage.component').then(m => m.HomepageComponent) },
  { path: 'browse-pictures', loadComponent: () => import('./browse-pictures/browse-pictures.component').then(m => m.BrowsePicturesComponent) },
  { path: 'play', loadComponent: () => import('./play/play.component').then(m => m.PlayComponent) },
  { path: 'settings', loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent) },
  { path: 'privacy', loadComponent: () => import('./privacy/privacy.component').then(m => m.PrivacyComponent) },
  { path: 'terms', loadComponent: () => import('./terms/terms.component').then(m => m.TermsComponent) }
];
