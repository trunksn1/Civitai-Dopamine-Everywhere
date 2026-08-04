# 🎊 Civitai Dopamine Everywhere

A Chrome extension that brings Civitai's satisfying buzz notifications to **every website you visit**. Get that dopamine hit wherever you browse!

![Extension Demo](https://img.shields.io/badge/Version-1.1.0-blue) ![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)

## ✨ Features

- 🔔 **Buzz Notifications Anywhere** - Get Civitai buzz notifications on any website (YouTube, Reddit, anywhere!)
- 🎨 **Color-Coded Notifications** - Blue, Green, and Yellow buzz each get their own colored notification
- 📚 **Satisfying Notification Stacking** - Multiple buzz rewards stack beautifully on your screen
- ⚙️ **Adjustable Check Interval** - Choose how often to check (10 seconds to 5 minutes)
- 💰 **Live Buzz Balance** - See your total buzz and breakdown by type
- 🧪 **Test Mode** - Preview how notifications look before you earn buzz

## 🎯 How It Works

The extension:
1. Checks your Civitai buzz balance every 15 seconds (adjustable)
2. When your buzz increases, it shows a notification on whatever site you're browsing
3. Each buzz type (Blue/Green/Yellow) gets its own notification for maximum satisfaction!

## 📦 Installation

### From Source (Unpacked)

1. **Download this repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Civitai-Dopamine-Everywhere.git
   ```

2. **Open Chrome Extensions**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

3. **Load the extension**
   - Click "Load unpacked"
   - Select the `Civitai-Dopamine-Everywhere` folder

4. **Connect your account**
   - Click the extension icon and press **Sign in with Civitai**
   - Approve the single permission it asks for (Buzz → Read)
   - The extension starts checking your balance immediately

## 🔐 Authentication

The extension signs in through **Civitai OAuth** (Authorization Code + PKCE S256).
It requests exactly one scope — `BuzzRead` (bit value `65536`, "View buzz balance
& history"). It cannot post, upload, react, or spend Buzz.

This matters: a Civitai **API key grants full account access**, so a leaked key is
an account compromise. A leaked `BuzzRead` token only reveals a balance.

The client ID in `oauth.js` is a *public* identifier — Civitai rejects
`client_secret` from public clients, so there is no secret in this repository.

**API key fallback.** The popup keeps an "Use an API key instead" section for when
OAuth is unavailable. OAuth takes precedence whenever a session exists.

### Re-registering the OAuth app

The redirect URI contains the extension ID, so `manifest.json` pins that ID with a
`key` field — the public half of an RSA keypair.

**Store the matching private key outside this folder**, in a backed-up location.
Chrome warns if it finds a `.pem` in the extension directory, because everything here
gets bundled into a packaged build. Keep the backup: replacing that key changes the
extension ID, which invalidates the registered redirect URI.

| Setting | Value |
| --- | --- |
| App type | Browser / Mobile App (public) |
| Redirect URI | `https://dejkfhkidangiagiggehaibdahhdnmdo.chromiumapp.org/` |
| Allowed origins | *(blank)* |
| Permissions | Buzz → Read only |

⚠️ Publishing to the Chrome Web Store assigns a **store-controlled extension ID**
that overrides this one. That changes the redirect URI, so the OAuth app has to be
re-registered against the store ID before a store release.

## 🎮 Usage

### Settings Popup

Click the extension icon to:
- 📊 View your current buzz balance (total + breakdown by type)
- ⏱️ Adjust check interval (10s, 15s, 30s, 1min, 2min, 5min)
- 🧪 Test notifications with the "Test Notification" button
- 🔄 Manually check buzz with "Check Buzz Now"

### Notifications

When you earn buzz on Civitai:
- **Blue Buzz** - Blue lightning icon and border
- **Green Buzz** - Green lightning icon and border
- **Yellow Buzz** - Yellow lightning icon and border

Multiple buzz types stack vertically for that satisfying dopamine rush! 🎉

## 🛠️ Technical Details

### Files Structure

```
Civitai-Dopamine-Everywhere/
├── manifest.json       # Extension configuration
├── oauth.js            # Civitai OAuth (PKCE) - sign-in, tokens, refresh
├── background.js       # Background worker (checks buzz API)
├── content.js          # Content script (shows notifications)
├── popup.html          # Settings popup UI
├── popup.js            # Settings popup logic
├── popup.css           # Notification styles
└── README.md          # This file
```

### API Endpoint

Uses Civitai's tRPC API:
```
https://civitai.com/api/trpc/buzz.getBuzzAccount
```

Response format:
```json
{
  "result": {
    "data": {
      "json": {
        "blue": 12870,
        "green": 0,
        "yellow": 15063
      }
    }
  }
}
```

### Permissions

- `storage` - Save settings, credentials, and last buzz balance
- `alarms` - Schedule periodic buzz checks
- `scripting` - Inject notification UI
- `tabs` - Send messages to active tab
- `identity` - Run the Civitai OAuth sign-in flow
- `https://civitai.com/*` - Access Civitai API
- `https://auth.civitai.com/*` - OAuth authorize and token endpoints
- `<all_urls>` - Show notifications on any site

## 🎨 Customization

Want to customize? Easy penings:

**Change check interval:** Edit line 5 in `background.js`:
```javascript
const DEFAULT_CHECK_INTERVAL = 30; // seconds (Chrome's alarm minimum is 30s)
```

**Change notification colors:** Edit lines 10-22 in `content.js`:
```javascript
const BUZZ_COLORS = {
  blue: { color: '#339af0', name: 'Blue' },
  green: { color: '#51cf66', name: 'Green' },
  yellow: { color: '#ffd43b', name: 'Yellow' }
};
```

**Change notification duration:** Edit line 73 in `content.js`:
```javascript
setTimeout(() => {
  closeNotification(notification);
}, 5000); // 5 seconds
```

## 🐛 Troubleshooting

**Notifications not appearing?**
- Click the extension icon and check the status row says "Signed in with Civitai"
- If it says the token was refused, sign out and sign in again
- Try clicking "Check Buzz Now" in the popup

**Sign-in window opens but nothing happens?**
- The registered redirect URI must exactly match the extension ID shown in
  `chrome://extensions/`, including the trailing slash
- Check the service worker console (`chrome://extensions/` → "service worker")

**Extension not loading?**
- Make sure all files are in the same folder
- Check for errors in `chrome://extensions/`
- Try reloading the extension

**Notifications showing on extension pages?**
- This is normal - Chrome injects content scripts everywhere
- You can ignore notifications on `chrome://` pages

## 🚀 Future Ideas

- [ ] Custom notification sounds
- [ ] Notification history
- [ ] Desktop notifications option
- [ ] Support for other Civitai events (comments, likes, etc.)
- [ ] Dark/light theme toggle

## 📄 License

MIT License - feel free to modify and share!

## 🙏 Credits

- Built for the Civitai community
- Uses Civitai's unofficial API
- Inspired by Civitai's Mantine UI notifications

## ⚠️ Disclaimer

This is an unofficial extension and is not affiliated with or endorsed by Civitai. Use at your own risk. The extension makes API calls to Civitai's servers - please be respectful and don't abuse the API.

---

**Enjoy your dopamine hits! 🎉**

If you like this extension, consider sharing it with other Civitai users!
