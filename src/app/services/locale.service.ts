import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface SupportedLanguage {
  code: string;
  name: string;
  flag: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocaleService {
  private readonly SUPPORTED_LANGUAGES: SupportedLanguage[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' }
  ];

  private readonly STORAGE_KEY = 'selected-language';
  private currentLanguageSubject = new BehaviorSubject<string>(this.getInitialLanguage());

  constructor() {
    // Save the initial language selection
    this.saveLanguage(this.currentLanguageSubject.value);
  }

  get currentLanguage$(): Observable<string> {
    return this.currentLanguageSubject.asObservable();
  }

  get currentLanguage(): string {
    return this.currentLanguageSubject.value;
  }

  get supportedLanguages(): SupportedLanguage[] {
    return [...this.SUPPORTED_LANGUAGES];
  }

  getCurrentLanguageInfo(): SupportedLanguage {
    return this.SUPPORTED_LANGUAGES.find(lang => lang.code === this.currentLanguage) || this.SUPPORTED_LANGUAGES[0];
  }

  setLanguage(languageCode: string): void {
    if (this.isLanguageSupported(languageCode)) {
      this.currentLanguageSubject.next(languageCode);
      this.saveLanguage(languageCode);
      
      // Update the current language immediately without reload
      // This will trigger reactive updates in components
    }
  }

  private getInitialLanguage(): string {
    // Check if user has previously selected a language
    const savedLanguage = localStorage.getItem(this.STORAGE_KEY);
    if (savedLanguage && this.isLanguageSupported(savedLanguage)) {
      return savedLanguage;
    }

    // Otherwise, detect from browser
    return this.detectBrowserLanguage();
  }

  private detectBrowserLanguage(): string {
    if (typeof navigator !== 'undefined') {
      // Get user's preferred languages
      const browserLanguages = navigator.languages || [navigator.language];
      
      for (const browserLang of browserLanguages) {
        // Extract language code (e.g., 'fr-FR' -> 'fr')
        const langCode = browserLang.split('-')[0].toLowerCase();
        
        if (this.isLanguageSupported(langCode)) {
          return langCode;
        }
      }
    }
    
    // Default to English if no supported language found
    return 'en';
  }

  private isLanguageSupported(languageCode: string): boolean {
    return this.SUPPORTED_LANGUAGES.some(lang => lang.code === languageCode);
  }

  private saveLanguage(languageCode: string): void {
    localStorage.setItem(this.STORAGE_KEY, languageCode);
  }

  // Method to get translated text based on current language
  getTranslation(key: string): string {
    const lang = this.currentLanguage;
    const translations = this.getTranslations(lang);
    return translations[key] || key;
  }

  private getTranslations(languageCode: string): Record<string, string> {
    // Translation mappings for each language
    const translations: Record<string, Record<string, string>> = {
      'en': {
        'settings.title': 'Settings',
        'settings.subtitle': 'Manage your app preferences',
        'settings.appearance': 'Appearance',
        'settings.language': 'Language',
        'settings.language_description': 'Choose your preferred language',
        'settings.theme': 'Theme',
        'settings.theme_description': 'Choose your preferred app theme',
        'settings.theme_light': 'Light',
        'settings.theme_dark': 'Dark',
        'settings.theme_system': 'System',
        'settings.google_drive_sync': 'Google Drive Sync',
        'nav.take_picture': 'Take Picture',
        'nav.browse': 'Browse',
        'nav.play': 'Play',
        'nav.settings': 'Settings'
      },
      'fr': {
        'settings.title': 'Paramètres',
        'settings.subtitle': 'Gérez vos préférences d\'application',
        'settings.appearance': 'Apparence',
        'settings.language': 'Langue',
        'settings.language_description': 'Choisissez votre langue préférée',
        'settings.theme': 'Thème',
        'settings.theme_description': 'Choisissez votre thème d\'application préféré',
        'settings.theme_light': 'Clair',
        'settings.theme_dark': 'Sombre',
        'settings.theme_system': 'Système',
        'settings.google_drive_sync': 'Synchronisation Google Drive',
        'nav.take_picture': 'Prendre photo',
        'nav.browse': 'Parcourir',
        'nav.play': 'Lire',
        'nav.settings': 'Paramètres'
      },
      'de': {
        'settings.title': 'Einstellungen',
        'settings.subtitle': 'Verwalten Sie Ihre App-Einstellungen',
        'settings.appearance': 'Aussehen',
        'settings.language': 'Sprache',
        'settings.language_description': 'Wählen Sie Ihre bevorzugte Sprache',
        'settings.theme': 'Design',
        'settings.theme_description': 'Wählen Sie Ihr bevorzugtes App-Design',
        'settings.theme_light': 'Hell',
        'settings.theme_dark': 'Dunkel',
        'settings.theme_system': 'System',
        'settings.google_drive_sync': 'Google Drive Synchronisation',
        'nav.take_picture': 'Foto aufnehmen',
        'nav.browse': 'Durchsuchen',
        'nav.play': 'Abspielen',
        'nav.settings': 'Einstellungen'
      },
      'it': {
        'settings.title': 'Impostazioni',
        'settings.subtitle': 'Gestisci le tue preferenze dell\'app',
        'settings.appearance': 'Aspetto',
        'settings.language': 'Lingua',
        'settings.language_description': 'Scegli la tua lingua preferita',
        'settings.theme': 'Tema',
        'settings.theme_description': 'Scegli il tuo tema dell\'app preferito',
        'settings.theme_light': 'Chiaro',
        'settings.theme_dark': 'Scuro',
        'settings.theme_system': 'Sistema',
        'settings.google_drive_sync': 'Sincronizzazione Google Drive',
        'nav.take_picture': 'Scatta foto',
        'nav.browse': 'Sfoglia',
        'nav.play': 'Riproduci',
        'nav.settings': 'Impostazioni'
      },
      'pt': {
        'settings.title': 'Configurações',
        'settings.subtitle': 'Gerencie suas preferências do aplicativo',
        'settings.appearance': 'Aparência',
        'settings.language': 'Idioma',
        'settings.language_description': 'Escolha seu idioma preferido',
        'settings.theme': 'Tema',
        'settings.theme_description': 'Escolha seu tema preferido do aplicativo',
        'settings.theme_light': 'Claro',
        'settings.theme_dark': 'Escuro',
        'settings.theme_system': 'Sistema',
        'settings.google_drive_sync': 'Sincronização Google Drive',
        'nav.take_picture': 'Tirar foto',
        'nav.browse': 'Navegar',
        'nav.play': 'Reproduzir',
        'nav.settings': 'Configurações'
      }
    };

    return translations[languageCode] || translations['en'];
  }
}