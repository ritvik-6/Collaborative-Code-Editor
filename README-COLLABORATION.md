# Real-Time Collaborative Code Editor

Multi-user code editor with WebSocket-based real-time synchronization.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd code-editor-step1
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

---

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
    if (client !== excludeClient) {  // Don't echo back to sender
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
      isRemoteChange.current = true;  // CRITICAL: Prevent loop
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

## 🔑 Preventing Infinite Loops

**The Problem:**
```
User A types → Send to server → User B receives → Update editor
                                                      ↓
                               ← Send to server ← onChange fires
                                       ↓
                               INFINITE LOOP! ❌
```

**The Solution:**
```javascript
const isRemoteChange = useRef(false);

// When receiving from WebSocket:
ws.onmessage = (event) => {
  isRemoteChange.current = true;  // Mark as remote
  setCode(event.data.code);
};

// When editor changes:
const handleEditorChange = (value) => {
  if (isRemoteChange.current) {
    isRemoteChange.current = false;
    return;  // Don't send back to server
  }
  ws.send({ code: value });  // Send to server
};
```

---

## ⚠️ Why Execution is NOT Shared

**Code is shared, but execution is local:**

```javascript
// User A clicks "Run Code"
const runCode = () => {
  // Executes in User A's browser only
  const iframe = document.createElement('iframe');
  iframe.contentWindow.eval(code);  // Local execution
  
  // Output shown only to User A
  setOutput([...logs]);
};
```

**Why?**
1. **Security** - Users can run any code safely in their own sandbox
2. **Performance** - No server overhead for code execution
3. **Independence** - Users can test different versions
4. **Privacy** - Outputs aren't shared (may contain sensitive data)

**Shared:**
- ✅ Editor content
- ✅ Language selection
- ✅ Cursor position (not implemented yet)

**NOT Shared:**
- ❌ Code execution
- ❌ Console output
- ❌ Run button clicks

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

## 🎯 When This Approach Works

**Good for:**
- ✅ 2-3 users collaborating casually
- ✅ Real-time pair programming (taking turns)
- ✅ Live demos/presentations
- ✅ Learning/educational settings

**Bad for:**
- ❌ Large teams (5+ users)
- ❌ Heavy concurrent editing
- ❌ Production document editing
- ❌ When data loss is unacceptable

---

## 🔮 Upgrading to CRDT (Yjs)

### Current Architecture (Last-Write-Wins)
```
User A: "hello" → Server stores "hello"
User B: "world" → Server stores "world" (overwrites!)
```

### CRDT Architecture (Conflict-Free)
```
User A: Insert 'h' at position 0 → Operation{char:'h', id:A1, pos:0}
User B: Insert 'w' at position 0 → Operation{char:'w', id:B1, pos:0}

Both operations merge without conflict:
Result: "hw" or "wh" (deterministic based on IDs)
```

---

### Migration Steps to Yjs

#### 1. Install Yjs
```bash
npm install yjs y-websocket y-monaco
```

#### 2. Replace WebSocket with Yjs Provider
```javascript
// Old
const ws = new WebSocket('ws://localhost:8080');

// New
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc);
const yText = ydoc.getText('monaco');

// Bind to Monaco
const binding = new MonacoBinding(
  yText,
  editorRef.current.getModel(),
  new Set([editorRef.current]),
  provider.awareness
);
```

#### 3. Backend with y-websocket Server
```javascript
// server.js
const Y = require('yjs');
const { WebSocketServer } = require('y-websocket/bin/utils');

const wss = new WebSocketServer({ port: 1234 });
```

---

### Benefits of CRDT

**Before (Last-Write-Wins):**
```
User A types "hello" at position 0
User B types "world" at position 0
Result: "world" (A's edit lost)
```

**After (CRDT):**
```
User A: Insert("hello", pos:0, id:A_1_2_3_4_5)
User B: Insert("world", pos:0, id:B_1_2_3_4_5)

CRDT merges both:
Result: "helloworld" or "worldhello" (deterministic)
```

**Key Improvements:**
1. **No data loss** - All edits preserved
2. **Automatic merge** - Conflicts resolved algorithmically
3. **Commutative operations** - Order doesn't matter
4. **Cursor awareness** - See other users' cursors
5. **Offline support** - Sync when reconnected

---

### Yjs Features You'd Get

```javascript
// 1. Awareness (cursors, selections)
provider.awareness.setLocalStateField('user', {
  name: 'Alice',
  color: '#ff0000'
});

// 2. Undo/Redo (works across network!)
const undoManager = new Y.UndoManager(yText);
undoManager.undo();

// 3. Persistence
const leveldbPersistence = new LeveldbPersistence('./data');

// 4. Multiple data types
const yMap = ydoc.getMap('settings');
const yArray = ydoc.getArray('users');
```

---

## 📊 Architecture Comparison

| Feature | Current (WS) | With Yjs |
|---------|-------------|----------|
| Concurrent edits | ❌ Conflicts | ✅ Merges |
| Data loss | ⚠️ Possible | ✅ None |
| Cursor awareness | ❌ No | ✅ Yes |
| Offline support | ❌ No | ✅ Yes |
| Undo/Redo | ⚠️ Local only | ✅ Network-aware |
| Complexity | Low | Medium |
| Setup time | 1 hour | 4 hours |
| Code lines | ~100 | ~150 |

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

## 📝 Summary

**You built:**
- ✅ Real-time collaborative editor
- ✅ WebSocket sync (last-write-wins)
- ✅ Room-based collaboration
- ✅ Local code execution
- ✅ Connection status UI

**You learned:**
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
