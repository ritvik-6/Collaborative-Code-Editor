import { WebSocketServer } from 'ws';
import WebSocket from 'ws';

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

// In-memory storage: { roomId: { code: string, clients: Map<WebSocket, userData> } }
const rooms = new Map();

console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  let currentRoom = null;
  
  console.log('✅ Client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join':
          handleJoin(ws, data.roomId, data.userName, data.userColor);
          currentRoom = data.roomId;
          break;
          
        case 'code-change':
          handleCodeChange(ws, currentRoom, data.code);
          break;
          
        case 'cursor-move':
          handleCursorMove(ws, currentRoom, data.cursor);
          break;
          
        case 'leave':
          handleLeave(ws, currentRoom);
          currentRoom = null;
          break;
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    if (currentRoom) {
      handleLeave(ws, currentRoom);
    }
    console.log('❌ Client disconnected');
  });
});

function handleJoin(ws, roomId, userName, userColor) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      code: '// Welcome to collaborative editing!\nconsole.log("Hello from room: ' + roomId + '");',
      clients: new Map()
    });
    console.log(`📁 Created room: ${roomId}`);
  }
  
  const room = rooms.get(roomId);
  const userId = Math.random().toString(36).substr(2, 9);
  
  room.clients.set(ws, {
    id: userId,
    name: userName || 'Anonymous',
    color: userColor || '#' + Math.floor(Math.random()*16777215).toString(16),
    cursor: null
  });
  
  console.log(`👤 ${userName} joined room: ${roomId} (${room.clients.size} clients)`);
  
  // Send init to new user
  ws.send(JSON.stringify({
    type: 'init',
    code: room.code,
    userId: userId,
    users: Array.from(room.clients.values())
  }));
  
  // Broadcast new user to others
  broadcast(roomId, {
    type: 'user-joined',
    users: Array.from(room.clients.values())
  }, ws);
}

function handleCodeChange(ws, roomId, code) {
  if (!roomId || !rooms.has(roomId)) return;
  
  const room = rooms.get(roomId);
  
  // Update room's code (last-write-wins)
  room.code = code;
  
  // Broadcast to all clients in room EXCEPT sender
  broadcast(roomId, {
    type: 'code-update',
    code: code
  }, ws);
}

function handleCursorMove(ws, roomId, cursor) {
  if (!roomId || !rooms.has(roomId)) return;
  
  const room = rooms.get(roomId);
  const userData = room.clients.get(ws);
  
  if (userData) {
    userData.cursor = cursor;
    
    broadcast(roomId, {
      type: 'cursor-update',
      userId: userData.id,
      cursor: cursor
    }, ws);
  }
}

function handleLeave(ws, roomId) {
  if (!roomId || !rooms.has(roomId)) return;
  
  const room = rooms.get(roomId);
  const userData = room.clients.get(ws);
  const userId = userData?.id;
  
  room.clients.delete(ws);
  
  console.log(`👋 Client left room: ${roomId} (${room.clients.size} clients)`);
  
  if (room.clients.size === 0) {
    rooms.delete(roomId);
    console.log(`🗑️  Deleted empty room: ${roomId}`);
  } else {
    broadcast(roomId, {
      type: 'user-left',
      userId: userId,
      users: Array.from(room.clients.values())
    });
  }
}

function broadcast(roomId, message, excludeClient = null) {
  if (!rooms.has(roomId)) return;
  
  const room = rooms.get(roomId);
  const messageStr = JSON.stringify(message);
  
  room.clients.forEach((userData, client) => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}