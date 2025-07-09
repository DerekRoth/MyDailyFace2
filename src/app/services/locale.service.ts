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
        // Navigation
        'nav.take_picture': 'Take Picture',
        'nav.browse': 'Browse',
        'nav.play': 'Play',
        'nav.settings': 'Settings',
        
        // Browse Pictures
        'browse.title': 'Your Photos',
        'browse.photo_count_single': '1 photo',
        'browse.photo_count_plural': '{count} photos',
        'browse.no_photos_header': 'No photos yet',
        'browse.loading_photos': 'Loading photos...',
        'browse.loading_state': 'Loading your photos...',
        'browse.empty_state_title': 'No photos yet',
        'browse.empty_state_description': 'Take your first daily selfie to get started!',
        'browse.delete_confirm_title': 'Delete Photo?',
        'browse.delete_confirm_message': 'This photo will be permanently deleted and cannot be recovered.',
        'browse.delete_cancel': 'Cancel',
        'browse.delete_confirm': 'Delete',
        'browse.photo_alt': 'Photo from {date}',
        'browse.generic_photo_alt': 'Photo',
        
        // Take Picture
        'take_picture.initializing_camera': 'Initializing camera...',
        'take_picture.retry': 'Retry',
        'take_picture.overlay_alt': 'Face alignment guide',
        'take_picture.toggle_tooltip': 'Toggle face alignment guide',
        'take_picture.captured_photo_alt': 'Captured photo',
        'take_picture.camera_access_error': 'Unable to access camera. Please ensure camera permissions are granted.',
        'take_picture.save_error': 'Failed to save picture. Please try again.',
        'take_picture.capture_error': 'Failed to take picture. Please try again.',
        
        // Play
        'play.no_photos_title': 'No Photos Yet',
        'play.no_photos_description': 'Take some photos first to see your timeline',
        'play.photo_alt': 'Photo {index}',
        
        // Date formatting
        'date.today': 'Today',
        'date.yesterday': 'Yesterday',
        'date.days_ago': '{days} days ago',
        
        // Month names
        'month.january': 'January',
        'month.february': 'February',
        'month.march': 'March',
        'month.april': 'April',
        'month.may': 'May',
        'month.june': 'June',
        'month.july': 'July',
        'month.august': 'August',
        'month.september': 'September',
        'month.october': 'October',
        'month.november': 'November',
        'month.december': 'December',
        
        // Settings
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
        'settings.connection_status': 'Connection Status',
        'settings.not_connected': 'Not connected',
        'settings.connected_to_drive': 'Connected to Google Drive',
        'settings.drive_not_configured': 'Google Drive integration not configured',
        'settings.connect': 'Connect',
        'settings.disconnect': 'Disconnect',
        'settings.auto_sync': 'Auto Sync',
        'settings.auto_sync_description': 'Automatically upload new photos to Google Drive',
        'settings.sync_status': 'Sync Status',
        'settings.last_sync': 'Last sync: {date}',
        'settings.never_synced': 'Never synced',
        'settings.syncing_in_progress': 'Syncing in progress...',
        'settings.manual_sync': 'Manual Sync',
        'settings.manual_sync_description': 'Force sync all unsynced photos now',
        'settings.force_sync': 'Force Sync',
        'settings.syncing': 'Syncing...',
        'settings.sync_all': 'Sync All',
        'settings.about_google_drive_sync': 'About Google Drive Sync',
        'settings.google_drive_folder_info': 'Photos are synced to a "MyDailyFace" folder in your Google Drive',
        'settings.overlay_opacity': 'Face Alignment Overlay Opacity',
        'settings.overlay_opacity_description': 'Adjust transparency of face alignment guide ({opacity}%)',
        'settings.storage': 'Storage',
        'settings.photos_stored': 'Photos Stored',
        'settings.photos_saved_locally': '{count} photos saved locally',
        'settings.clear_all_photos': 'Clear All Photos',
        'settings.clear_all_photos_description': 'Remove all stored photos from device',
        'settings.clear_all': 'Clear All',
        'settings.app_installation': 'App Installation',
        'settings.installation_status': 'Installation Status',
        'settings.app_installed': '✅ App is installed on your device',
        'settings.install_app': 'Install App',
        'settings.install_app_description': 'Add MyDailyFace to your home screen for easy access',
        'settings.show_instructions': 'Show Instructions',
        'settings.about': 'About',
        'settings.version': 'Version',
        'settings.version_number': 'MyDailyFace v1.0.0',
        'settings.privacy': 'Privacy',
        'settings.privacy_description': 'Photos stored locally and optionally synced to your Google Drive',
        'settings.legal': 'Legal',
        'settings.privacy_policy': 'Privacy Policy',
        'settings.terms_of_service': 'Terms of Service',
        'settings.animation_speed_normal': 'Normal',
        'settings.animation_speed_slower': '{speed}x slower'
      },
      'fr': {
        // Navigation
        'nav.take_picture': 'Prendre photo',
        'nav.browse': 'Parcourir',
        'nav.play': 'Lire',
        'nav.settings': 'Paramètres',
        
        // Browse Pictures
        'browse.title': 'Vos Photos',
        'browse.photo_count_single': '1 photo',
        'browse.photo_count_plural': '{count} photos',
        'browse.no_photos_header': 'Aucune photo',
        'browse.loading_photos': 'Chargement des photos...',
        'browse.loading_state': 'Chargement de vos photos...',
        'browse.empty_state_title': 'Aucune photo',
        'browse.empty_state_description': 'Prenez votre premier selfie quotidien pour commencer !',
        'browse.delete_confirm_title': 'Supprimer la photo ?',
        'browse.delete_confirm_message': 'Cette photo sera définitivement supprimée et ne pourra pas être récupérée.',
        'browse.delete_cancel': 'Annuler',
        'browse.delete_confirm': 'Supprimer',
        'browse.photo_alt': 'Photo du {date}',
        'browse.generic_photo_alt': 'Photo',
        
        // Take Picture
        'take_picture.initializing_camera': 'Initialisation de la caméra...',
        'take_picture.retry': 'Réessayer',
        'take_picture.overlay_alt': 'Guide d\'alignement du visage',
        'take_picture.toggle_tooltip': 'Basculer le guide d\'alignement du visage',
        'take_picture.captured_photo_alt': 'Photo capturée',
        'take_picture.camera_access_error': 'Impossible d\'accéder à la caméra. Veuillez autoriser l\'accès à la caméra.',
        'take_picture.save_error': 'Échec de l\'enregistrement de la photo. Veuillez réessayer.',
        'take_picture.capture_error': 'Échec de la prise de photo. Veuillez réessayer.',
        
        // Play
        'play.no_photos_title': 'Aucune Photo',
        'play.no_photos_description': 'Prenez d\'abord quelques photos pour voir votre chronologie',
        'play.photo_alt': 'Photo {index}',
        
        // Date formatting
        'date.today': 'Aujourd\'hui',
        'date.yesterday': 'Hier',
        'date.days_ago': 'Il y a {days} jours',
        
        // Month names
        'month.january': 'Janvier',
        'month.february': 'Février',
        'month.march': 'Mars',
        'month.april': 'Avril',
        'month.may': 'Mai',
        'month.june': 'Juin',
        'month.july': 'Juillet',
        'month.august': 'Août',
        'month.september': 'Septembre',
        'month.october': 'Octobre',
        'month.november': 'Novembre',
        'month.december': 'Décembre',
        
        // Settings
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
        'settings.connection_status': 'État de la connexion',
        'settings.not_connected': 'Non connecté',
        'settings.connected_to_drive': 'Connecté à Google Drive',
        'settings.drive_not_configured': 'Intégration Google Drive non configurée',
        'settings.connect': 'Connecter',
        'settings.disconnect': 'Déconnecter',
        'settings.auto_sync': 'Synchronisation automatique',
        'settings.auto_sync_description': 'Télécharger automatiquement les nouvelles photos sur Google Drive',
        'settings.sync_status': 'État de la synchronisation',
        'settings.last_sync': 'Dernière synchronisation : {date}',
        'settings.never_synced': 'Jamais synchronisé',
        'settings.syncing_in_progress': 'Synchronisation en cours...',
        'settings.manual_sync': 'Synchronisation manuelle',
        'settings.manual_sync_description': 'Forcer la synchronisation de toutes les photos non synchronisées',
        'settings.force_sync': 'Forcer la synchronisation',
        'settings.syncing': 'Synchronisation...',
        'settings.sync_all': 'Tout synchroniser',
        'settings.about_google_drive_sync': 'À propos de la synchronisation Google Drive',
        'settings.google_drive_folder_info': 'Les photos sont synchronisées dans un dossier "MyDailyFace" de votre Google Drive',
        'settings.overlay_opacity': 'Opacité du guide d\'alignement',
        'settings.overlay_opacity_description': 'Ajuster la transparence du guide d\'alignement du visage ({opacity}%)',
        'settings.storage': 'Stockage',
        'settings.photos_stored': 'Photos stockées',
        'settings.photos_saved_locally': '{count} photos sauvegardées localement',
        'settings.clear_all_photos': 'Effacer toutes les photos',
        'settings.clear_all_photos_description': 'Supprimer toutes les photos stockées de l\'appareil',
        'settings.clear_all': 'Tout effacer',
        'settings.app_installation': 'Installation de l\'application',
        'settings.installation_status': 'État de l\'installation',
        'settings.app_installed': '✅ L\'application est installée sur votre appareil',
        'settings.install_app': 'Installer l\'application',
        'settings.install_app_description': 'Ajouter MyDailyFace à votre écran d\'accueil pour un accès facile',
        'settings.show_instructions': 'Afficher les instructions',
        'settings.about': 'À propos',
        'settings.version': 'Version',
        'settings.version_number': 'MyDailyFace v1.0.0',
        'settings.privacy': 'Confidentialité',
        'settings.privacy_description': 'Photos stockées localement et optionnellement synchronisées avec votre Google Drive',
        'settings.legal': 'Mentions légales',
        'settings.privacy_policy': 'Politique de confidentialité',
        'settings.terms_of_service': 'Conditions d\'utilisation',
        'settings.animation_speed_normal': 'Normal',
        'settings.animation_speed_slower': '{speed}x plus lent'
      },
      'de': {
        // Navigation
        'nav.take_picture': 'Foto aufnehmen',
        'nav.browse': 'Durchsuchen',
        'nav.play': 'Abspielen',
        'nav.settings': 'Einstellungen',
        
        // Browse Pictures
        'browse.title': 'Ihre Fotos',
        'browse.photo_count_single': '1 Foto',
        'browse.photo_count_plural': '{count} Fotos',
        'browse.no_photos_header': 'Keine Fotos',
        'browse.loading_photos': 'Fotos werden geladen...',
        'browse.loading_state': 'Ihre Fotos werden geladen...',
        'browse.empty_state_title': 'Keine Fotos',
        'browse.empty_state_description': 'Machen Sie Ihr erstes tägliches Selfie, um zu beginnen!',
        'browse.delete_confirm_title': 'Foto löschen?',
        'browse.delete_confirm_message': 'Dieses Foto wird dauerhaft gelöscht und kann nicht wiederhergestellt werden.',
        'browse.delete_cancel': 'Abbrechen',
        'browse.delete_confirm': 'Löschen',
        'browse.photo_alt': 'Foto vom {date}',
        'browse.generic_photo_alt': 'Foto',
        
        // Take Picture
        'take_picture.initializing_camera': 'Kamera wird initialisiert...',
        'take_picture.retry': 'Erneut versuchen',
        'take_picture.overlay_alt': 'Gesichts-Ausrichtungshilfe',
        'take_picture.toggle_tooltip': 'Gesichts-Ausrichtungshilfe umschalten',
        'take_picture.captured_photo_alt': 'Aufgenommenes Foto',
        'take_picture.camera_access_error': 'Kamera kann nicht zugegriffen werden. Bitte erlauben Sie den Kamera-Zugriff.',
        'take_picture.save_error': 'Foto konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',
        'take_picture.capture_error': 'Foto konnte nicht aufgenommen werden. Bitte versuchen Sie es erneut.',
        
        // Play
        'play.no_photos_title': 'Keine Fotos',
        'play.no_photos_description': 'Machen Sie zuerst einige Fotos, um Ihre Zeitleiste zu sehen',
        'play.photo_alt': 'Foto {index}',
        
        // Date formatting
        'date.today': 'Heute',
        'date.yesterday': 'Gestern',
        'date.days_ago': 'vor {days} Tagen',
        
        // Month names
        'month.january': 'Januar',
        'month.february': 'Februar',
        'month.march': 'März',
        'month.april': 'April',
        'month.may': 'Mai',
        'month.june': 'Juni',
        'month.july': 'Juli',
        'month.august': 'August',
        'month.september': 'September',
        'month.october': 'Oktober',
        'month.november': 'November',
        'month.december': 'Dezember',
        
        // Settings
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
        'settings.connection_status': 'Verbindungsstatus',
        'settings.not_connected': 'Nicht verbunden',
        'settings.connected_to_drive': 'Mit Google Drive verbunden',
        'settings.drive_not_configured': 'Google Drive Integration nicht konfiguriert',
        'settings.connect': 'Verbinden',
        'settings.disconnect': 'Trennen',
        'settings.auto_sync': 'Automatische Synchronisation',
        'settings.auto_sync_description': 'Neue Fotos automatisch auf Google Drive hochladen',
        'settings.sync_status': 'Synchronisationsstatus',
        'settings.last_sync': 'Letzte Synchronisation: {date}',
        'settings.never_synced': 'Nie synchronisiert',
        'settings.syncing_in_progress': 'Synchronisation läuft...',
        'settings.manual_sync': 'Manuelle Synchronisation',
        'settings.manual_sync_description': 'Alle nicht synchronisierten Fotos jetzt synchronisieren',
        'settings.force_sync': 'Synchronisation erzwingen',
        'settings.syncing': 'Synchronisiert...',
        'settings.sync_all': 'Alles synchronisieren',
        'settings.about_google_drive_sync': 'Über Google Drive Synchronisation',
        'settings.google_drive_folder_info': 'Fotos werden in einen "MyDailyFace" Ordner in Ihrem Google Drive synchronisiert',
        'settings.overlay_opacity': 'Ausrichtungshilfe-Transparenz',
        'settings.overlay_opacity_description': 'Transparenz der Gesichts-Ausrichtungshilfe anpassen ({opacity}%)',
        'settings.storage': 'Speicher',
        'settings.photos_stored': 'Gespeicherte Fotos',
        'settings.photos_saved_locally': '{count} Fotos lokal gespeichert',
        'settings.clear_all_photos': 'Alle Fotos löschen',
        'settings.clear_all_photos_description': 'Alle gespeicherten Fotos vom Gerät entfernen',
        'settings.clear_all': 'Alles löschen',
        'settings.app_installation': 'App-Installation',
        'settings.installation_status': 'Installationsstatus',
        'settings.app_installed': '✅ App ist auf Ihrem Gerät installiert',
        'settings.install_app': 'App installieren',
        'settings.install_app_description': 'MyDailyFace zu Ihrem Startbildschirm hinzufügen für einfachen Zugriff',
        'settings.show_instructions': 'Anweisungen anzeigen',
        'settings.about': 'Über',
        'settings.version': 'Version',
        'settings.version_number': 'MyDailyFace v1.0.0',
        'settings.privacy': 'Datenschutz',
        'settings.privacy_description': 'Fotos werden lokal gespeichert und optional mit Ihrem Google Drive synchronisiert',
        'settings.legal': 'Rechtliches',
        'settings.privacy_policy': 'Datenschutzrichtlinie',
        'settings.terms_of_service': 'Nutzungsbedingungen',
        'settings.animation_speed_normal': 'Normal',
        'settings.animation_speed_slower': '{speed}x langsamer'
      },
      'it': {
        // Navigation
        'nav.take_picture': 'Scatta foto',
        'nav.browse': 'Sfoglia',
        'nav.play': 'Riproduci',
        'nav.settings': 'Impostazioni',
        
        // Browse Pictures
        'browse.title': 'Le tue foto',
        'browse.photo_count_single': '1 foto',
        'browse.photo_count_plural': '{count} foto',
        'browse.no_photos_header': 'Nessuna foto',
        'browse.loading_photos': 'Caricamento foto...',
        'browse.loading_state': 'Caricamento delle tue foto...',
        'browse.empty_state_title': 'Nessuna foto',
        'browse.empty_state_description': 'Scatta il tuo primo selfie quotidiano per iniziare!',
        'browse.delete_confirm_title': 'Eliminare la foto?',
        'browse.delete_confirm_message': 'Questa foto sarà eliminata definitivamente e non potrà essere recuperata.',
        'browse.delete_cancel': 'Annulla',
        'browse.delete_confirm': 'Elimina',
        'browse.photo_alt': 'Foto del {date}',
        'browse.generic_photo_alt': 'Foto',
        
        // Take Picture
        'take_picture.initializing_camera': 'Inizializzazione fotocamera...',
        'take_picture.retry': 'Riprova',
        'take_picture.overlay_alt': 'Guida allineamento viso',
        'take_picture.toggle_tooltip': 'Attiva/disattiva guida allineamento viso',
        'take_picture.captured_photo_alt': 'Foto scattata',
        'take_picture.camera_access_error': 'Impossibile accedere alla fotocamera. Concedi i permessi per la fotocamera.',
        'take_picture.save_error': 'Impossibile salvare la foto. Riprova.',
        'take_picture.capture_error': 'Impossibile scattare la foto. Riprova.',
        
        // Play
        'play.no_photos_title': 'Nessuna foto',
        'play.no_photos_description': 'Scatta prima alcune foto per vedere la tua timeline',
        'play.photo_alt': 'Foto {index}',
        
        // Date formatting
        'date.today': 'Oggi',
        'date.yesterday': 'Ieri',
        'date.days_ago': '{days} giorni fa',
        
        // Month names
        'month.january': 'Gennaio',
        'month.february': 'Febbraio',
        'month.march': 'Marzo',
        'month.april': 'Aprile',
        'month.may': 'Maggio',
        'month.june': 'Giugno',
        'month.july': 'Luglio',
        'month.august': 'Agosto',
        'month.september': 'Settembre',
        'month.october': 'Ottobre',
        'month.november': 'Novembre',
        'month.december': 'Dicembre',
        
        // Settings
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
        'settings.connection_status': 'Stato della connessione',
        'settings.not_connected': 'Non connesso',
        'settings.connected_to_drive': 'Connesso a Google Drive',
        'settings.drive_not_configured': 'Integrazione Google Drive non configurata',
        'settings.connect': 'Connetti',
        'settings.disconnect': 'Disconnetti',
        'settings.auto_sync': 'Sincronizzazione automatica',
        'settings.auto_sync_description': 'Carica automaticamente le nuove foto su Google Drive',
        'settings.sync_status': 'Stato sincronizzazione',
        'settings.last_sync': 'Ultima sincronizzazione: {date}',
        'settings.never_synced': 'Mai sincronizzato',
        'settings.syncing_in_progress': 'Sincronizzazione in corso...',
        'settings.manual_sync': 'Sincronizzazione manuale',
        'settings.manual_sync_description': 'Forza la sincronizzazione di tutte le foto non sincronizzate',
        'settings.force_sync': 'Forza sincronizzazione',
        'settings.syncing': 'Sincronizzazione...',
        'settings.sync_all': 'Sincronizza tutto',
        'settings.about_google_drive_sync': 'Informazioni sulla sincronizzazione Google Drive',
        'settings.google_drive_folder_info': 'Le foto vengono sincronizzate in una cartella "MyDailyFace" nel tuo Google Drive',
        'settings.overlay_opacity': 'Opacità guida allineamento',
        'settings.overlay_opacity_description': 'Regola la trasparenza della guida allineamento viso ({opacity}%)',
        'settings.storage': 'Archiviazione',
        'settings.photos_stored': 'Foto archiviate',
        'settings.photos_saved_locally': '{count} foto salvate localmente',
        'settings.clear_all_photos': 'Cancella tutte le foto',
        'settings.clear_all_photos_description': 'Rimuovi tutte le foto archiviate dal dispositivo',
        'settings.clear_all': 'Cancella tutto',
        'settings.app_installation': 'Installazione app',
        'settings.installation_status': 'Stato installazione',
        'settings.app_installed': '✅ L\'app è installata sul tuo dispositivo',
        'settings.install_app': 'Installa app',
        'settings.install_app_description': 'Aggiungi MyDailyFace alla schermata principale per un accesso rapido',
        'settings.show_instructions': 'Mostra istruzioni',
        'settings.about': 'Informazioni',
        'settings.version': 'Versione',
        'settings.version_number': 'MyDailyFace v1.0.0',
        'settings.privacy': 'Privacy',
        'settings.privacy_description': 'Foto archiviate localmente e opzionalmente sincronizzate con il tuo Google Drive',
        'settings.legal': 'Note legali',
        'settings.privacy_policy': 'Informativa sulla privacy',
        'settings.terms_of_service': 'Termini di servizio',
        'settings.animation_speed_normal': 'Normale',
        'settings.animation_speed_slower': '{speed}x più lento'
      },
      'pt': {
        // Navigation
        'nav.take_picture': 'Tirar foto',
        'nav.browse': 'Navegar',
        'nav.play': 'Reproduzir',
        'nav.settings': 'Configurações',
        
        // Browse Pictures
        'browse.title': 'Suas Fotos',
        'browse.photo_count_single': '1 foto',
        'browse.photo_count_plural': '{count} fotos',
        'browse.no_photos_header': 'Nenhuma foto',
        'browse.loading_photos': 'Carregando fotos...',
        'browse.loading_state': 'Carregando suas fotos...',
        'browse.empty_state_title': 'Nenhuma foto',
        'browse.empty_state_description': 'Tire sua primeira selfie diária para começar!',
        'browse.delete_confirm_title': 'Excluir foto?',
        'browse.delete_confirm_message': 'Esta foto será excluída permanentemente e não poderá ser recuperada.',
        'browse.delete_cancel': 'Cancelar',
        'browse.delete_confirm': 'Excluir',
        'browse.photo_alt': 'Foto de {date}',
        'browse.generic_photo_alt': 'Foto',
        
        // Take Picture
        'take_picture.initializing_camera': 'Inicializando câmera...',
        'take_picture.retry': 'Tentar novamente',
        'take_picture.overlay_alt': 'Guia de alinhamento facial',
        'take_picture.toggle_tooltip': 'Alternar guia de alinhamento facial',
        'take_picture.captured_photo_alt': 'Foto capturada',
        'take_picture.camera_access_error': 'Não é possível acessar a câmera. Permita o acesso à câmera.',
        'take_picture.save_error': 'Falha ao salvar a foto. Tente novamente.',
        'take_picture.capture_error': 'Falha ao tirar a foto. Tente novamente.',
        
        // Play
        'play.no_photos_title': 'Nenhuma Foto',
        'play.no_photos_description': 'Tire algumas fotos primeiro para ver sua linha do tempo',
        'play.photo_alt': 'Foto {index}',
        
        // Date formatting
        'date.today': 'Hoje',
        'date.yesterday': 'Ontem',
        'date.days_ago': '{days} dias atrás',
        
        // Month names
        'month.january': 'Janeiro',
        'month.february': 'Fevereiro',
        'month.march': 'Março',
        'month.april': 'Abril',
        'month.may': 'Maio',
        'month.june': 'Junho',
        'month.july': 'Julho',
        'month.august': 'Agosto',
        'month.september': 'Setembro',
        'month.october': 'Outubro',
        'month.november': 'Novembro',
        'month.december': 'Dezembro',
        
        // Settings
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
        'settings.connection_status': 'Status da conexão',
        'settings.not_connected': 'Não conectado',
        'settings.connected_to_drive': 'Conectado ao Google Drive',
        'settings.drive_not_configured': 'Integração com Google Drive não configurada',
        'settings.connect': 'Conectar',
        'settings.disconnect': 'Desconectar',
        'settings.auto_sync': 'Sincronização automática',
        'settings.auto_sync_description': 'Carregar automaticamente novas fotos para o Google Drive',
        'settings.sync_status': 'Status da sincronização',
        'settings.last_sync': 'Última sincronização: {date}',
        'settings.never_synced': 'Nunca sincronizado',
        'settings.syncing_in_progress': 'Sincronização em andamento...',
        'settings.manual_sync': 'Sincronização manual',
        'settings.manual_sync_description': 'Forçar sincronização de todas as fotos não sincronizadas',
        'settings.force_sync': 'Forçar sincronização',
        'settings.syncing': 'Sincronizando...',
        'settings.sync_all': 'Sincronizar tudo',
        'settings.about_google_drive_sync': 'Sobre a sincronização Google Drive',
        'settings.google_drive_folder_info': 'As fotos são sincronizadas para uma pasta "MyDailyFace" no seu Google Drive',
        'settings.overlay_opacity': 'Opacidade do guia de alinhamento',
        'settings.overlay_opacity_description': 'Ajustar transparência do guia de alinhamento facial ({opacity}%)',
        'settings.storage': 'Armazenamento',
        'settings.photos_stored': 'Fotos armazenadas',
        'settings.photos_saved_locally': '{count} fotos salvas localmente',
        'settings.clear_all_photos': 'Limpar todas as fotos',
        'settings.clear_all_photos_description': 'Remover todas as fotos armazenadas do dispositivo',
        'settings.clear_all': 'Limpar tudo',
        'settings.app_installation': 'Instalação do aplicativo',
        'settings.installation_status': 'Status da instalação',
        'settings.app_installed': '✅ O aplicativo está instalado em seu dispositivo',
        'settings.install_app': 'Instalar aplicativo',
        'settings.install_app_description': 'Adicionar MyDailyFace à sua tela inicial para acesso rápido',
        'settings.show_instructions': 'Mostrar instruções',
        'settings.about': 'Sobre',
        'settings.version': 'Versão',
        'settings.version_number': 'MyDailyFace v1.0.0',
        'settings.privacy': 'Privacidade',
        'settings.privacy_description': 'Fotos armazenadas localmente e opcionalmente sincronizadas com seu Google Drive',
        'settings.legal': 'Legal',
        'settings.privacy_policy': 'Política de privacidade',
        'settings.terms_of_service': 'Termos de serviço',
        'settings.animation_speed_normal': 'Normal',
        'settings.animation_speed_slower': '{speed}x mais lento'
      }
    };

    return translations[languageCode] || translations['en'];
  }
}