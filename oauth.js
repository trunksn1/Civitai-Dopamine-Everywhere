// Civitai Dopamine Everywhere - OAuth 2.0 (Authorization Code + PKCE)
//
// Why OAuth instead of an API key: a Civitai API key grants full account
// power (upload, delete, spend Buzz). This extension only ever needs to read
// a balance, so it asks for the single `BuzzRead` scope. If the stored token
// leaks, the worst case is that someone learns your Buzz balance.
//
// Civitai requires PKCE S256 for every client and rejects `client_secret`
// from public clients, so there is no secret in this repository — the client
// ID is a public identifier, not a credential.

// Public client ID from Civitai → Account Settings → OAuth Applications.
// Registered as a "Browser / Mobile App (public)" with Buzz→Read only.
const DEFAULT_CLIENT_ID = '0dc8cae6-8d5a-4164-ad52-b4f5c693991d';

const AUTH_BASE = 'https://auth.civitai.com';
const AUTHORIZE_ENDPOINT = `${AUTH_BASE}/api/auth/oauth/authorize`;
const TOKEN_ENDPOINT = `${AUTH_BASE}/api/auth/oauth/token`;

// Bit 16 of Civitai's scope bitmask: "View buzz balance & history".
// This is the only permission the extension requests.
const SCOPE_BUZZ_READ = 65536;

// Refresh a little before the token actually expires so a check that starts
// just under the wire doesn't race the expiry.
const REFRESH_SKEW_MS = 60 * 1000;

const SESSION_KEY = 'oauthSession';

// The alarm and the popup can both ask for a token at the same time. Sharing
// one in-flight refresh avoids burning the single-use refresh token twice.
let refreshInFlight = null;

// The client ID normally lives in the constant above. The storage override
// exists so a new client ID can be tried without editing and reloading code.
export async function getClientId() {
  if (DEFAULT_CLIENT_ID) return DEFAULT_CLIENT_ID;
  const { oauthClientId } = await chrome.storage.local.get('oauthClientId');
  return oauthClientId || '';
}

export async function isConfigured() {
  return Boolean(await getClientId());
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// --- session storage -------------------------------------------------------

export async function readSession() {
  const { [SESSION_KEY]: session } = await chrome.storage.local.get(SESSION_KEY);
  if (!session?.accessToken || !session?.refreshToken) return null;
  return session;
}

async function writeSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export async function clearSession() {
  await chrome.storage.local.remove(SESSION_KEY);
}

// --- token endpoint --------------------------------------------------------

async function requestToken(form, previous) {
  let res;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(form).toString()
    });
  } catch (error) {
    throw new Error(`Could not reach Civitai's token endpoint: ${error.message}`);
  }

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Fall through to the status-based error below.
  }

  if (!res.ok) {
    const detail = body?.error_description || body?.error || `HTTP ${res.status}`;
    const error = new Error(`Civitai rejected the token request: ${detail}`);
    error.status = res.status;
    // A dead or already-used refresh token can only be fixed by signing in
    // again — callers use this to decide whether to drop the session.
    error.needsReconnect = res.status === 400 || res.status === 401;
    throw error;
  }

  const accessToken = body?.access_token;
  if (!accessToken || !/^bearer$/i.test(body?.token_type || 'Bearer')) {
    throw new Error('Civitai returned an unusable token response.');
  }

  // Refresh responses may omit an unchanged refresh token or scope.
  const expiresIn = Number(body.expires_in);
  return {
    accessToken,
    refreshToken: body.refresh_token || previous?.refreshToken || '',
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 3600 * 1000),
    scope: Number(body.scope) || previous?.scope || SCOPE_BUZZ_READ
  };
}

// --- sign in ---------------------------------------------------------------

export async function connect() {
  const clientId = await getClientId();
  if (!clientId) {
    throw new Error('No Civitai OAuth client ID is configured for this build.');
  }

  const verifier = randomToken();
  const state = randomToken();
  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl = new URL(AUTHORIZE_ENDPOINT);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', String(SCOPE_BUZZ_READ));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', await codeChallenge(verifier));
  authUrl.searchParams.set('code_challenge_method', 'S256');

  let callbackUrl;
  try {
    callbackUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });
  } catch (error) {
    // Chrome reports a closed window as a generic failure; treat it as a cancel.
    throw new Error(`Civitai sign-in did not complete: ${error.message}`);
  }

  if (!callbackUrl) throw new Error('Civitai sign-in was cancelled.');

  const params = new URL(callbackUrl).searchParams;

  const remoteError = params.get('error');
  if (remoteError) {
    throw new Error(remoteError === 'access_denied'
      ? 'Civitai sign-in was declined.'
      : `Civitai sign-in failed: ${params.get('error_description') || remoteError}`);
  }

  // launchWebAuthFlow already pins the redirect URL, but the state check is
  // what proves this callback belongs to the request we just started.
  if (params.get('state') !== state) {
    throw new Error('Civitai sign-in could not be verified. Please try again.');
  }

  const code = params.get('code');
  if (!code) throw new Error('Civitai did not return an authorization code.');

  const session = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier
  }, null);

  await writeSession(session);
  return session;
}

export async function disconnect() {
  // Civitai issues no revocation endpoint for public clients, so sign-out is
  // local. The server-side grant is removed from Civitai account settings.
  refreshInFlight = null;
  await clearSession();
}

// --- token access ----------------------------------------------------------

async function refreshSession(session) {
  const clientId = await getClientId();
  try {
    const refreshed = await requestToken({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: clientId
    }, session);
    await writeSession(refreshed);
    return refreshed;
  } catch (error) {
    if (error.needsReconnect) await clearSession();
    throw error;
  }
}

// Returns a usable access token, refreshing first if needed, or null when no
// session exists at all (the caller then falls back to the API key).
export async function getAccessToken() {
  const session = await readSession();
  if (!session) return null;

  if (Date.now() < session.expiresAt - REFRESH_SKEW_MS) {
    return session.accessToken;
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshSession(session).finally(() => {
      refreshInFlight = null;
    });
  }

  const refreshed = await refreshInFlight;
  return refreshed.accessToken;
}
