import { Pipe, PipeTransform } from '@angular/core';
import { LocaleService } from '../services/locale.service';

@Pipe({
  name: 'translate',
  pure: false // Make it impure so it updates when language changes
})
export class TranslatePipe implements PipeTransform {
  constructor(private localeService: LocaleService) {}

  transform(key: string): string {
    return this.localeService.getTranslation(key);
  }
}