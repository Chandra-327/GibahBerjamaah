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
var import_vite = require("vite");
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
var roomDJs = {};
var djDisconnectTimers = {};
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
    const existingDj = roomDJs[roomId];
    if (existingDj && existingDj.isDjActive && existingDj.activeDjName && existingDj.activeDjName.trim().toLowerCase() === username.trim().toLowerCase()) {
      if (djDisconnectTimers[roomId]) {
        console.log(`[DJ RECOVERED] DJ ${username} reconnected within grace period! Restoring DJ seat for room ${roomId}`);
        clearTimeout(djDisconnectTimers[roomId]);
        delete djDisconnectTimers[roomId];
      }
      existingDj.activeDjId = socket.id;
      io.to(roomId).emit("dj-music-state", existingDj);
    }
    const currentDj = roomDJs[roomId] || {
      activeDjId: null,
      activeDjName: null,
      isDjActive: false,
      isPlaying: false,
      trackTitle: ""
    };
    socket.emit("dj-music-state", currentDj);
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
  const handleMetadataUpdate = (data) => {
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
  };
  socket.on("update-metadata", handleMetadataUpdate);
  socket.on("metadata-update", handleMetadataUpdate);
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
      timestamp: Date.now()
    };
    console.log(`[CONVOY ALERT] ${rider.username} (${socket.id}) in room ${rider.roomId}: [${alertType}] ${alertTitle} - ${alertMessage}`);
    io.to(rider.roomId).emit("convoy-alert", alertPayload);
  });
  socket.on("claim-dj", (callback) => {
    const rider = riders[socket.id];
    if (!rider) return;
    const roomId = rider.roomId;
    const current = roomDJs[roomId];
    let isStale = false;
    if (current && current.isDjActive && current.activeDjId) {
      const activeDjSocket = io.sockets.sockets.get(current.activeDjId);
      const activeDjRider = riders[current.activeDjId];
      if (!activeDjSocket || !activeDjSocket.connected || !activeDjRider || activeDjRider.roomId !== roomId) {
        isStale = true;
        console.log(`[DJ STALE DETECTED] Previous DJ ${current.activeDjName} (${current.activeDjId}) is no longer connected in room ${roomId}. Auto-releasing lock.`);
      }
    }
    const isSameUserReclaiming = current && current.activeDjName && current.activeDjName.trim().toLowerCase() === rider.username.trim().toLowerCase();
    if (current && current.isDjActive && current.activeDjId && current.activeDjId !== socket.id && !isStale && !isSameUserReclaiming) {
      const busyMessage = `DJ sedang dikontrol oleh ${current.activeDjName || "rider lain"}.`;
      console.log(`[DJ REJECT] ${rider.username} attempted to claim DJ in ${roomId}, but legitimately held by ${current.activeDjName}`);
      if (typeof callback === "function") {
        callback({ success: false, djState: current, message: busyMessage });
      }
      socket.emit("dj-claim-rejected", { message: busyMessage, djState: current });
      return;
    }
    if (djDisconnectTimers[roomId]) {
      clearTimeout(djDisconnectTimers[roomId]);
      delete djDisconnectTimers[roomId];
    }
    const newDjState = {
      activeDjId: socket.id,
      activeDjName: rider.username,
      isDjActive: true,
      isPlaying: isSameUserReclaiming && current ? current.isPlaying : false,
      trackTitle: isSameUserReclaiming && current ? current.trackTitle : ""
    };
    roomDJs[roomId] = newDjState;
    console.log(`[DJ CLAIMED] ${rider.username} (${socket.id}) is now the exclusive DJ Kapten for room ${roomId}`);
    io.to(roomId).emit("dj-music-state", newDjState);
    if (typeof callback === "function") {
      callback({ success: true, djState: newDjState });
    }
  });
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
      const releasedState = {
        activeDjId: null,
        activeDjName: null,
        isDjActive: false,
        isPlaying: false,
        trackTitle: ""
      };
      roomDJs[roomId] = releasedState;
      io.to(roomId).emit("dj-music-state", releasedState);
    }
  });
  socket.on("force-release-dj", (callback) => {
    const rider = riders[socket.id];
    if (!rider) return;
    const roomId = rider.roomId;
    if (djDisconnectTimers[roomId]) {
      clearTimeout(djDisconnectTimers[roomId]);
      delete djDisconnectTimers[roomId];
    }
    console.log(`[DJ FORCE-RELEASE] DJ seat in room ${roomId} reset by ${rider.username}`);
    const releasedState = {
      activeDjId: null,
      activeDjName: null,
      isDjActive: false,
      isPlaying: false,
      trackTitle: ""
    };
    roomDJs[roomId] = releasedState;
    io.to(roomId).emit("dj-music-state", releasedState);
    if (typeof callback === "function") {
      callback({ success: true });
    }
  });
  socket.on("dj-music-state", (data) => {
    const rider = riders[socket.id];
    if (!rider) return;
    const roomId = rider.roomId;
    const current = roomDJs[roomId];
    if (current && current.activeDjId === socket.id) {
      current.isPlaying = !!data.isPlaying;
      if (data.trackTitle !== void 0) {
        current.trackTitle = data.trackTitle;
      }
      io.to(roomId).emit("dj-music-state", current);
    }
  });
  socket.on("disconnect", () => {
    const rider = riders[socket.id];
    const roomId = rider ? rider.roomId : null;
    const username = rider ? rider.username : "Unknown";
    console.log(`[LEAVE] ${username} (${socket.id}) disconnected`);
    for (const [rId, dj] of Object.entries(roomDJs)) {
      if (dj.isDjActive && (dj.activeDjId === socket.id || rider && dj.activeDjName === rider.username)) {
        console.log(`[DJ GRACE PERIOD] Active DJ ${username} (${socket.id}) disconnected. Starting 25s grace period for room ${rId}...`);
        if (djDisconnectTimers[rId]) {
          clearTimeout(djDisconnectTimers[rId]);
        }
        djDisconnectTimers[rId] = setTimeout(() => {
          console.log(`[DJ AUTO-RELEASE] Grace period expired for room ${rId}. Freeing DJ seat.`);
          delete djDisconnectTimers[rId];
          const releasedState = {
            activeDjId: null,
            activeDjName: null,
            isDjActive: false,
            isPlaying: false,
            trackTitle: ""
          };
          roomDJs[rId] = releasedState;
          io.to(rId).emit("dj-music-state", releasedState);
        }, 25e3);
      }
    }
    if (roomId) {
      io.to(roomId).emit("user-disconnected", { userId: socket.id });
    }
    delete riders[socket.id];
  });
});
setInterval(() => {
  const now = Date.now();
  for (const [id, rider] of Object.entries(riders)) {
    if (now - rider.lastUpdated > 10 * 60 * 1e3) {
      console.log(`[CLEANUP] Purged inactive rider: ${rider.username}`);
      const roomId = rider.roomId;
      const currentDj = roomDJs[roomId];
      if (currentDj && currentDj.activeDjId === id) {
        console.log(`[DJ AUTO-RELEASE] Inactive DJ ${rider.username} purged. Freeing DJ seat for room ${roomId}`);
        const releasedState = {
          activeDjId: null,
          activeDjName: null,
          isDjActive: false,
          isPlaying: false,
          trackTitle: ""
        };
        roomDJs[roomId] = releasedState;
        io.to(roomId).emit("dj-music-state", releasedState);
      }
      delete riders[id];
    }
  }
}, 60 * 1e3);
async function start() {
  const PORT = 3e3;
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
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
