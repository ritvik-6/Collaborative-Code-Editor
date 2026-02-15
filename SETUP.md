# Quick Setup Guide

## Installation

```bash
cd code-editor-step1
npm install
```

## Running

**Terminal 1 - WebSocket Server:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

## Testing Collaboration

1. Open `http://localhost:5173`
2. Click "📋 Copy Link" button
3. Open copied URL in new browser/tab
4. Type in either editor
5. See changes appear in both! ✨

## Troubleshooting

**Port 8080 already in use:**
```javascript
// server.js - Change line 3
const PORT = 3001;  // Use different port
```

**WebSocket connection failed:**
- Check server is running (`npm run server`)
- Check console for errors (F12)
- Verify URL is `ws://localhost:8080`

**Changes not syncing:**
- Check "Connected" status in header
- Refresh both browsers
- Restart server
