var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_socket = require("socket.io");
var import_path = __toESM(require("path"), 1);
var app = (0, import_express.default)();
var server = import_http.default.createServer(app);
var io = new import_socket.Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 1e4,
  pingTimeout: 5e3
});
app.use(import_express.default.json());
var riders = {};
var djCaptains = {};
app.get("/api/health", (_req, res) => {
  const activeRooms = new Set(Object.values(riders).map((r) => r.roomId));
  res.json({
    status: "ok",
    app: "Gibah Berjamaah",
    version: "1.0.0",
    activeRiders: Object.keys(riders).length,
    activeRooms: Array.from(activeRooms),
    timestamp: Date.now()
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
      lastUpdated: r.lastUpdated
    }))
  });
});
io.on("connection", (socket) => {
  socket.on("join-room", (data) => {
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
      lastUpdated: Date.now()
    };
    console.log(`[JOIN] ${username} (${socket.id}) joined room ${roomId}`);
    const existingInRoom = Object.values(riders).filter((r) => r.roomId === roomId && r.socketId !== socket.id).map((r) => ({
      userId: r.socketId,
      username: r.username,
      battery: r.battery,
      coords: r.coords,
      heading: r.heading,
      speed: r.speed,
      isMuted: r.isMuted,
      isSpeaking: r.isSpeaking
    }));
    socket.emit("room-users", {
      roomId,
      users: existingInRoom
    });
    const captainId = djCaptains[roomId];
    socket.emit("dj-captain-state", captainId ? {
      userId: captainId,
      djName: riders[captainId]?.username || "Rider"
    } : null);
    socket.to(roomId).emit("user-connected", {
      userId: socket.id,
      username,
      battery,
      coords
    });
  });
  socket.on("signal", (data) => {
    if (!data.to) return;
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });
  socket.on("update-metadata", (data) => {
    const rider = riders[socket.id];
    if (!rider) return;
    if (data.coords) rider.coords = data.coords;
    if (typeof data.battery === "number") rider.battery = data.battery;
    if (data.heading !== void 0) rider.heading = data.heading;
    if (data.speed !== void 0) rider.speed = data.speed;
    if (data.isMuted !== void 0) rider.isMuted = data.isMuted;
    if (data.isSpeaking !== void 0) rider.isSpeaking = data.isSpeaking;
    rider.lastUpdated = Date.now();
    socket.to(rider.roomId).emit("metadata-updated", {
      userId: socket.id,
      username: rider.username,
      coords: rider.coords,
      battery: rider.battery,
      heading: rider.heading,
      speed: rider.speed,
      isMuted: rider.isMuted,
      isSpeaking: rider.isSpeaking
    });
  });
  socket.on("voice-state", (data) => {
    const rider = riders[socket.id];
    if (!rider) return;
    rider.isSpeaking = !!data.isSpeaking;
    if (data.isMuted !== void 0) rider.isMuted = data.isMuted;
    socket.to(rider.roomId).emit("voice-state-changed", {
      userId: socket.id,
      username: rider.username,
      isSpeaking: rider.isSpeaking,
      isMuted: rider.isMuted
    });
  });
  socket.on("convoy-alert", (data) => {
    const rider = riders[socket.id];
    if (!rider) return;
    const alertPayload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: socket.id,
      username: rider.username,
      type: data.type || "INFO",
      message: data.message || "Alert!",
      coords: data.coords || rider.coords,
      timestamp: Date.now()
    };
    io.to(rider.roomId).emit("convoy-alert", alertPayload);
  });
  socket.on("dj-music-state", (data) => {
    const rider = riders[socket.id];
    if (!rider) return;
    if (djCaptains[rider.roomId] !== socket.id) return;
    socket.to(rider.roomId).emit("dj-music-state", {
      userId: socket.id,
      djName: rider.username,
      isPlaying: !!data.isPlaying,
      trackTitle: data.trackTitle || "Musik Touring"
    });
  });
  socket.on("dj-captain-acquire", () => {
    const rider = riders[socket.id];
    if (!rider) return;
    if (djCaptains[rider.roomId] && djCaptains[rider.roomId] !== socket.id) {
      socket.emit("dj-captain-rejected");
      return;
    }
    djCaptains[rider.roomId] = socket.id;
    io.to(rider.roomId).emit("dj-captain-state", {
      userId: socket.id,
      djName: rider.username
    });
  });
  socket.on("dj-captain-release", () => {
    const rider = riders[socket.id];
    if (!rider || djCaptains[rider.roomId] !== socket.id) return;
    delete djCaptains[rider.roomId];
    io.to(rider.roomId).emit("dj-captain-state", null);
  });
  socket.on("disconnect", () => {
    const rider = riders[socket.id];
    if (rider) {
      const { roomId, username } = rider;
      console.log(`[LEAVE] ${username} (${socket.id}) disconnected from ${roomId}`);
      socket.to(roomId).emit("user-disconnected", socket.id);
      if (djCaptains[roomId] === socket.id) {
        delete djCaptains[roomId];
        socket.to(roomId).emit("dj-captain-state", null);
      }
      delete riders[socket.id];
    }
  });
});
setInterval(() => {
  const now = Date.now();
  for (const [id, rider] of Object.entries(riders)) {
    if (now - rider.lastUpdated > 10 * 60 * 1e3) {
      console.log(`[CLEANUP] Purged inactive rider: ${rider.username}`);
      delete riders[id];
    }
  }
}, 60 * 1e3);
async function start() {
  const PORT = 3e3;
  if (false) {
    const { createServer: createViteServer } = await null;
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`=========================================`);
    console.log(`\u{1F3CD}\uFE0F  GIBAH BERJAMAAH Server Running!`);
    console.log(`   Local URL: http://0.0.0.0:${PORT}`);
    console.log(`   Cloudflare Tunnel: Ready on port ${PORT}`);
    console.log(`=========================================`);
  });
}
start();
//# sourceMappingURL=server.cjs.map
