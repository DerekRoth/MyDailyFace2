# MyDailyFace - Claude Reference

## Project Overview
MyDailyFace is a Progressive Web App (PWA) built with Angular 19 that allows users to take daily selfies with sophisticated camera animations and optional Google Drive sync.

## Key Features
- **Full-screen camera interface** with immersive capture experience
- **Sophisticated photo animations**: Flash → Freeze frame → Jump to Browse tab
- **Photo browsing** with proper CSS Grid layout
- **Play feature** for slideshow viewing at 10 FPS
- **Google Drive integration** for photo backup
- **Hidden debug menu** with test data generation and animation speed controls
- **PWA capabilities** with offline support and installation

## Architecture

### Technology Stack
- **Frontend**: Angular 19 with standalone components
- **Storage**: IndexedDB for local photo storage
- **Camera**: WebRTC getUserMedia API
- **Animations**: Pure JavaScript using Web Animations API
- **Styling**: CSS Grid layout with iOS-style design
- **PWA**: Angular Service Worker

### Project Structure
```
/
├── src/
│   ├── app/
│   │   ├── take-picture/          # Camera interface with animations
│   │   ├── browse-pictures/       # Photo gallery
│   │   ├── play/                  # Slideshow feature
│   │   ├── settings/              # App settings and Google Drive config
│   │   └── services/
│   │       ├── camera.service.ts          # Camera and photo capture
│   │       ├── indexed-db.service.ts      # Local storage
│   │       ├── google-drive.service.ts    # Cloud sync
│   │       └── test-data-generator.service.ts  # Debug features
│   ├── environments/              # API keys and config
│   └── styles.css                 # Global styles with animation support
├── public/                        # PWA assets and icons
├── angular.json                   # Angular configuration
└── package.json                   # Dependencies
```

## Key Components

### TakePictureComponent
- **Full-screen camera interface** with floating capture button
- **Animation sequence**: 
  1. Flash effect (configurable duration)
  2. Freeze frame display (mirrored like video)
  3. Jump animation to Browse tab (pure JS with Web Animations API)
  4. Returns to camera without navigation
- **Centralized timing configuration** in `ANIMATION_TIMINGS` object
- **Debug-friendly** with animation speed multipliers

### Animation System
- **Pure JavaScript** animations using Web Animations API
- **Dynamic positioning** calculated from actual DOM elements
- **Speed debugging** with 2x, 5x, 10x slowdown options
- **Synchronized timing** between CSS and JavaScript

### Services Architecture
- **CameraService**: WebRTC camera access and photo capture
- **IndexedDbService**: Local photo storage with efficient retrieval
- **GoogleDriveService**: OAuth 2.0 integration with restricted API keys
- **TestDataGeneratorService**: SVG face generation and animation debugging
- **LocaleService**: Multi-language support with browser detection

## Development Notes

### Build Commands
```bash
# Development server
npm run start

# Production build
npm run build -- --base-href /MyDailyFace/

# Internationalization builds
npm run build:i18n          # Build all languages (generates separate locale builds)
npm run build:prod          # Production build with all languages
npm run extract-i18n        # Extract i18n keys (NOTE: not used - translations are hardcoded)

# Deploy to GitHub Pages
# Automated via GitHub Actions on push to main branch
```

### Environment Setup
- **Node.js**: Requires v20.19+ or v22.12+ for Angular CLI
- **API Keys**: Google Drive credentials in `src/environments/environment.ts`
- **Development**: Uses `https://127.0.0.1:4443` for camera access

### Animation Timing Configuration
All animation timings are centralized in `TakePictureComponent.ANIMATION_TIMINGS`:
```typescript
private readonly ANIMATION_TIMINGS = {
  FLASH_DURATION: 500,              // How long the white flash shows
  FREEZE_FRAME_VIEW_TIME: 500,      // How long user sees the freeze frame
  JUMP_ANIMATION_DURATION: 1000,    // Duration of the jump animation
  DOM_READY_DELAY: 50,              // Small delay for DOM readiness
  // Calculated timings
  get ANIMATION_START_TIME() { return this.FLASH_DURATION + this.FREEZE_FRAME_VIEW_TIME; },
  get NAVIGATION_TIME() { return this.ANIMATION_START_TIME + this.JUMP_ANIMATION_DURATION; }
};
```

### Hidden Debug Features
Access by tapping version 7 times in Settings:
- **Test data generation**: 2 years of daily SVG faces
- **Animation speed controls**: 2x, 5x, 10x slowdown
- **Clear test data**: Remove only generated photos

### Internationalization (i18n)
- **Supported languages**: English, French, German, Italian, Portuguese
- **Browser language detection**: Automatically detects user's preferred language
- **Manual language switching**: Dropdown in Settings > Appearance > Language

#### Translation System Architecture
The project uses a **custom translation system** rather than Angular's built-in i18n:

**Key Components:**
- **LocaleService** (`src/app/services/locale.service.ts`): Core translation service with hardcoded translations
- **TranslatePipe** (`src/app/pipes/translate.pipe.ts`): Custom pipe for `{{ 'key' | translate }}` syntax
- **XLF Files** (`src/locale/messages.{lang}.xlf`): Documentation only - NOT used at runtime

**How it works:**
1. **Translation Keys**: Use format like `'settings.configure_alignment_lines'` in templates
2. **Template Usage**: `{{ 'settings.title' | translate }}` calls `TranslatePipe`
3. **Runtime Resolution**: `TranslatePipe` → `LocaleService.getTranslation()` → hardcoded lookup
4. **Fallback**: Returns the key itself if translation not found

**Adding New Translations:**
1. ⚠️ **IMPORTANT**: Add to `LocaleService.getTranslations()` method, NOT just XLF files
2. **All Languages**: Must add to all language sections in LocaleService (en, fr, de, it, pt)
3. **XLF Files**: Update for documentation consistency but not required for functionality
4. **Testing**: Use `npm run build` to verify - missing translations show as raw keys

**Translation Object Structure** (`src/app/services/locale.service.ts:107-1655`):
```typescript
private getTranslations(languageCode: string): Record<string, string> {
  const translations: Record<string, Record<string, string>> = {
    'en': {
      'nav.take_picture': 'Take Picture',
      'settings.title': 'Settings',
      // ... hardcoded English translations
    },
    'fr': {
      'nav.take_picture': 'Prendre photo',
      'settings.title': 'Paramètres', 
      // ... hardcoded French translations
    }
    // ... other languages
  };
  return translations[languageCode] || translations['en'];
}
```

**Browser Language Detection**: `LocaleService` automatically detects browser language and saves preference to localStorage

## Security Considerations

### Google Drive API
- **Client ID**: Safe to expose publicly
- **API Key**: Must be restricted in Google Cloud Console:
  - HTTP referrers: `https://derekroth.github.io/*`, `https://127.0.0.1:*`
  - APIs: Google Drive API only
- **Environment files**: Excluded from git via `.gitignore`

### Camera Permissions
- Requires HTTPS for getUserMedia API
- Graceful fallback with error messages
- No persistent camera access

## Deployment

### GitHub Pages
- **URL**: https://derekroth.github.io/MyDailyFace2/
- **Automated deployment**: GitHub Actions workflow builds and deploys on push to main
- **Build output**: `dist/my-daily-face/browser/` → GitHub Pages root
- **PWA support**: Service worker for offline functionality

### GitHub Actions Workflow
- **Triggers**: Push to main branch or manual workflow dispatch
- **Build process**: Node.js 22, npm ci, Angular build with base-href
- **Environment setup**: Creates environment.ts from example using GitHub secrets
- **Deployment**: Uses official GitHub Pages actions for secure deployment
- **Permissions**: Minimal required permissions for pages deployment

### Required GitHub Configuration
Set these in your repository Settings → Secrets and variables → Actions:

**Variables** (Repository variables):
- **GOOGLE_CLIENT_ID**: Your Google OAuth client ID (safe to be public)

**Secrets** (Repository secrets):
- **GOOGLE_API_KEY**: Your restricted Google Drive API key (keep private)

### Build Considerations
- **Base href**: Set to `/MyDailyFace2/` for GitHub Pages
- **Browser subfolder**: Angular 19 outputs to `browser/` subdirectory
- **Bundle warnings**: Settings and browse-pictures components exceed 4KB budget

## Common Issues & Solutions

### Animation Problems
- **Timing synchronization**: Use `testDataGenerator.getAdjustedTimeout()` for all setTimeout calls
- **Position calculation**: Wait for DOM readiness with small delay
- **Z-index conflicts**: Ensure bottom navigation has higher z-index than animated elements

### Camera Issues
- **HTTPS required**: Local development uses self-signed certificates
- **Permission denied**: Check browser camera permissions
- **Video not displaying**: Verify getUserMedia browser support

### Google Drive Integration
- **Auth errors**: Check API key restrictions and authorized origins
- **Upload failures**: Verify folder creation permissions
- **CORS issues**: Ensure proper domain restrictions

### Debug Overlay & Global UI Persistence
- **Problem**: UI elements in page components disappear during navigation
- **Solution**: Move persistent UI to app component level with service-based state management
- **Pattern**: Use BehaviorSubject in service for cross-component state sharing
- **Implementation**: Error overlay moved from settings component to app component for global persistence
- **State Management**: `ErrorTrackerService` manages both error collection and overlay visibility
- **Persistence**: LocalStorage integration ensures overlay state survives page refreshes

## Development Workflow

### Adding New Features
1. **Plan with TodoWrite**: Use todo system for complex tasks
2. **Follow conventions**: Match existing code style and patterns
3. **Update timings**: Add to centralized timing configuration if needed
4. **Test animations**: Use debug speed controls for verification
5. **Security review**: Ensure no secrets in code

### Testing
- **Manual testing**: Use generated test data (2 years of photos)
- **Animation testing**: Debug speed controls for detailed inspection
- **Mobile testing**: PWA works on mobile devices with camera
- **Offline testing**: Service worker provides offline functionality

## File References for Quick Access

### Core Animation Logic
- `src/app/take-picture/take-picture.component.ts:147-232` - `animateToBottomNav()` method
- `src/app/take-picture/take-picture.component.ts:23-35` - Animation timing configuration

### Service Implementations
- `src/app/services/camera.service.ts` - Camera and photo capture logic
- `src/app/services/google-drive.service.ts:32-50` - OAuth initialization
- `src/app/services/test-data-generator.service.ts:255-259` - Animation speed helpers
- `src/app/services/locale.service.ts` - Multi-language support and browser detection
- `src/app/services/error-tracker.service.ts:142-151` - Global error overlay state management
- `src/app/app.component.ts:39-51,117-137` - App-level error overlay implementation

### Key UI Components
- `src/app/settings/settings.component.ts:147-166` - Hidden debug menu activation
- `src/app/browse-pictures/browse-pictures.component.css:1-45` - CSS Grid layout
- `src/app/app.component.css:19-30` - Bottom navigation structure

## Notes for Future Development
- Animation system is fully JavaScript-based for better control
- All timing is centralized and debug-friendly
- Google Drive integration is client-side only with proper restrictions
- PWA is ready for mobile installation and offline use
- Code follows Angular 19 standalone component architecture