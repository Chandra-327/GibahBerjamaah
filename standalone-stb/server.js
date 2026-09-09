const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Inisialisasi Socket.io dengan CORS terbuka untuk Cloudflare Tunnel
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Serve file statis PWA
app.use(express.static(path.join(__dirname, 'public')));

// Store data rider aktif di memory RAM STB (sangat ringan)
const riders = {};

// Health check endpoint untuk Cloudflare Tunnel / Uptime Kuma
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Gibah Berjamaah STB',
    activeRiders: Object.keys(riders).length,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

io.on('connection', (socket) => {
  // 1. Rider Bergabung ke Room
  socket.on('join-room', (data) => {
    const roomId = (data.roomId || 'GIBAH ON THE ROAD').trim().toUpperCase();
    const username = (data.username || 'Rider').trim().slice(0, 15);
    const battery = typeof data.battery === 'number' ? data.battery : 100;
    const coords = data.coords || null;

    socket.join(roomId);

    riders[socket.id] = {
      socketId: socket.id,
      roomId,
      username,
      battery,
      coords,
      heading: null,
      speed: null,
      isMuted: false,
      isSpeaking: false,
      lastUpdated: Date.now(),
    };

    console.log(`[JOIN] ${username} (${socket.id}) -> Room: ${roomId}`);

    // Kirim daftar rider yang sudah ada di room ke rider baru
    const existingInRoom = Object.values(riders)
      .filter((r) => r.roomId === roomId && r.socketId !== socket.id)
      .map((r) => ({
        userId: r.socketId,
        username: r.username,
        battery: r.battery,
        coords: r.coords,
        heading: r.heading,
        speed: r.speed,
        isMuted: r.isMuted,
        isSpeaking: r.isSpeaking,
      }));

    socket.emit('room-users', {
      roomId,
      users: existingInRoom,
    });

    // Beritahu rider lain bahwa ada rider baru
    socket.to(roomId).emit('user-connected', {
      userId: socket.id,
      username,
      battery,
      coords,
    });
  });

  // 2. Signaling WebRTC Peer-to-Peer (Offer, Answer, ICE Candidate)
  socket.on('signal', (data) => {
    if (!data.to) return;
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal,
    });
  });

  // 3. Broadcast Data GPS & Status Baterai
  socket.on('update-metadata', (data) => {
    const rider = riders[socket.id];
    if (!rider) return;

    if (data.coords) rider.coords = data.coords;
    if (typeof data.battery === 'number') rider.battery = data.battery;
    if (data.heading !== undefined) rider.heading = data.heading;
    if (data.speed !== undefined) rider.speed = data.speed;
    if (data.isMuted !== undefined) rider.isMuted = data.isMuted;
    if (data.isSpeaking !== undefined) rider.isSpeaking = data.isSpeaking;
    rider.lastUpdated = Date.now();

    socket.to(rider.roomId).emit('metadata-updated', {
      userId: socket.id,
      username: rider.username,
      coords: rider.coords,
      battery: rider.battery,
      heading: rider.heading,
      speed: rider.speed,
      isMuted: rider.isMuted,
      isSpeaking: rider.isSpeaking,
    });
  });

  // 4. Voice Activity State (VAD) Indicator
  socket.on('voice-state', (data) => {
    const rider = riders[socket.id];
    if (!rider) return;

    rider.isSpeaking = !!data.isSpeaking;
    if (data.isMuted !== undefined) rider.isMuted = data.isMuted;

    socket.to(rider.roomId).emit('voice-state-changed', {
      userId: socket.id,
      username: rider.username,
      isSpeaking: rider.isSpeaking,
      isMuted: rider.isMuted,
    });
  });

  // 5. Convoy Emergency & Hazard Alert (Jalan Rusak, Polisi, BBM, Rest)
  socket.on('convoy-alert', (data) => {
    const rider = riders[socket.id];
    if (!rider) return;

    const alertPayload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: socket.id,
      username: rider.username,
      type: data.type || 'INFO',
      message: data.message || 'Alert!',
      coords: data.coords || rider.coords,
      timestamp: Date.now(),
    };

    io.to(rider.roomId).emit('convoy-alert', alertPayload);
  });

  // 6. DJ Kapten Music Sharing State
  socket.on('dj-music-state', (data) => {
    const rider = riders[socket.id];
    if (!rider) return;

    socket.to(rider.roomId).emit('dj-music-state', {
      userId: socket.id,
      djName: rider.username,
      isPlaying: !!data.isPlaying,
      trackTitle: data.trackTitle || 'Musik Touring',
    });
  });

  // 7. Rider Terputus
  socket.on('disconnect', () => {
    const rider = riders[socket.id];
    if (rider) {
      const { roomId, username } = rider;
      console.log(`[LEAVE] ${username} keluar dari ${roomId}`);
      socket.to(roomId).emit('user-disconnected', socket.id);
      delete riders[socket.id];
    }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🏍️  GIBAH BERJAMAAH STB SERVER AKTIF`);
  console.log(`   Port: ${PORT} (http://localhost:${PORT})`);
  console.log(`   Cloudflare Tunnel: Ready`);
  console.log('====================================================');
});
