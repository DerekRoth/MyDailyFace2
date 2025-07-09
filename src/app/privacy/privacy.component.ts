import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocaleService } from '../services/locale.service';

@Component({
  selector: 'app-privacy',
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.css'
})
export class PrivacyComponent {
  lastUpdated = 'January 2025';
  contactEmail = 'roth.derek+mydailyface@gmail.com';

  constructor(private localeService: LocaleService) {}

  getLastUpdatedText(): string {
    const template = this.localeService.getTranslation('legal.last_updated');
    return template.replace('{date}', this.lastUpdated);
  }

  getContactText(): string {
    const template = this.localeService.getTranslation('privacy.contact_text');
    const email = this.localeService.getTranslation('legal.contact_email');
    return template.replace('{email}', email);
  }
}
