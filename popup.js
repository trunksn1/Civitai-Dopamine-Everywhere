// Civitai Dopamine Everywhere - Popup Script
// This script handles the popup UI and settings

const CIVITAI_API_ENDPOINT = 'https://civitai.com/api/trpc/buzz.getBuzzAccount?input=%7B%22json%22%3A%7B%22authed%22%3Atrue%7D%7D';

document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  const intervalSelect = document.getElementById('intervalSelect');
  const testButton = document.getElementById('testButton');
  const checkNowButton = document.getElementById('checkNowButton');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const buzzAmount = document.getElementById('buzzAmount');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveKeyButton = document.getElementById('saveKeyButton');

  // Load current settings
  loadSettings();

  // Load saved API key
  loadApiKey();

  // Load current buzz balance
  loadBuzzBalance();

  // Check connection status
  checkStatus();

  // Handle API key save
  saveKeyButton.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();

    // Save the key and reset the baseline so the next check re-syncs silently
    // (without dumping the whole balance as a fake increase).
    await chrome.storage.local.set({ apiKey: key, balanceInitialized: false });

    showToast(key ? 'API key saved!' : 'API key cleared');

    // Trigger an immediate check and refresh the UI
    chrome.runtime.sendMessage({ type: 'CHECK_NOW' }, () => {
      setTimeout(() => {
        loadBuzzBalance();
        checkStatus();
      }, 1000);
    });
  });

  // Handle interval change
  intervalSelect.addEventListener('change', async () => {
    const interval = parseInt(intervalSelect.value);

    // Save to storage
    await chrome.storage.local.set({ checkInterval: interval });

    // Notify background script to update the alarm
    chrome.runtime.sendMessage({
      type: 'UPDATE_INTERVAL',
      interval: interval
    });

    showToast('Settings saved!');
  });

  // Handle test button - send multiple notifications to demonstrate stacking
  testButton.addEventListener('click', async () => {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab) {
      // Send 3 different colored notifications with delays to show stacking
      const testNotifications = [
        { amount: 2, buzzType: 'blue', delay: 0 },
        { amount: 5, buzzType: 'yellow', delay: 200 },
        { amount: 3, buzzType: 'green', delay: 400 }
      ];

      testNotifications.forEach(({ amount, buzzType, delay }) => {
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_BUZZ_NOTIFICATION',
            amount: amount,
            buzzType: buzzType
          }).catch(() => {
            showToast('Please refresh the page first!');
          });
        }, delay);
      });

      showToast('Test notifications sent!');
    }
  });

  // Handle check now button
  checkNowButton.addEventListener('click', () => {
    checkNowButton.textContent = 'Checking...';
    checkNowButton.disabled = true;

    chrome.runtime.sendMessage({ type: 'CHECK_NOW' }, () => {
      checkNowButton.textContent = 'Check Buzz Now';
      checkNowButton.disabled = false;

      // Reload buzz balance
      setTimeout(() => {
        loadBuzzBalance();
        showToast('Buzz checked!');
      }, 1000);
    });
  });

  // Load settings from storage
  async function loadSettings() {
    const { checkInterval } = await chrome.storage.local.get('checkInterval');

    if (checkInterval) {
      intervalSelect.value = checkInterval;
    } else {
      // Default to 15 seconds
      intervalSelect.value = 15;
      await chrome.storage.local.set({ checkInterval: 15 });
    }
  }

  // Load buzz balance from storage
  async function loadBuzzBalance() {
    const { lastBuzzBalance } = await chrome.storage.local.get('lastBuzzBalance');

    if (lastBuzzBalance) {
      const blue = lastBuzzBalance.blue || 0;
      const green = lastBuzzBalance.green || 0;
      const yellow = lastBuzzBalance.yellow || 0;
      const total = blue + green + yellow;

      buzzAmount.textContent = total.toLocaleString();

      // Update individual buzz type amounts
      document.getElementById('blueAmount').textContent = blue.toLocaleString();
      document.getElementById('greenAmount').textContent = green.toLocaleString();
      document.getElementById('yellowAmount').textContent = yellow.toLocaleString();
    } else {
      buzzAmount.textContent = '-';
      document.getElementById('blueAmount').textContent = '-';
      document.getElementById('greenAmount').textContent = '-';
      document.getElementById('yellowAmount').textContent = '-';
    }
  }

  // Load the saved API key into the input
  async function loadApiKey() {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (apiKey) {
      apiKeyInput.value = apiKey;
    }
  }

  // Check connection status by validating the API key against Civitai
  async function checkStatus() {
    try {
      const { apiKey } = await chrome.storage.local.get('apiKey');

      if (!apiKey) {
        statusDot.classList.add('inactive');
        statusText.textContent = 'No API key set — add one below';
        return;
      }

      const response = await fetch(CIVITAI_API_ENDPOINT, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (response.ok) {
        statusDot.classList.remove('inactive');
        statusText.textContent = 'Connected to Civitai';
      } else {
        statusDot.classList.add('inactive');
        statusText.textContent = `Invalid API key (${response.status})`;
      }
    } catch (error) {
      statusDot.classList.add('inactive');
      statusText.textContent = 'Connection error';
    }
  }

  // Simple toast notification
  function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #339af0;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      z-index: 10000;
      animation: slideUp 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideDown 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @keyframes slideDown {
    from {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
  }
`;
document.head.appendChild(style);
