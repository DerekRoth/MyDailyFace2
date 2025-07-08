import { Routes } from '@angular/router';
import { TakePictureComponent } from './take-picture/take-picture.component';
import { BrowsePicturesComponent } from './browse-pictures/browse-pictures.component';
import { PlayComponent } from './play/play.component';
import { SettingsComponent } from './settings/settings.component';
import { PrivacyComponent } from './privacy/privacy.component';
import { TermsComponent } from './terms/terms.component';

export const routes: Routes = [
  { path: '', redirectTo: '/take-picture', pathMatch: 'full' },
  { path: 'take-picture', component: TakePictureComponent },
  { path: 'browse-pictures', component: BrowsePicturesComponent },
  { path: 'play', component: PlayComponent },
  { path: 'settings', component: SettingsComponent },
  { path: 'privacy', component: PrivacyComponent },
  { path: 'terms', component: TermsComponent }
];
