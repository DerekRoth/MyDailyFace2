# Google Drive Integration Setup

## Overview
The Google Drive integration is now properly configured to use app-level credentials instead of requiring users to create their own API keys. Users simply need to click "Connect" and authorize the app.

## Developer Setup (One-time)

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Name it something like "MyDailyFace App"

### 2. Enable Google Drive API
1. In your project, go to "APIs & Services" > "Library"
2. Search for "Google Drive API"
3. Click on it and click "Enable"

### 3. Create Credentials

#### Create API Key:
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API Key"
3. Copy the API key
4. (Optional) Restrict the key to Google Drive API only

#### Create OAuth 2.0 Client ID:
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client ID"
3. Choose "Web application"
4. Add your authorized origins:
   - `https://127.0.0.1:4443` (for development)
   - `https://yourdomain.com` (for production)
5. Copy the Client ID

### 4. Update Environment Files
Replace the placeholder values in these files:

**src/environments/environment.ts** (development):
```typescript
export const environment = {
  production: false,
  googleDrive: {
    apiKey: 'YOUR_ACTUAL_API_KEY_HERE',
    clientId: 'YOUR_ACTUAL_CLIENT_ID_HERE'
  }
};
```

**src/environments/environment.prod.ts** (production):
```typescript
export const environment = {
  production: true,
  googleDrive: {
    apiKey: 'YOUR_ACTUAL_API_KEY_HERE',
    clientId: 'YOUR_ACTUAL_CLIENT_ID_HERE'
  }
};
```

## User Experience

### For End Users:
1. ✅ Go to Settings
2. ✅ Click "Connect" under Google Drive Sync
3. ✅ Authorize the app in the Google popup
4. ✅ Enable auto-sync toggle
5. ✅ Take photos - they automatically sync!

### What Users DON'T Need to Do:
- ❌ Create Google Cloud accounts
- ❌ Generate API keys
- ❌ Configure any technical settings
- ❌ Enter credentials manually

## Security Notes
- API credentials are built into the app (not exposed to users)
- Users only grant access to their Google Drive files
- App creates a dedicated "MyDailyFace" folder
- No access to other Google Drive files
- Users can revoke access anytime in their Google Account settings

## Testing
1. Update the environment files with your real credentials
2. Rebuild the app: `npm run build`
3. Test the flow at https://127.0.0.1:4443
4. Go to Settings > Connect to Google Drive
5. Authorize the app
6. Take a photo and verify it syncs