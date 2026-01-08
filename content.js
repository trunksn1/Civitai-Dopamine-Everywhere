// Civitai Dopamine Everywhere - Content Script
// This script runs on every webpage and displays buzz notifications

// Track active notifications
const activeNotifications = [];
const NOTIFICATION_HEIGHT = 80; // Approximate height of each notification
const NOTIFICATION_GAP = 10; // Gap between stacked notifications

// Buzz type colors matching Civitai
const BUZZ_COLORS = {
  blue: {
    color: '#339af0',
    name: 'Blue'
  },
  green: {
    color: '#51cf66',
    name: 'Green'
  },
  yellow: {
    color: '#ffd43b',
    name: 'Yellow'
  }
};

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_BUZZ_NOTIFICATION') {
    showBuzzNotification(message.amount, message.buzzType || 'blue');
    sendResponse({ success: true });
  }
  return true;
});

// Function to create and display the buzz notification popup
function showBuzzNotification(amount, buzzType = 'blue') {
  // Get buzz type info
  const buzzInfo = BUZZ_COLORS[buzzType] || BUZZ_COLORS.blue;

  // Create the notification container
  const notification = document.createElement('div');
  notification.className = 'civitai-buzz-notification';
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');
  notification.setAttribute('data-buzz-type', buzzType);

  // Create the notification content (matching Civitai's Mantine UI style)
  notification.innerHTML = `
    <div class="civitai-buzz-notification-body">
      <div class="civitai-buzz-notification-title">
        <p class="civitai-buzz-title-text">User Buzz Update</p>
      </div>
      <div class="civitai-buzz-notification-description">
        <div class="civitai-buzz-content-group">
          <div class="civitai-buzz-icon-wrapper" style="color: ${buzzInfo.color}">
            <svg class="civitai-buzz-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"></path>
            </svg>
          </div>
          <p class="civitai-buzz-message">
            <span class="civitai-buzz-amount" style="color: ${buzzInfo.color}">${amount} ${buzzInfo.name} Buzz</span> has been added to your Buzz account
          </p>
        </div>
      </div>
    </div>
    <button class="civitai-buzz-close" aria-label="Close notification">
      <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
        <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor"></path>
      </svg>
    </button>
  `;

  // Add to the page
  document.body.appendChild(notification);

  // Add to tracking array
  activeNotifications.push(notification);

  // Position the notification (new ones appear at the bottom, pushing others up)
  updateNotificationPositions();

  // Add entrance animation
  setTimeout(() => {
    notification.classList.add('civitai-buzz-notification-show');
  }, 10);

  // Add close button functionality
  const closeButton = notification.querySelector('.civitai-buzz-close');
  closeButton.addEventListener('click', () => {
    closeNotification(notification);
  });

  // Auto-remove after 5 seconds
  setTimeout(() => {
    closeNotification(notification);
  }, 5000);
}

// Update positions of all notifications
function updateNotificationPositions() {
  activeNotifications.forEach((notif, index) => {
    // Stack from bottom to top (newest at bottom)
    // Index 0 is at the bottom, higher indices go up
    const bottomPosition = 20 + (index * (NOTIFICATION_HEIGHT + NOTIFICATION_GAP));
    notif.style.bottom = `${bottomPosition}px`;
  });
}

// Function to close and remove the notification
function closeNotification(notification) {
  if (!notification || !notification.parentNode) {
    return;
  }

  // Add exit animation
  notification.classList.remove('civitai-buzz-notification-show');
  notification.classList.add('civitai-buzz-notification-hide');

  // Remove from tracking array
  const index = activeNotifications.indexOf(notification);
  if (index > -1) {
    activeNotifications.splice(index, 1);
  }

  // Reposition remaining notifications
  updateNotificationPositions();

  // Remove from DOM after animation
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}
