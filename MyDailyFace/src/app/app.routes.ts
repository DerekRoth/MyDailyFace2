import { Routes } from '@angular/router';
import { TakePictureComponent } from './take-picture/take-picture.component';
import { BrowsePicturesComponent } from './browse-pictures/browse-pictures.component';
import { SettingsComponent } from './settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: '/take-picture', pathMatch: 'full' },
  { path: 'take-picture', component: TakePictureComponent },
  { path: 'browse-pictures', component: BrowsePicturesComponent },
  { path: 'settings', component: SettingsComponent }
];
