import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocaleService } from '../services/locale.service';

@Component({
  selector: 'app-terms',
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.css'
})
export class TermsComponent {
  lastUpdated = 'January 2025';
  contactEmail = 'roth.derek+mydailyface@gmail.com';

  constructor(private localeService: LocaleService) {}

  getLastUpdatedText(): string {
    const template = this.localeService.getTranslation('legal.last_updated');
    return template.replace('{date}', this.lastUpdated);
  }

  getContactText(): string {
    const template = this.localeService.getTranslation('terms.contact_text');
    const email = this.localeService.getTranslation('legal.contact_email');
    return template.replace('{email}', email);
  }
}
