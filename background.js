// Civitai Dopamine Everywhere - Background Script
// This script runs in the background and periodically checks for new buzz notifications

import {
  connect as oauthConnect,
  disconnect as oauthDisconnect,
  getAccessToken,
  readSession,
  isConfigured
} from './oauth.js';

const CIVITAI_API_ENDPOINT = 'https://civitai.com/api/trpc/buzz.getBuzzAccount?input=%7B%22json%22%3A%7B%22authed%22%3Atrue%7D%7D';
const DEFAULT_CHECK_INTERVAL = 30; // Default: 30 seconds (Chrome's alarm minimum)

// Initialize the extension when installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Civitai Dopamine Everywhere installed');

  // Initialize storage with defaults
  const { checkInterval, lastBuzzBalance } = await chrome.storage.local.get(['checkInterval', 'lastBuzzBalance']);

  if (!checkInterval) {
    await chrome.storage.local.set({ checkInterval: DEFAULT_CHECK_INTERVAL });
  }

  if (!lastBuzzBalance) {
    await chrome.storage.local.set({
      lastBuzzBalance: {
        blue: 0,
        green: 0,
        yellow: 0
      }
    });
  }

  // Create alarm with the saved interval
  await updateCheckAlarm(checkInterval || DEFAULT_CHECK_INTERVAL);

  // Do an immediate check
  setTimeout(checkForBuzzNotifications, 2000);
});

// Also check on startup (when browser restarts)
chrome.runtime.onStartup.addListener(async () => {
  console.log('Civitai Dopamine Everywhere started');

  // Restore alarm with saved interval
  const { checkInterval } = await chrome.storage.local.get('checkInterval');
  await updateCheckAlarm(checkInterval || DEFAULT_CHECK_INTERVAL);

  setTimeout(checkForBuzzNotifications, 2000);
});

// Listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkBuzzNotifications') {
    checkForBuzzNotifications();
  }
});

// Resolve the credential to send, preferring OAuth over the API key fallback.
//
// Either way this is a Bearer token: we can't rely on the session cookie,
// because this fetch runs from the service worker's chrome-extension:// origin,
// which is cross-site to civitai.com, and Civitai's SameSite=Lax session cookie
// is NOT sent on cross-site fetches. A Bearer token works from any context.
async function resolveAuth() {
  if (await readSession()) {
    const token = await getAccessToken();
    if (token) return { token, mode: 'oauth' };
  }

  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (apiKey) return { token: apiKey, mode: 'apikey' };

  return null;
}

// Fetch the current balance with whichever credential is active.
// Throws with a usable message so both the alarm and the popup can report it.
async function fetchBuzzBalance() {
  const auth = await resolveAuth();

  if (!auth) {
    const error = new Error('Not connected — open the popup and sign in with Civitai');
    error.code = 'NO_AUTH';
    throw error;
  }

  const response = await fetch(CIVITAI_API_ENDPOINT, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.token}`
    }
  });

  if (!response.ok) {
    const error = new Error(auth.mode === 'oauth'
      ? `Civitai refused the OAuth token (${response.status})`
      : `Civitai refused the API key (${response.status})`);
    error.code = 'HTTP_' + response.status;
    error.mode = auth.mode;
    throw error;
  }

  const data = await response.json();

  // Response format: {"result":{"data":{"json":{"blue":12870,"green":0,"yellow":15063}}}}
  if (!data.result?.data?.json) {
    const error = new Error('Unexpected API response format');
    error.code = 'BAD_SHAPE';
    throw error;
  }

  return { balance: data.result.data.json, mode: auth.mode };
}

// Main function to check for buzz notifications
async function checkForBuzzNotifications() {
  try {
    let currentBalance;
    try {
      ({ balance: currentBalance } = await fetchBuzzBalance());
    } catch (error) {
      console.log('Buzz check skipped:', error.message);
      return;
    }

    // Get the last known balance
    const storage = await chrome.storage.local.get(['lastBuzzBalance', 'balanceInitialized']);

    // On the first successful fetch (or right after the key changes), record the
    // balance as a silent baseline. Otherwise the whole balance would register as
    // one giant "increase" and spam notifications.
    if (!storage.balanceInitialized) {
      await chrome.storage.local.set({
        lastBuzzBalance: currentBalance,
        balanceInitialized: true
      });
      console.log('Baseline buzz balance recorded:', currentBalance);
      return;
    }

    const lastBalance = storage.lastBuzzBalance || { blue: 0, green: 0, yellow: 0 };

    // Check if any buzz type increased
    const increases = {};

    for (const buzzType of ['blue', 'green', 'yellow']) {
      const current = currentBalance[buzzType] || 0;
      const last = lastBalance[buzzType] || 0;

      if (current > last) {
        const increase = current - last;
        increases[buzzType] = increase;
      }
    }

    // Show separate notification for each buzz type that increased
    // This creates the satisfying stacking effect!
    if (Object.keys(increases).length > 0) {
      console.log('Buzz increased!', increases);

      // Send notifications with a small delay between them for better stacking
      let delay = 0;
      for (const [buzzType, amount] of Object.entries(increases)) {
        setTimeout(() => {
          sendBuzzNotification(amount, buzzType);
        }, delay);
        delay += 200; // 200ms between each notification
      }
    }

    // Update stored balance
    chrome.storage.local.set({
      lastBuzzBalance: currentBalance
    });

  } catch (error) {
    console.error('Error checking for buzz notifications:', error);
  }
}

// Send buzz notification to content script
async function sendBuzzNotification(amount, buzzType = 'blue') {
  try {
    // Get the currently active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tabs.length === 0) {
      console.log('No active tab found');
      return;
    }

    const activeTab = tabs[0];

    // Send message to content script
    chrome.tabs.sendMessage(activeTab.id, {
      type: 'SHOW_BUZZ_NOTIFICATION',
      amount: amount,
      buzzType: buzzType
    }).catch(error => {
      console.log('Could not send message to content script:', error);
    });
  } catch (error) {
    console.error('Error sending buzz notification:', error);
  }
}

// Re-syncing the baseline keeps a credential change from registering the whole
// balance as one giant "increase" and spamming notifications.
async function resetBaseline() {
  await chrome.storage.local.set({ balanceInitialized: false });
}

// Report which credential is active and whether Civitai actually accepts it.
async function reportAuthStatus() {
  const session = await readSession();
  const { apiKey } = await chrome.storage.local.get('apiKey');
  const mode = session ? 'oauth' : (apiKey ? 'apikey' : 'none');

  if (mode === 'none') {
    return { mode, connected: false, configured: await isConfigured() };
  }

  try {
    await fetchBuzzBalance();
    return { mode, connected: true, configured: await isConfigured() };
  } catch (error) {
    return {
      mode,
      connected: false,
      configured: await isConfigured(),
      detail: error.message
    };
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_INTERVAL') {
    updateCheckAlarm(message.interval).then(() => {
      console.log('Check interval updated to', message.interval, 'seconds');
      sendResponse({ success: true });
    });
    return true; // Keep the message channel open for async response
  }

  if (message.type === 'CHECK_NOW') {
    checkForBuzzNotifications().then(() => {
      sendResponse({ success: true });
    });
    return true; // Keep the message channel open for async response
  }

  if (message.type === 'AUTH_STATUS') {
    reportAuthStatus().then(sendResponse);
    return true;
  }

  if (message.type === 'OAUTH_CONNECT') {
    // The sign-in window steals focus, which closes the popup — so the flow
    // has to run here in the service worker, not in the popup's page context.
    oauthConnect()
      .then(async () => {
        await resetBaseline();
        await checkForBuzzNotifications();
        sendResponse({ success: true });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'OAUTH_DISCONNECT') {
    oauthDisconnect()
      .then(async () => {
        await resetBaseline();
        sendResponse({ success: true });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Chrome will not fire an alarm more often than every 30 seconds. A shorter
// period is silently ignored, which is why sub-30s intervals never ran.
const MIN_ALARM_SECONDS = 30;

// Update the check alarm with a new interval
async function updateCheckAlarm(intervalSeconds) {
  // Clear existing alarm
  await chrome.alarms.clear('checkBuzzNotifications');

  // Clamp to Chrome's 30-second minimum so the alarm actually fires
  const effectiveSeconds = Math.max(MIN_ALARM_SECONDS, intervalSeconds);
  const periodInMinutes = effectiveSeconds / 60;

  // Set both delay and period so the first automatic check happens promptly
  // and then repeats on the interval.
  await chrome.alarms.create('checkBuzzNotifications', {
    delayInMinutes: periodInMinutes,
    periodInMinutes: periodInMinutes
  });

  if (intervalSeconds < MIN_ALARM_SECONDS) {
    console.log('Requested interval', intervalSeconds, 's is below Chrome\'s 30s minimum; using 30s');
  }
  console.log('Alarm updated: checking every', effectiveSeconds, 'seconds');
}

// For testing purposes: manually trigger a notification
// This can be called from the browser console
function testNotification(amount = 100) {
  sendBuzzNotification(amount);
}
