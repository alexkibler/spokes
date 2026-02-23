import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // For development flexibility
    methods: ["GET", "POST"]
  }
});

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Helper: Generate a random 4-letter room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Host creates a room
  socket.on('HOST_CREATE_ROOM', (callback) => {
    let roomCode;
    let attempts = 0;
    // Check if rooms exist. socket.io rooms are tricky because every socket is in its own room.
    // We only care about 4-letter rooms.
    do {
      roomCode = generateRoomCode();
      attempts++;
    } while (io.sockets.adapter.rooms.has(roomCode) && attempts < 10);

    if (attempts >= 10) {
      if (callback) callback({ error: 'Could not generate room code' });
      return;
    }

    socket.join(roomCode);
    console.log(`Host ${socket.id} created room ${roomCode}`);
    if (callback) callback({ roomCode });
  });

  // Client joins a room
  socket.on('CLIENT_JOIN_ROOM', ({ roomCode }, callback) => {
    const room = io.sockets.adapter.rooms.get(roomCode);
    if (room && room.size > 0) {
      socket.join(roomCode);
      console.log(`Client ${socket.id} joined room ${roomCode}`);

      // Notify host that a client joined
      socket.to(roomCode).emit('CLIENT_CONNECTED', { clientId: socket.id });

      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, error: 'Room not found' });
    }
  });

  // Relay Input from Client to Host
  socket.on('CLIENT_INPUT', (payload) => {
    for (const roomCode of socket.rooms) {
      if (roomCode.length === 4) {
        socket.to(roomCode).emit('CLIENT_INPUT', { ...payload, clientId: socket.id });
      }
    }
  });

  // Relay State from Host to Client
  socket.on('HOST_STATE_UPDATE', (payload) => {
    for (const roomCode of socket.rooms) {
      if (roomCode.length === 4) {
        socket.to(roomCode).emit('HOST_STATE_UPDATE', payload);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3201;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
