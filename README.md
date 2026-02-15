# 🚀 Collaborative Code Editor

A real-time collaborative code editor built with React, Monaco Editor, and WebSockets. Multiple users can edit code simultaneously in shared rooms with live synchronization.

## ✨ Features

### 🔥 Core Features
- **Real-time Collaboration** - Multiple users can edit simultaneously
- **User Presence** - View all active users with avatars and colors
- **Multi-Language Support** - JavaScript, Python, Java, C++
- **Code Execution** - Run JavaScript locally, Python/Java/C++ via Piston API
- **Room-Based Sessions** - Share URLs to collaborate instantly

### 🎨 UI/UX
- **Glassmorphism Design** - Modern, minimal, professional aesthetic
- **Dark/Light Theme** - Toggle between themes with smooth transitions
- **Responsive Layout** - Works on desktop, tablet, and mobile
- **Monaco Editor** - Same editor that powers VS Code

### 🔐 Security
- **Sandboxed Execution** - JavaScript runs in isolated iframes
- **No Backend Data Storage** - In-memory room management
- **WebSocket Communication** - Encrypted real-time sync

## 📷 Screenshots

<img width="1897" height="886" alt="image" src="https://github.com/user-attachments/assets/b27fa1a0-f7a1-4716-9c81-29ebf998574c" />

<img width="1897" height="879" alt="image" src="https://github.com/user-attachments/assets/8823a837-9ad4-4e17-aa66-2e920c2e5fbe" />

<img width="1897" height="882" alt="image" src="https://github.com/user-attachments/assets/333dd85d-b85f-47f4-b695-85351772b621" />




## 🏗️ Architecture

### Backend (WebSocket Server)

**File:** `server.js`

```javascript
// In-memory storage
const rooms = Map {
'room-abc123': {
code: 'console.log("hello");',
clients: Set<WebSocket>
}
}
```

**Key Functions:**

1. **handleJoin** - Client joins room
- Create room if doesn't exist
- Add client to room's Set
- Send current code to new client
- Broadcast user count to others

2. **handleCodeChange** - Client edits code
- Update room's code (last-write-wins)
- Broadcast to ALL clients EXCEPT sender

3. **handleLeave** - Client disconnects
- Remove from room's Set
- Delete room if empty
- Notify remaining clients

**Broadcast Strategy:**
```javascript
broadcast(roomId, message, excludeClient) {
room.clients.forEach(client => {
if (client !== excludeClient) { // Don't echo back to sender
client.send(message)
}
})
}
```

---

### Frontend (React + Monaco)

**WebSocket Connection:**
```javascript
useEffect(() => {
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
ws.send({ type: 'join', roomId: 'room-xyz' });
};

ws.onmessage = (event) => {
const { type, code } = JSON.parse(event.data);

if (type === 'code-update') {
isRemoteChange.current = true; // CRITICAL: Prevent loop
setCode(code);
}
};
}, []);
```

**Editor Change Handler:**
```javascript
const handleEditorChange = (value) => {
setCode(value);

// Don't send if this was a remote change
if (isRemoteChange.current) {
isRemoteChange.current = false;
return;
}

// Send to server
ws.send({ type: 'code-change', code: value });
};
```

---

## 🛠️ Tech Stack

**Frontend:**
- React 18.2
- Monaco Editor (VS Code editor)
- WebSockets (native)

**Backend:**
- Node.js
- ws (WebSocket library)

**External APIs:**
- Piston API (for Python/Java/C++ execution)

## 📁 Project Structure
```
collaborative-code-editor/
├── src/
│ ├── App.jsx # Main React component
│ ├── App.css # Styles (glassmorphism design)
│ ├── main.jsx # React entry point
│ └── index.css # Global styles
├── server.js # WebSocket server
├── package.json # Dependencies
├── vite.config.js # Vite configuration
└── README.md # This file
```

## 🖥 Running Locally
### 1. Install Dependencies
```bash
cd Collaborative-Code-Editor-main
npm install
```

### 2. Start WebSocket Server
```bash
npm run server
```
Server runs on `ws://localhost:8080`

### 3. Start Frontend (New Terminal)
```bash
npm run dev
```
Frontend runs on `http://localhost:5173`

### 4. Test Collaboration
1. Open `http://localhost:5173` in Browser 1
2. Copy the room URL (click "📋 Copy Link")
3. Open the copied URL in Browser 2
4. Type in either editor → See changes in both!

## 🔄 Synchronization Flow

```
User A types "hello"
↓
handleEditorChange fires
↓
Check: Is this remote? → No
↓
Send to WebSocket server
↓
Server receives code-change
↓
Server updates room.code = "hello"
↓
Server broadcasts to all EXCEPT User A
↓
User B receives code-update
↓
Set isRemoteChange = true
↓
Update Monaco editor with "hello"
↓
handleEditorChange fires (from Monaco)
↓
Check: Is this remote? → Yes
↓
Skip WebSocket send (LOOP PREVENTED)
↓
Reset isRemoteChange = false
```

---


## 📉 Limitations of Last-Write-Wins

### 1. Concurrent Edits Can Conflict

**Scenario:**
```
Time 0: Code = "hello"

User A edits line 1: "hello world" → Send at T1
User B edits line 2: "hello\ngoodbye" → Send at T2

Server receives A first → Code = "hello world"
Server receives B second → Code = "hello\ngoodbye"

Result: User A's change is LOST ❌
```

### 2. No Conflict Resolution

**Problem:**
- Two users edit same line simultaneously
- Last message wins
- No merge, no notification
- Silent data loss possible

### 3. Character Position Issues

**Problem:**
```
User A types at position 5
User B types at position 5 simultaneously

Both edits apply → Garbled text
```

### 4. No Operational Transform

**Missing features:**
- Position adjustments based on other changes
- Intent preservation
- Commutative operations

---

## 🧪 Testing

### Test Concurrent Editing
1. Open two browsers
2. Both type simultaneously
3. Observe last-write-wins behavior

### Test Disconnect/Reconnect
1. Stop server (`Ctrl+C`)
2. Try editing → Status shows "Disconnected"
3. Restart server → Auto-reconnects

### Test Room Persistence
1. User A edits code
2. User A closes browser
3. User B joins same room → Sees A's code ✅

---

## 🔧 Configuration

**Change WebSocket URL:**
```javascript
// App.jsx
const WS_URL = 'ws://your-server.com:8080';
```

**Change Server Port:**
```javascript
// server.js
const PORT = 3001;
```

**Room ID Strategy:**
```javascript
// Auto-generate
const roomId = 'room-' + Math.random().toString(36).substr(2, 9);

// From URL
const roomId = new URLSearchParams(location.search).get('room');

// User input
const roomId = prompt('Enter room name');
```

---
## 🐛 Troubleshooting

**WebSocket connection failed:**
- Ensure server is running (`npm run server`)
- Check `WS_URL` matches server port
- Check firewall settings

**Cursor not showing:**
- Refresh both browsers
- Ensure Monaco Editor loaded properly
- Check browser console for errors

**Code execution failing:**
- **JavaScript:** Check for syntax errors
- **Python/Java/C++:** Check Piston API is accessible
- Check network tab for API failures

## 📝 Summary

**What I Built:**
- ✅ Real-time collaborative editor
- ✅ WebSocket sync (last-write-wins)
- ✅ Room-based collaboration
- ✅ Local code execution
- ✅ Connection status UI

**What I learned:**
- How WebSockets enable real-time sync
- Why execution stays local (security + performance)
- Last-write-wins limitations
- How to prevent infinite loops
- Path to CRDT upgrade

**Next steps:**
- Add cursor awareness
- Implement user presence
- Add chat feature
- Migrate to Yjs for conflict-free editing

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code's editor
- [Piston API](https://github.com/engineer-man/piston) - Code execution engine
- [ws](https://github.com/websockets/ws) - WebSocket library

## 📧 Contact

Created by Ritvik Ganga  

Project Link: [https://github.com/ritvik-6/Collaborative-Code-Editor](https://github.com/ritvik-6/Collaborative-Code-Editor)

---
