const TOKEN_KEY = 'google_calendar_access_token';
const TOKEN_EXPIRY_KEY = 'google_calendar_token_expiry';

export const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

export function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

  if (!token) return null;
  if (expiry && Date.now() >= Number(expiry)) {
    clearStoredToken();
    return null;
  }

  return token;
}

export function saveToken(token: string, expiresIn?: number) {
  localStorage.setItem(TOKEN_KEY, token);
  if (expiresIn) {
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
  } else {
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export function waitForGoogleIdentity(timeoutMs = 10000): Promise<GoogleIdentity> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(window.google);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer);
        resolve(window.google);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error('Google Identity Services failed to load.'));
      }
    }, 100);
  });
}

export function requestAccessToken(clientId: string): Promise<string> {
  return waitForGoogleIdentity().then(
    (google) =>
      new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: CALENDAR_READONLY_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error_description || response.error || 'Google sign-in failed.'));
              return;
            }

            saveToken(response.access_token, response.expires_in);
            resolve(response.access_token);
          },
        });

        client.requestAccessToken({ prompt: '' });
      }),
  );
}

export function signIn(clientId: string): Promise<string> {
  return waitForGoogleIdentity().then(
    (google) =>
      new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: CALENDAR_READONLY_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error_description || response.error || 'Google sign-in failed.'));
              return;
            }

            saveToken(response.access_token, response.expires_in);
            resolve(response.access_token);
          },
        });

        client.requestAccessToken({ prompt: 'consent' });
      }),
  );
}

export function signOut() {
  const token = getStoredToken();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token);
  }
  clearStoredToken();
}
