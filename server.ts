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

// In-memory store for single active DJ per room (First-Come First-Served lock)
interface RoomDJState {
  activeDjId: string | null;
  activeDjName: string | null;
  isDjActive: boolean;
  isPlaying: boolean;
  trackTitle: string;
}
const roomDJs: Record<string, RoomDJState> = {};
// Grace period timers for DJ reconnections during poor mobile signal / cell tower hops
const djDisconnectTimers: Record<string, NodeJS.Timeout> = {};

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

    // Check if the joining user was the active DJ in this room within the grace period
    const existingDj = roomDJs[roomId];
    if (
      existingDj &&
      existingDj.isDjActive &&
      existingDj.activeDjName &&
      existingDj.activeDjName.trim().toLowerCase() === username.trim().toLowerCase()
    ) {
      if (djDisconnectTimers[roomId]) {
        console.log(`[DJ RECOVERED] DJ ${username} reconnected within grace period! Restoring DJ seat for room ${roomId}`);
        clearTimeout(djDisconnectTimers[roomId]);
        delete djDisconnectTimers[roomId];
      }
      existingDj.activeDjId = socket.id;
      io.to(roomId).emit("dj-music-state", existingDj);
    }

    // Send current room DJ state to the newly joined rider
    const currentDj = roomDJs[roomId] || {
      activeDjId: null,
      activeDjName: null,
      isDjActive: false,
      isPlaying: false,
      trackTitle: '',
    };
    socket.emit("dj-music-state", currentDj);

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
  const handleMetadataUpdate = (data: {
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
  };

  socket.on("update-metadata", handleMetadataUpdate);
  socket.on("metadata-update", handleMetadataUpdate);

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
  socket.on("convoy-alert", (data: { type?: string; title?: string; message?: string; coords?: [number, number] } | string) => {
    const rider = riders[socket.id];
    if (!rider) return;

    let alertType = "INFO";
    let alertTitle = "Peringatan Konvoi";
    let alertMessage = "Peringatan!";
    let alertCoords = rider.coords;

    if (typeof data === "string") {
      alertTitle = data;
      alertMessage = data;
    } else if (data && typeof data === "object") {
      if (data.type) alertType = data.type;
      if (data.title) alertTitle = data.title;
      if (data.message) alertMessage = data.message;
      if (!data.title && data.message) alertTitle = data.message;
      if (data.coords) alertCoords = data.coords;
    }

    const alertPayload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: socket.id,
      username: rider.username,
      type: alertType,
      title: alertTitle,
      message: alertMessage,
      coords: alertCoords,
      timestamp: Date.now(),
    };

    console.log(`[CONVOY ALERT] ${rider.username} (${socket.id}) in room ${rider.roomId}: [${alertType}] ${alertTitle} - ${alertMessage}`);
    io.to(rider.roomId).emit("convoy-alert", alertPayload);
  });

  // 6. DJ Kapten Music Sharing - Single Exclusive DJ Lock (First-Come First-Served)
  socket.on("claim-dj", (callback?: (res: { success: boolean; djState: RoomDJState; message?: string }) => void) => {
    const rider = riders[socket.id];
    if (!rider) return;
    const roomId = rider.roomId;
    const current = roomDJs[roomId];

    // Deteksi apakah DJ saat ini sudah offline / socket putus / keluar kamar (Stale DJ Lock)
    let isStale = false;
    if (current && current.isDjActive && current.activeDjId) {
      const activeDjSocket = io.sockets.sockets.get(current.activeDjId);
      const activeDjRider = riders[current.activeDjId];
      // Jika socket sudah tidak aktif, rider tidak terdaftar, atau beda room: lock dianggap kadaluarsa
      if (!activeDjSocket || !activeDjSocket.connected || !activeDjRider || activeDjRider.roomId !== roomId) {
        isStale = true;
        console.log(`[DJ STALE DETECTED] Previous DJ ${current.activeDjName} (${current.activeDjId}) is no longer connected in room ${roomId}. Auto-releasing lock.`);
      }
    }

    // Deteksi jika rider yang sama melakukan reclaim (misal refresh browser)
    const isSameUserReclaiming =
      current &&
      current.activeDjName &&
      current.activeDjName.trim().toLowerCase() === rider.username.trim().toLowerCase();

    // Jika rider lain yang aktif dan sah sedang memegang kursi DJ, tolak klaim
    if (current && current.isDjActive && current.activeDjId && current.activeDjId !== socket.id && !isStale && !isSameUserReclaiming) {
      const busyMessage = `DJ sedang dikontrol oleh ${current.activeDjName || "rider lain"}.`;
      console.log(`[DJ REJECT] ${rider.username} attempted to claim DJ in ${roomId}, but legitimately held by ${current.activeDjName}`);
      if (typeof callback === "function") {
        callback({ success: false, djState: current, message: busyMessage });
      }
      socket.emit("dj-claim-rejected", { message: busyMessage, djState: current });
      return;
    }

    // Clear any disconnect timer for this room
    if (djDisconnectTimers[roomId]) {
      clearTimeout(djDisconnectTimers[roomId]);
      delete djDisconnectTimers[roomId];
    }

    // Berikan status DJ kepada rider ini (pertahankan status play jika rider yang sama mereclaim)
    const newDjState: RoomDJState = {
      activeDjId: socket.id,
      activeDjName: rider.username,
      isDjActive: true,
      isPlaying: isSameUserReclaiming && current ? current.isPlaying : false,
      trackTitle: isSameUserReclaiming && current ? current.trackTitle : "",
    };
    roomDJs[roomId] = newDjState;
    console.log(`[DJ CLAIMED] ${rider.username} (${socket.id}) is now the exclusive DJ Kapten for room ${roomId}`);

    io.to(roomId).emit("dj-music-state", newDjState);

    if (typeof callback === "function") {
      callback({ success: true, djState: newDjState });
    }
  });

  // Release DJ lock so other riders can take over
  socket.on("release-dj", () => {
    const rider = riders[socket.id];
    if (!rider) return;
    const roomId = rider.roomId;
    const current = roomDJs[roomId];

    if (djDisconnectTimers[roomId]) {
      clearTimeout(djDisconnectTimers[roomId]);
      delete djDisconnectTimers[roomId];
    }

    if (current && (current.activeDjId === socket.id || current.activeDjName === rider.username)) {
      console.log(`[DJ RELEASED] ${rider.username} released DJ Kapten seat for room ${roomId}`);
      const releasedState: RoomDJState = {
        activeDjId: null,
        activeDjName: null,
        isDjActive: false,
        isPlaying: false,
        trackTitle: "",
      };
      roomDJs[roomId] = releasedState;
      io.to(roomId).emit("dj-music-state", releasedState);
    }
  });

  // Emergency Force-Release / Reset DJ Lock (Bila user sebelumnya keluar tanpa sempat lepas DJ)
  socket.on("force-release-dj", (callback?: (res: { success: boolean }) => void) => {
    const rider = riders[socket.id];
    if (!rider) return;
    const roomId = rider.roomId;

    if (djDisconnectTimers[roomId]) {
      clearTimeout(djDisconnectTimers[roomId]);
      delete djDisconnectTimers[roomId];
    }

    console.log(`[DJ FORCE-RELEASE] DJ seat in room ${roomId} reset by ${rider.username}`);
    const releasedState: RoomDJState = {
      activeDjId: null,
      activeDjName: null,
      isDjActive: false,
      isPlaying: false,
      trackTitle: "",
    };
    roomDJs[roomId] = releasedState;
    io.to(roomId).emit("dj-music-state", releasedState);
    if (typeof callback === "function") {
      callback({ success: true });
    }
  });

  // Active DJ Updates Playback State
  socket.on("dj-music-state", (data: { isPlaying?: boolean; trackTitle?: string }) => {
    const rider = riders[socket.id];
    if (!rider) return;
    const roomId = rider.roomId;
    const current = roomDJs[roomId];

    // Only allow playback update if this socket is the registered active DJ
    if (current && current.activeDjId === socket.id) {
      current.isPlaying = !!data.isPlaying;
      if (data.trackTitle !== undefined) {
        current.trackTitle = data.trackTitle;
      }
      io.to(roomId).emit("dj-music-state", current);
    }
  });

  // 7. Disconnect handler with Grace Period for poor cellular connectivity
  socket.on("disconnect", () => {
    const rider = riders[socket.id];
    const roomId = rider ? rider.roomId : null;
    const username = rider ? rider.username : "Unknown";

    console.log(`[LEAVE] ${username} (${socket.id}) disconnected`);

    // Periksa apakah socket ini memegang status DJ Kapten
    for (const [rId, dj] of Object.entries(roomDJs)) {
      if (dj.isDjActive && (dj.activeDjId === socket.id || (rider && dj.activeDjName === rider.username))) {
        console.log(`[DJ GRACE PERIOD] Active DJ ${username} (${socket.id}) disconnected. Starting 25s grace period for room ${rId}...`);

        if (djDisconnectTimers[rId]) {
          clearTimeout(djDisconnectTimers[rId]);
        }

        // Tahan status DJ selama 25 detik agar jika koneksi HP putus-nyambung karena sinyal jelek, musik tidak terputus
        djDisconnectTimers[rId] = setTimeout(() => {
          console.log(`[DJ AUTO-RELEASE] Grace period expired for room ${rId}. Freeing DJ seat.`);
          delete djDisconnectTimers[rId];
          const releasedState: RoomDJState = {
            activeDjId: null,
            activeDjName: null,
            isDjActive: false,
            isPlaying: false,
            trackTitle: "",
          };
          roomDJs[rId] = releasedState;
          io.to(rId).emit("dj-music-state", releasedState);
        }, 25000);
      }
    }

    if (roomId) {
      // Beritahu seluruh rider di room bahwa user telah disconnect
      io.to(roomId).emit("user-disconnected", { userId: socket.id });
    }

    delete riders[socket.id];
  });
});

// Periodic cleanup of stale connections (older than 10 minutes inactive)
setInterval(() => {
  const now = Date.now();
  for (const [id, rider] of Object.entries(riders)) {
    if (now - rider.lastUpdated > 10 * 60 * 1000) {
      console.log(`[CLEANUP] Purged inactive rider: ${rider.username}`);
      const roomId = rider.roomId;
      const currentDj = roomDJs[roomId];
      if (currentDj && currentDj.activeDjId === id) {
        console.log(`[DJ AUTO-RELEASE] Inactive DJ ${rider.username} purged. Freeing DJ seat for room ${roomId}`);
        const releasedState: RoomDJState = {
          activeDjId: null,
          activeDjName: null,
          isDjActive: false,
          isPlaying: false,
          trackTitle: "",
        };
        roomDJs[roomId] = releasedState;
        io.to(roomId).emit("dj-music-state", releasedState);
      }
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
