// Civitai Dopamine Everywhere - Background Script
// This script runs in the background and periodically checks for new buzz notifications

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

// Main function to check for buzz notifications
async function checkForBuzzNotifications() {
  try {
    // Authenticate with an API key (Bearer token).
    // We can't rely on the session cookie: this fetch runs from the service
    // worker's chrome-extension:// origin, which is cross-site to civitai.com,
    // and Civitai's SameSite=Lax session cookie is NOT sent on cross-site
    // fetches. The API key works from any context.
    const { apiKey } = await chrome.storage.local.get('apiKey');

    if (!apiKey) {
      console.log('No Civitai API key set — open the extension popup to add one');
      return;
    }

    // Fetch buzz balance from Civitai API
    const response = await fetch(CIVITAI_API_ENDPOINT, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      console.log('Failed to fetch buzz balance:', response.status, '— check that your API key is valid');
      return;
    }

    const data = await response.json();

    // Extract buzz balances from API response
    // Response format: {"result":{"data":{"json":{"blue":12870,"green":0,"yellow":15063}}}}
    if (!data.result?.data?.json) {
      console.log('Unexpected API response format', data);
      return;
    }

    const currentBalance = data.result.data.json;

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

// Buzz type display names for the native-notification fallback
const BUZZ_NAMES = { blue: 'Blue', green: 'Green', yellow: 'Yellow' };

// Send buzz notification to the user. We prefer the in-page (content script)
// notification because it matches Civitai's UI, but the content script isn't
// reachable everywhere: chrome:// pages, the Web Store, the PDF viewer, and any
// tab that was already open before the extension was installed/reloaded all
// reject the message. In those cases we fall back to a native desktop
// notification so the buzz is never silently lost.
async function sendBuzzNotification(amount, buzzType = 'blue') {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (activeTab && activeTab.id != null) {
      try {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: 'SHOW_BUZZ_NOTIFICATION',
          amount: amount,
          buzzType: buzzType
        });
        return; // delivered in-page, done
      } catch (error) {
        console.log('Content script unreachable, falling back to desktop notification:', error?.message || error);
      }
    } else {
      console.log('No active tab, falling back to desktop notification');
    }

    showDesktopNotification(amount, buzzType);
  } catch (error) {
    console.error('Error sending buzz notification:', error);
  }
}

// Native desktop notification fallback
function showDesktopNotification(amount, buzzType = 'blue') {
  const name = BUZZ_NAMES[buzzType] || 'Blue';
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'User Buzz Update',
      message: `${amount} ${name} Buzz has been added to your Buzz account`,
      priority: 1
    });
  } catch (error) {
    console.error('Could not show desktop notification:', error);
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
