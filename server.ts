import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";

interface RiderState {
  socketId: string;
  roomId: string;
  username: string;
  battery: number;
  coords: [number, number] | null;
  heading: number | null;
  speed: number | null;
  isMuted: boolean;
  isSpeaking: boolean;
  lastUpdated: number;
}

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with permissive CORS for Cloudflare Tunnel & LAN access
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

app.use(express.json());

// In-memory store for active riders (ideal for lightweight STB Armbian)
const riders: Record<string, RiderState> = {};

// REST endpoints for monitoring & status
app.get("/api/health", (_req, res) => {
  const activeRooms = new Set(Object.values(riders).map((r) => r.roomId));
  res.json({
    status: "ok",
    app: "Gibah Berjamaah",
    version: "1.0.0",
    activeRiders: Object.keys(riders).length,
    activeRooms: Array.from(activeRooms),
    timestamp: Date.now(),
  });
});

app.get("/api/room/:roomId", (req, res) => {
  const { roomId } = req.params;
  const roomRiders = Object.values(riders).filter(
    (r) => r.roomId.toUpperCase() === roomId.toUpperCase()
  );
  res.json({
    roomId,
    count: roomRiders.length,
    riders: roomRiders.map((r) => ({
      socketId: r.socketId,
      username: r.username,
      battery: r.battery,
      coords: r.coords,
      speed: r.speed,
      heading: r.heading,
      isMuted: r.isMuted,
      isSpeaking: r.isSpeaking,
      lastUpdated: r.lastUpdated,
    })),
  });
});

// Socket.io Real-time signaling & tracking
io.on("connection", (socket) => {
  // 1. Rider joins a room
  socket.on("join-room", (data: { roomId: string; username: string; battery?: number; coords?: [number, number] }) => {
    const roomId = (data.roomId || "GIBAH ON THE ROAD").trim().toUpperCase();
    const username = (data.username || "Rider").trim().slice(0, 15);
    const battery = typeof data.battery === "number" ? data.battery : 100;
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

    console.log(`[JOIN] ${username} (${socket.id}) joined room ${roomId}`);

    // Send existing riders in room to the newly connected rider
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

    socket.emit("room-users", {
      roomId,
      users: existingInRoom,
    });

    // Notify others in room about new rider
    socket.to(roomId).emit("user-connected", {
      userId: socket.id,
      username,
      battery,
      coords,
    });
  });

  // 2. WebRTC Peer-to-Peer Signaling (Offer, Answer, ICE Candidate)
  socket.on("signal", (data: { to: string; signal: unknown }) => {
    if (!data.to) return;
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal,
    });
  });

  // 3. Metadata Broadcast (GPS Coordinates, Heading, Speed, Battery)
  socket.on("update-metadata", (data: {
    coords?: [number, number];
    battery?: number;
    heading?: number | null;
    speed?: number | null;
    isMuted?: boolean;
    isSpeaking?: boolean;
  }) => {
    const rider = riders[socket.id];
    if (!rider) return;

    if (data.coords) rider.coords = data.coords;
    if (typeof data.battery === "number") rider.battery = data.battery;
    if (data.heading !== undefined) rider.heading = data.heading;
    if (data.speed !== undefined) rider.speed = data.speed;
    if (data.isMuted !== undefined) rider.isMuted = data.isMuted;
    if (data.isSpeaking !== undefined) rider.isSpeaking = data.isSpeaking;
    rider.lastUpdated = Date.now();

    socket.to(rider.roomId).emit("metadata-updated", {
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

  // 4. Instant Voice Activity (VAD) state change
  socket.on("voice-state", (data: { isSpeaking: boolean; isMuted?: boolean }) => {
    const rider = riders[socket.id];
    if (!rider) return;

    rider.isSpeaking = !!data.isSpeaking;
    if (data.isMuted !== undefined) rider.isMuted = data.isMuted;

    socket.to(rider.roomId).emit("voice-state-changed", {
      userId: socket.id,
      username: rider.username,
      isSpeaking: rider.isSpeaking,
      isMuted: rider.isMuted,
    });
  });

  // 5. Convoy Quick Alert / Ping (e.g. Danger, Pitstop, Police, Lost)
  socket.on("convoy-alert", (data: { type: string; message: string; coords?: [number, number] }) => {
    const rider = riders[socket.id];
    if (!rider) return;

    const alertPayload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: socket.id,
      username: rider.username,
      type: data.type || "INFO",
      message: data.message || "Alert!",
      coords: data.coords || rider.coords,
      timestamp: Date.now(),
    };

    io.to(rider.roomId).emit("convoy-alert", alertPayload);
  });

  // 6. DJ Kapten Music Sharing State
  socket.on("dj-music-state", (data: { isPlaying: boolean; trackTitle?: string }) => {
    const rider = riders[socket.id];
    if (!rider) return;

    socket.to(rider.roomId).emit("dj-music-state", {
      userId: socket.id,
      djName: rider.username,
      isPlaying: !!data.isPlaying,
      trackTitle: data.trackTitle || "Musik Touring",
    });
  });

  // 7. Disconnect handler
  socket.on("disconnect", () => {
    const rider = riders[socket.id];
    if (rider) {
      const { roomId, username } = rider;
      console.log(`[LEAVE] ${username} (${socket.id}) disconnected from ${roomId}`);
      socket.to(roomId).emit("user-disconnected", socket.id);
      delete riders[socket.id];
    }
  });
});

// Periodic cleanup of stale connections (older than 10 minutes inactive)
setInterval(() => {
  const now = Date.now();
  for (const [id, rider] of Object.entries(riders)) {
    if (now - rider.lastUpdated > 10 * 60 * 1000) {
      console.log(`[CLEANUP] Purged inactive rider: ${rider.username}`);
      delete riders[id];
    }
  }
}, 60 * 1000);

async function start() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`=========================================`);
    console.log(`🏍️  GIBAH BERJAMAAH Server Running!`);
    console.log(`   Local URL: http://0.0.0.0:${PORT}`);
    console.log(`   Cloudflare Tunnel: Ready on port ${PORT}`);
    console.log(`=========================================`);
  });
}

start();
