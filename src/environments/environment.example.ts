export const environment = {
  production: false,
  googleDrive: {
    // Get your Client ID from Google Cloud Console
    clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    // Get your API Key from Google Cloud Console and restrict it to:
    // - HTTP referrers: https://derekroth.github.io/*, https://127.0.0.1:*
    // - APIs: Google Drive API only
    apiKey: 'YOUR_RESTRICTED_API_KEY_HERE'
  }
};