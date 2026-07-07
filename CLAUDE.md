# DailyFace.me - Claude Reference

## Project Overview
DailyFace.me is a Progressive Web App (PWA) built with Angular 19 that allows users to take daily selfies with sophisticated camera animations and optional Google Drive sync.

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
- **CameraService**: WebRTC photo capture, thumbnail generation, photo index (metadata-only listing)
- **CameraStreamService**: Shared MediaStream; pauses on tab leave and fully stops the hardware after a 30s idle
- **IndexedDbService**: Local photo storage (DB version 3: `synced` index, stored thumbnails, lazy blob→ArrayBuffer migration)
- **GoogleDriveService**: OAuth 2.0 via Google Identity Services; access token kept in memory only, idempotent uploads, paginated downloads
- **OfflineQueueService**: The single queue for Drive uploads/deletions; stores photoIds (never bytes) and survives reloads
- **CaptureSettingsService**: BehaviorSubject-based cross-component capture settings (overlay opacity, alignment guides)
- **TestDataGeneratorService**: SVG face generation and animation debugging
- **LocaleService**: Multi-language support, browser detection, locale-aware date/time formatting

**Memory rule**: never load all photo bytes at once. Use `getPhotoIndex()` (metadata + thumbnails) for lists and `getPhotoDataUrl()` for on-demand full resolution.

## Development Notes

### Build Commands
```bash
# Development server
npm run start

# Production build (also used by CI)
npm run build

# Unit tests (also run in CI before every deploy)
npm test -- --watch=false --browsers=ChromeHeadless

# Deploy to GitHub Pages
# Automated via GitHub Actions on push to main branch (tests must pass first)
```

Note: translations are resolved at runtime by `LocaleService` — there is no Angular
`--localize` build. The old `build:i18n`/`build:prod` scripts and XLF files were removed.

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
- **LocaleService** (`src/app/services/locale.service.ts`): Core translation service with hardcoded translations (built once and memoized — the pipe is impure and calls it every change-detection cycle)
- **TranslatePipe** (`src/app/pipes/translate.pipe.ts`): Custom pipe for `{{ 'key' | translate }}` syntax

**How it works:**
1. **Translation Keys**: Use format like `'settings.configure_alignment_lines'` in templates
2. **Template Usage**: `{{ 'settings.title' | translate }}` calls `TranslatePipe`
3. **Runtime Resolution**: `TranslatePipe` → `LocaleService.getTranslation()` → hardcoded lookup
4. **Fallback**: Returns the key itself if translation not found

**Adding New Translations:**
1. ⚠️ **IMPORTANT**: Add to the `buildTranslations()` table in `LocaleService`
2. **All Languages**: Must add to all language sections (en, fr, de, it, pt) — the
   `locale.service.spec.ts` key-parity test fails the build if any language is missing a key
3. **Testing**: `npm test` verifies key parity; missing translations show as raw keys at runtime

**Translation Object Structure** (`src/app/services/locale.service.ts`):
```typescript
private buildTranslations(): Record<string, Record<string, string>> {
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
  return translations;
}
```

**Date/time formatting**: use `LocaleService.formatRelativeDate()` / `formatTime()` —
never hardcode `'en-US'` in `toLocaleDateString` calls.

**Browser Language Detection**: `LocaleService` automatically detects browser language and saves preference to localStorage

## Security Considerations

### Google Drive API
- **Client ID**: Safe to expose publicly
- **API Key**: Must be restricted in Google Cloud Console:
  - HTTP referrers: `https://dailyface.me/*`, `https://derekroth.github.io/*`, `https://127.0.0.1:*`
  - APIs: Google Drive API only
- **Environment files**: Excluded from git via `.gitignore`
- **Tokens**: The Drive access token lives in memory only — never persist tokens to
  localStorage/IndexedDB. Silent renewal goes through GIS `requestAccessToken({prompt: ''})`
- **CSP**: `src/index.html` ships a Content-Security-Policy meta tag scoped to self +
  Google auth/API hosts — update it when adding external resources

### Camera Permissions
- Requires HTTPS for getUserMedia API
- Graceful fallback with error messages
- No persistent camera access

## Deployment

### GitHub Pages
- **URL**: Custom domain https://dailyface.me, pure Github pages URL was https://derekroth.github.io/MyDailyFace2/
- **Automated deployment**: GitHub Actions workflow builds and deploys on push to main
- **Build output**: `dist/my-daily-face/browser/` → GitHub Pages root
- **PWA support**: Service worker for offline functionality

### GitHub Actions Workflow
- **Triggers**: Push to main branch or manual workflow dispatch
- **Build process**: Node.js 22, npm ci, headless unit tests, Angular build
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
- **Base href**: Used to be set to `/MyDailyFace2/` for GitHub Pages before custom domain was configured
- **Browser subfolder**: Angular 19 outputs to `browser/` subdirectory
- **Lazy routes**: only the camera screen is eager; all other routes use `loadComponent`,
  keeping the initial bundle under the 600 kB budget

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
- `src/app/take-picture/take-picture.component.ts` - `animateToBottomNav()` and the `ANIMATION_TIMINGS` configuration

### Service Implementations
- `src/app/services/camera.service.ts` - Camera capture, thumbnails, photo index
- `src/app/services/google-drive.service.ts` - OAuth (GIS token client) and bidirectional sync
- `src/app/services/offline-queue.service.ts` - Upload/delete queue (photoIds only)
- `src/app/services/capture-settings.service.ts` - Shared overlay/alignment settings
- `src/app/services/locale.service.ts` - Translations, browser detection, date formatting
- `src/app/services/error-tracker.service.ts` - Global error overlay state management

### Key UI Components
- `src/app/settings/settings.component.ts` - Hidden debug menu activation (`onVersionTap`)
- `src/app/browse-pictures/browse-pictures.component.css` - CSS Grid layout
- `src/app/app.component.css` - Bottom navigation structure

## Invariants — do not regress these

These encode bugs that shipped once and were painful to find. Check against this list
when touching sync, storage, or the translate pipe.

### Sync (the queue + background sync must stay coordinated)
- **The offline queue must never contain photo bytes.** It is persisted with
  `JSON.stringify`, which silently turns an `ArrayBuffer` into `{}` — the original bug
  uploaded the string `"[object Object]"` to Drive and marked the real photo as synced.
  Queue photoIds; re-read bytes from IndexedDB at upload time.
  `offline-queue.service.spec.ts` pins this.
- **Uploads must be idempotent.** Two paths can upload the same photo (queue tick +
  30s background sync), and a retry after a lost success response must not duplicate.
  `uploadPhoto()` checks Drive for the filename first — keep that check.
- **Never delete a local photo that isn't backed up.** Conflict resolution downloads
  and saves the Drive copy *before* deleting the local one, and skips the replacement
  entirely when the local photo is unsynced.
- **Always queue Drive deletions**, independent of the current auth state (the token
  expires hourly), and never count offline/unauthenticated as a retry — a dropped
  delete action means the photo resurrects on the next download sync.
- **Only HTTP 401 means bad credentials.** Google returns 403 for rate limiting and
  quota; treating it as an auth failure signs the user out on a transient error.
- Drive `files.list` calls must follow `nextPageToken` (hard cap of 1000 per page) and
  scope queries to the app folder (`'folderId' in parents`), with single quotes escaped.

### IndexedDB (currently version 3)
- **Never `await` inside a transaction callback** — IndexedDB transactions auto-commit
  when the microtask queue drains, so any `FileReader`/fetch await makes subsequent
  `put()` calls throw `TransactionInactiveError`. This silently broke the v1→v2
  migration; blob→ArrayBuffer conversion now happens lazily in `getPhoto()`.
- **Booleans are not valid index keys.** That's why records carry a numeric
  `syncedFlag` (0/1) mirroring `syncedToGoogleDrive`, maintained in `savePhoto` and
  `updatePhotoSyncStatus`. Keep both fields in sync when adding write paths.
- Schema changes: bump `dbVersion`, do structural work in `onupgradeneeded` (cursor
  loops are fine there — they're event-driven), and keep `onblocked`/`onversionchange`
  handling intact.

### Rendering & change detection
- **TranslatePipe is impure** — anything reachable from `getTranslation()` runs for
  every binding on every change-detection cycle. The translation table is built once
  and memoized; never put allocation or I/O in that path.
- `@angular/animations` is **not installed** and there is no `provideAnimations()`.
  A `[@trigger]` binding in any template throws NG05105 at runtime (this killed the
  auth notification once). Use CSS animations/transitions.
- Long `*ngFor` lists need `trackBy`, and don't replace large arrays wholesale on
  scroll events — mutate entries in place (see the fullscreen swiper).
- Components that schedule timeouts or add document/window listeners must clean up in
  `ngOnDestroy` (see the `schedule()` helper pattern in take-picture/browse-pictures,
  `takeUntil(destroy$)` for subscriptions). Cross-component state goes through a
  BehaviorSubject service (`CaptureSettingsService`), never localStorage + StorageEvent
  (real `storage` events don't fire in the tab that wrote the value).

### Testing & verification
- `tsconfig.spec.json` must keep `src/polyfills.ts` in `include` — the karma builder
  references it, and without it zero tests run.
- Component specs need `provideRouter(...)` (RouterLink injects ActivatedRoute) and,
  for AppComponent, `provideServiceWorker('ngsw-worker.js', { enabled: false })`.
- The locale key-parity spec fails if any of the 5 languages is missing a key — when
  adding translations, add to *all* language blocks in one edit session.
- To verify the built app in a browser: `npm run build`, serve
  `dist/my-daily-face/browser` with `python3 -m http.server <port> --bind 127.0.0.1`,
  then drive it with the puppeteer MCP. Listen for `securitypolicyviolation` events to
  catch CSP breakage (127.0.0.1 counts as a secure context, so most things work).
- `ng serve` has the service worker disabled by design (`enabled: !isDevMode()`).
  For SW testing use the built app via `node https-server.js` (port 8443).

## Notes for Future Development
- Animation system is fully JavaScript-based for better control
- All timing is centralized and debug-friendly
- Google Drive integration is client-side only with proper restrictions
- PWA is ready for mobile installation and offline use
- Code follows Angular 19 standalone component architecture
- Workflow: commits go directly to main; pushing triggers the Pages deploy, and the
  CI test step gates it

- in CSS, contents should dictate the size of their containers unless we actually want an overflow. Using overflow: hidden should be avoided in most cases. Fluid layout is preferred over media queries. min/max dimensions, clamp(), percentages are preferred over absolute dimensions.
- use the puppeteer MCP when you need to check what is displayed in the app, console messages or storage