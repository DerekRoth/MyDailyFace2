/**
 * Token Refresh Service Worker
 * Handles background token refresh for Google Drive authentication
 * Works alongside Angular's ngsw-worker for PWA functionality
 */

const TOKEN_REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minutes
const STORAGE_KEY = 'googleDriveAuthData';
const LAST_REFRESH_KEY = 'lastTokenRefresh';

// Message types for communication with main app
const MESSAGE_TYPES = {
  REFRESH_TOKEN: 'REFRESH_TOKEN',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  REFRESH_FAILED: 'REFRESH_FAILED',
  SCHEDULE_REFRESH: 'SCHEDULE_REFRESH',
  CHECK_TOKEN_STATUS: 'CHECK_TOKEN_STATUS'
};

let refreshTimer = null;

/**
 * Schedule next token refresh
 */
function scheduleTokenRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    attemptTokenRefresh();
    scheduleTokenRefresh(); // Schedule next refresh
  }, TOKEN_REFRESH_INTERVAL);

  console.log('[TokenWorker] Next refresh scheduled in', TOKEN_REFRESH_INTERVAL / 1000 / 60, 'minutes');
}

/**
 * Check if token needs refresh
 */
function isTokenExpiringSoon(expiresAt) {
  if (!expiresAt) return true;
  
  const expiry = new Date(expiresAt);
  const now = new Date();
  const timeUntilExpiry = expiry.getTime() - now.getTime();
  const bufferTime = 10 * 60 * 1000; // 10 minutes buffer
  
  return timeUntilExpiry <= bufferTime;
}

/**
 * Attempt to refresh the token silently
 */
async function attemptTokenRefresh() {
  try {
    console.log('[TokenWorker] Attempting background token refresh');
    
    // Get stored auth data
    const authData = await getStoredAuthData();
    if (!authData || !authData.accessToken) {
      console.log('[TokenWorker] No stored auth data found');
      return false;
    }

    // Check if token actually needs refresh
    if (!isTokenExpiringSoon(authData.expiresAt)) {
      console.log('[TokenWorker] Token still valid, skipping refresh');
      return true;
    }

    // Try silent token refresh using iframe approach
    const newToken = await performSilentTokenRefresh(authData);
    
    if (newToken) {
      // Update stored data
      await updateStoredAuthData(newToken);
      
      // Notify main app
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: MESSAGE_TYPES.TOKEN_REFRESHED,
            token: newToken
          });
        });
      });
      
      // Update last refresh time
      await setItem(LAST_REFRESH_KEY, Date.now());
      console.log('[TokenWorker] Token refreshed successfully');
      return true;
    } else {
      console.log('[TokenWorker] Silent token refresh failed');
      
      // Notify main app that refresh failed
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: MESSAGE_TYPES.REFRESH_FAILED,
            reason: 'Silent refresh failed'
          });
        });
      });
      return false;
    }
    
  } catch (error) {
    console.error('[TokenWorker] Token refresh error:', error);
    
    // Notify main app of error
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: MESSAGE_TYPES.REFRESH_FAILED,
          reason: error.message
        });
      });
    });
    return false;
  }
}

/**
 * Perform silent token refresh using hidden iframe
 */
async function performSilentTokenRefresh(authData) {
  return new Promise((resolve) => {
    try {
      // Create a hidden iframe for silent auth
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      
      // Build authorization URL with prompt=none for silent refresh
      const authUrl = new URL('https://accounts.google.com/oauth/v2/auth');
      authUrl.searchParams.set('client_id', authData.clientId || '');
      authUrl.searchParams.set('response_type', 'token');
      authUrl.searchParams.set('redirect_uri', self.location.origin);
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
      authUrl.searchParams.set('prompt', 'none');
      authUrl.searchParams.set('include_granted_scopes', 'true');
      
      let resolved = false;
      
      const cleanup = () => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        clearTimeout(timeoutId);
      };
      
      // Set timeout for silent refresh
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, 10000); // 10 second timeout
      
      iframe.onload = () => {
        try {
          // Try to extract token from iframe URL
          const iframeUrl = iframe.contentWindow?.location?.href;
          if (iframeUrl && iframeUrl.includes('access_token=')) {
            const urlParams = new URLSearchParams(iframeUrl.split('#')[1]);
            const accessToken = urlParams.get('access_token');
            const expiresIn = urlParams.get('expires_in') || '3600';
            
            if (accessToken && !resolved) {
              resolved = true;
              cleanup();
              
              const expiresAt = new Date(Date.now() + (parseInt(expiresIn) * 1000));
              resolve({
                access_token: accessToken,
                expires_in: expiresIn,
                expires_at: expiresAt.toISOString()
              });
            }
          }
        } catch (e) {
          // Cross-origin access blocked - expected in many cases
          console.log('[TokenWorker] Cross-origin iframe access blocked (expected)');
        }
        
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      };
      
      iframe.onerror = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      };
      
      iframe.src = authUrl.toString();
      document.body?.appendChild(iframe) || self.appendChild?.(iframe);
      
    } catch (error) {
      console.error('[TokenWorker] Silent refresh setup error:', error);
      resolve(null);
    }
  });
}

/**
 * Storage helpers using IndexedDB
 */
async function getStoredAuthData() {
  try {
    const encoded = await getItem(STORAGE_KEY);
    if (!encoded) return null;
    
    return JSON.parse(atob(encoded));
  } catch (error) {
    console.error('[TokenWorker] Failed to get stored auth data:', error);
    return null;
  }
}

async function updateStoredAuthData(tokenData) {
  try {
    const existing = await getStoredAuthData() || {};
    
    const updatedData = {
      ...existing,
      accessToken: tokenData.access_token,
      expiresAt: tokenData.expires_at,
      lastRefresh: new Date().toISOString()
    };
    
    const encoded = btoa(JSON.stringify(updatedData));
    await setItem(STORAGE_KEY, encoded);
    
    return true;
  } catch (error) {
    console.error('[TokenWorker] Failed to update stored auth data:', error);
    return false;
  }
}

/**
 * Simple IndexedDB wrapper for service worker storage
 */
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TokenRefreshDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('tokens')) {
        db.createObjectStore('tokens');
      }
    };
  });
}

async function setItem(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tokens'], 'readwrite');
    const store = transaction.objectStore('tokens');
    const request = store.put(value, key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getItem(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tokens'], 'readonly');
    const store = transaction.objectStore('tokens');
    const request = store.get(key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Service Worker Event Listeners
 */

// Handle messages from main app
self.addEventListener('message', (event) => {
  console.log('[TokenWorker] Received message:', event.data);
  
  switch (event.data.type) {
    case MESSAGE_TYPES.SCHEDULE_REFRESH:
      scheduleTokenRefresh();
      break;
      
    case MESSAGE_TYPES.REFRESH_TOKEN:
      attemptTokenRefresh();
      break;
      
    case MESSAGE_TYPES.CHECK_TOKEN_STATUS:
      checkTokenStatus().then(status => {
        event.ports?.[0]?.postMessage({ status });
      });
      break;
  }
});

// Handle service worker activation
self.addEventListener('activate', (event) => {
  console.log('[TokenWorker] Service worker activated');
  
  event.waitUntil(
    self.clients.claim().then(() => {
      // Start token refresh scheduling
      scheduleTokenRefresh();
    })
  );
});

// Handle installation
self.addEventListener('install', (event) => {
  console.log('[TokenWorker] Service worker installed');
  self.skipWaiting(); // Take control immediately
});

// Background sync for token refresh
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-token-refresh') {
    console.log('[TokenWorker] Background sync triggered');
    event.waitUntil(attemptTokenRefresh());
  }
});

// Handle periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'token-refresh') {
    console.log('[TokenWorker] Periodic background sync triggered');
    event.waitUntil(attemptTokenRefresh());
  }
});

async function checkTokenStatus() {
  const authData = await getStoredAuthData();
  if (!authData) return { authenticated: false };
  
  return {
    authenticated: !!authData.accessToken,
    expiresAt: authData.expiresAt,
    needsRefresh: isTokenExpiringSoon(authData.expiresAt),
    lastRefresh: authData.lastRefresh
  };
}

console.log('[TokenWorker] Token refresh service worker loaded');