# Service Worker Testing Guide

## Current Status
✅ Service worker has been implemented with offline functionality
✅ Production build includes service worker files (ngsw-worker.js, ngsw.json)
✅ Offline queue service and app update service are integrated

## Testing Steps

### 1. Production Build Testing (Recommended)
Since you have a production build running, you can test at:
- **HTTP**: http://127.0.0.1:8081
- **HTTPS**: https://lvh.me:4443 (if you have HTTPS certificates)

### 2. Verify Service Worker Registration
1. Open browser dev tools (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Look for **Service Workers** section
4. You should see `ngsw-worker.js` registered

### 3. Test Offline Functionality
1. Open the app in browser
2. Go to **Network** tab in dev tools
3. Check "Offline" checkbox or set throttling to "Offline"
4. Reload the page - app should still work
5. Try taking a photo - it should queue for sync
6. Check **Application** > **Local Storage** for `offline_queue` entries

### 4. Test Update Notifications
1. Make a small change to the app
2. Build again: `npm run build -- --base-href /`
3. Refresh the served version
4. You should see an update notification banner

## Service Worker Files Generated
- `ngsw-worker.js` - Main service worker
- `ngsw.json` - Configuration and asset manifest
- `safety-worker.js` - Fallback for unsupported browsers

## Offline Features Implemented
- ✅ Photo capture queuing when offline
- ✅ Background sync when connection restored
- ✅ Visual offline/online indicators
- ✅ Google Drive sync queue management
- ✅ App update notifications
- ✅ Multi-language support for all messages

## Key Services
1. **OfflineQueueService**: Manages photo sync queue
2. **AppUpdateService**: Handles app version updates
3. **OfflineIndicatorComponent**: Shows status to user

## HTTPS Requirement
For production deployment, service workers require HTTPS. Your GitHub Pages deployment at `https://dailyface.me` will work perfectly with service workers.

## Troubleshooting
- If service worker doesn't register, check browser console for errors
- Clear browser cache and hard refresh (Ctrl+Shift+R)
- Service workers are sticky - you may need to unregister old ones in dev tools
