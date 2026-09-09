// ==========================================================
// GIBAH BERJAMAAH - PWA Client Logic (STB Armbian & Browser)
// ==========================================================

let socket;
let myUsername = '';
let myRoom = 'GIBAH ON THE ROAD';
let myBattery = 100;
let isMuted = false;
let intercomMode = 'ALWAYS_ON'; // 'ALWAYS_ON' atau 'PTT'
let isTransmitting = false;
let myCurrentCoords = null;

// Leaflet Map & Markers
let map = null;
let myMarker = null;
const remoteMarkers = {};
const alertMarkersByRider = {}; // key: username/userId -> { marker, timer, id }
let followMe = true;

// WebRTC & Audio
let localStream = null;
const peerConnections = {};
const remoteAudios = {};
let audioCtx = null;
let analyser = null;
let vadInterval = null;
let micSourceNode = null;
let micGainNode = null;
let mixedDestination = null;

// DJ Kapten State & Nodes (Gain statis normal, tanpa modul ducking)
let isDJMode = false;
let isDJPlaying = false;
let djTrackTitle = '';
let djVolume = 0.8;
let receiverVolume = 1.0;
let djAudioEl = null;
let djSourceNode = null;
let djGainNode = null;
let activeAlertToastTimer = null;

// Playlist State
let playlist = [];
let originalPlaylist = [];
let currentTrackIndex = -1;
let currentSortMode = 'NAME'; // 'NAME', 'SHUFFLE', 'DATE'

// Background & WakeLock
let wakeLockSentinel = null;
let silentAudioEl = null;
let isSilentAudioActive = false;

// Generator WAV hening 1 detik PCM 8-bit mono yang valid dan ringan (mencegah loop 44.100x/detik di AudioFlinger Xiaomi)
function getValidSilentWavBlobUrl() {
  try {
    const sampleRate = 8000;
    const numSamples = sampleRate; // 1 detik hening
    const buffer = new Uint8Array(44 + numSamples);
    buffer.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
    const view = new DataView(buffer.buffer);
    view.setUint32(4, 36 + numSamples, true);
    buffer.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    buffer.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true); // block align
    view.setUint16(34, 8, true); // 8-bit
    buffer.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
    view.setUint32(40, numSamples, true);
    buffer.fill(128, 44); // 128 = silence untuk 8-bit PCM
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    return 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  }
}

let cachedSilentWavUrl = null;

// 1. Silent Audio Keep-Alive Loop (Anti-Sleep Layar Terkunci Xiaomi / HyperOS)
function initAndPlaySilentAudio() {
  if (!silentAudioEl) {
    silentAudioEl = document.getElementById('silent-audio');
    if (!silentAudioEl) {
      silentAudioEl = document.createElement('audio');
      silentAudioEl.id = 'silent-audio';
      silentAudioEl.style.display = 'none';
      document.body.appendChild(silentAudioEl);
    }
  }

  silentAudioEl.loop = true;
  silentAudioEl.volume = 0.01;
  silentAudioEl.setAttribute('playsinline', 'true');
  silentAudioEl.setAttribute('webkit-playsinline', 'true');

  if (!cachedSilentWavUrl) {
    cachedSilentWavUrl = getValidSilentWavBlobUrl();
  }

  if (!silentAudioEl.src || silentAudioEl.src === '') {
    silentAudioEl.src = cachedSilentWavUrl;
  }

  if (silentAudioEl.paused) {
    silentAudioEl
      .play()
      .then(() => {
        isSilentAudioActive = true;
        console.log('[Keep-Alive] Silent audio loop aktif di background (Anti-Sleep HyperOS).');
        updateMediaSessionKeepAlive();
      })
      .catch((err) => {
        console.log('[Keep-Alive] Menunggu interaksi user untuk autoplay audio:', err);
      });
  } else {
    isSilentAudioActive = true;
    updateMediaSessionKeepAlive();
  }
}

// MediaSession Keep-Alive: Menandai aplikasi sebagai background media player sah di Android/HyperOS
function updateMediaSessionKeepAlive() {
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Gibah On The Road',
        artist: 'Intercom Active',
        album: 'Touring Mode',
      });
      navigator.mediaSession.playbackState = 'playing';

      navigator.mediaSession.setActionHandler('play', () => {
        toggleMute(false);
        initAndPlaySilentAudio();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        toggleMute(true);
      });
    } catch (e) {
      console.warn('[Keep-Alive] mediaSession setup error:', e);
    }
  }
}

// Trigger pemutaran: Jalankan otomatis segera setelah ada interaksi pertama user
function handleFirstUserInteractionKeepAlive() {
  initAndPlaySilentAudio();
  resumeAudioContext();
}

['click', 'touchstart', 'pointerdown', 'keydown'].forEach((evt) => {
  window.addEventListener(evt, handleFirstUserInteractionKeepAlive, { passive: true });
});

// 2. Adaptive Multi-Tier Audio Constraints (Universal untuk Semua HP Xiaomi, Samsung, Oppo, STB, & Ragam Headset/Interkom)
async function acquireUniversalStream() {
  // Tier 1: Preferensi interkom lengkap (echo cancellation, noise suppression, auto gain)
  try {
    const s1 = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    console.log('[Audio Device] Berhasil memperoleh stream Tier-1 (Full AEC/NS/AGC)');
    return s1;
  } catch (err1) {
    console.warn('[Audio Device] Tier-1 ditolak oleh hardware/driver (mungkin Bluetooth SCO mono):', err1.name, err1.message);
  }

  // Tier 2: Relaksasi constraints (hanya echo cancellation dasar)
  try {
    const s2 = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
      },
      video: false,
    });
    console.log('[Audio Device] Berhasil memperoleh stream Tier-2 (Echo Cancellation saja)');
    return s2;
  } catch (err2) {
    console.warn('[Audio Device] Tier-2 ditolak:', err2.name, err2.message);
  }

  // Tier 3: Universal Fail-Safe (100% Kompatibel dengan semua HP Android/Xiaomi, iOS, & semua headset Bluetooth helm)
  try {
    const s3 = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    console.log('[Audio Device] Berhasil memperoleh stream Tier-3 (Universal Raw Audio)');
    return s3;
  } catch (err3) {
    console.error('[Audio Device] Semua tier getUserMedia gagal:', err3);
    throw err3;
  }
}

async function resumeAudioContext() {
  if (audioCtx && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
    try {
      await audioCtx.resume();
      console.log('[Audio Focus] AudioContext resumed, state:', audioCtx.state);
    } catch (e) {
      console.warn('[Audio Focus] AudioContext resume failed:', e);
    }
  }
}

// Resilient Audio Engine Flags & Timers
let isSwitchingAudio = false;
let lastAudioSwitchTime = 0;
let audioReloadDebounceTimer = null;
let deviceToastTimer = null;

// Sound cue penanda audio ke helm bahwa mic telah pulih (Beep 800Hz selama 0.15s)
function playRecoveryBeep() {
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = audioCtx && audioCtx.state !== 'closed' ? audioCtx : new AudioCtxClass();
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (err) {
    console.warn('[Audio Recovery] Sound cue beep error:', err);
  }
}

// Debounced Auto-Reload Audio Stream (Jeda 1500 ms agar kernel OS selesai transisi routing hardware)
function triggerDebouncedAudioReload(toastMsg = 'Jalur audio disesuaikan') {
  if (toastMsg) {
    showDeviceToast(toastMsg);
  }
  if (audioReloadDebounceTimer) {
    clearTimeout(audioReloadDebounceTimer);
  }
  audioReloadDebounceTimer = setTimeout(() => {
    restartAudioStream();
  }, 1500);
}

// Hardware Switch Listener (Mencegah infinite reload loop pada Android/Xiaomi saat mic aktif)
if (typeof navigator !== 'undefined' && navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) {
  navigator.mediaDevices.ondevicechange = () => {
    console.log('[Audio Hardware] ondevicechange event terdeteksi.');
    // 1. Abaikan jika sedang switching atau dalam cooldown 4 detik terakhir
    if (isSwitchingAudio || (Date.now() - lastAudioSwitchTime < 4000)) {
      console.log('[Audio Hardware] ondevicechange diabaikan (cooldown aktif).');
      return;
    }

    // 2. Cek apakah track lokal saat ini masih live & sehat
    const track = localStream ? localStream.getAudioTracks()[0] : null;
    if (track && track.readyState === 'live' && !track.muted) {
      console.log('[Audio Hardware] Track mikrofon masih live dan aktif, tidak perlu restart.');
      resumeAudioContext();
      return;
    }

    // 3. Hanya jadwalkan reload jika track memang mati/ended
    console.log('[Audio Hardware] Perubahan hardware memerlukan penyesuaian jalur audio.');
    triggerDebouncedAudioReload('Jalur audio disesuaikan');
  };
}

// Auto-Resume AudioContext & Silent Audio saat layar menyala kembali, WA call selesai, atau tab aktif
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('[Audio Focus] Visibility change to visible: resuming audio context & keepalive');
    resumeAudioContext();
    initAndPlaySilentAudio();
  }
});
window.addEventListener('focus', resumeAudioContext);
window.addEventListener('touchstart', resumeAudioContext, { passive: true });
window.addEventListener('click', resumeAudioContext, { passive: true });

function showDeviceToast(msg) {
  const toast = document.getElementById('device-toast');
  const text = document.getElementById('device-toast-text');
  if (toast && text) {
    text.innerText = msg;
    if (msg.includes('✅')) {
      toast.style.borderColor = '#22c55e';
      toast.style.color = '#4ade80';
      toast.style.background = '#052e16';
    } else if (msg.includes('🔄') || msg.includes('Jalur audio')) {
      toast.style.borderColor = '#3b82f6';
      toast.style.color = '#93c5fd';
      toast.style.background = '#0f172a';
    } else {
      toast.style.borderColor = '#eab308';
      toast.style.color = '#fef08a';
      toast.style.background = '#18181b';
    }
    toast.style.display = 'flex';
    if (deviceToastTimer) clearTimeout(deviceToastTimer);
    deviceToastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 4000);
  }
}

function dismissDeviceToast() {
  const toast = document.getElementById('device-toast');
  if (toast) toast.style.display = 'none';
}

// 3. Screen Wake Lock API
async function toggleWakeLock() {
  const btn = document.getElementById('lock-btn');
  if (wakeLockSentinel) {
    await wakeLockSentinel.release();
    wakeLockSentinel = null;
    btn.innerText = 'WakeLock: OFF';
    btn.classList.remove('bg-green');
  } else {
    try {
      if ('wakeLock' in navigator) {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        btn.innerText = 'WakeLock: ON';
        btn.classList.add('bg-green');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
          btn.innerText = 'WakeLock: OFF';
          btn.classList.remove('bg-green');
        });
      } else {
        alert('WakeLock API tidak didukung di browser ini.');
      }
    } catch (e) {
      console.warn('WakeLock error:', e);
    }
  }
}

// 4. Media Session API (Tombol Headset Bluetooth Helm & Background Media Player)
function setupMediaSession() {
  updateMediaSessionKeepAlive();
}

// 5. Battery Status API
function monitorBattery() {
  if ('getBattery' in navigator) {
    navigator.getBattery().then((battery) => {
      myBattery = Math.round(battery.level * 100);
      document.getElementById('battery-disp').innerText = `🔋 ${myBattery}%`;

      battery.addEventListener('levelchange', () => {
        myBattery = Math.round(battery.level * 100);
        document.getElementById('battery-disp').innerText = `🔋 ${myBattery}%`;
        if (socket && socket.connected) {
          socket.emit('update-metadata', { battery: myBattery });
        }
      });
    });
  }
}

// Helper: Get active outgoing audio track
function getOutgoingAudioTrack() {
  if (isDJMode && mixedDestination) {
    const mixedTracks = mixedDestination.stream.getAudioTracks();
    if (mixedTracks.length > 0) return mixedTracks[0];
  }
  return localStream ? localStream.getAudioTracks()[0] : null;
}

// Helper: Sync outgoing track to all active WebRTC peers
function syncTracksToAllPeers() {
  const activeTrack = getOutgoingAudioTrack();
  if (!activeTrack) return;

  const streamToPass = isDJMode && mixedDestination ? mixedDestination.stream : localStream;

  Object.values(peerConnections).forEach((pc) => {
    try {
      const senders = pc.getSenders();
      let audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
      if (!audioSender) {
        // Jika track lama sempat di-stop atau null di Chromium Android
        audioSender = senders.find((s) => !s.track);
      }

      if (audioSender) {
        audioSender.replaceTrack(activeTrack).catch((err) => {
          console.warn('[WebRTC] replaceTrack warning:', err);
        });
      } else if (streamToPass) {
        pc.addTrack(activeTrack, streamToPass);
      }
    } catch (e) {
      console.warn('[WebRTC] syncTracksToAllPeers error:', e);
    }
  });
}

// Helper: Memastikan pipeline mixing WebAudio (Mic + DJ Musik) selalu tersambung dengan benar
function ensureMixingPipeline() {
  if (!audioCtx) return;
  try {
    if (!mixedDestination) {
      mixedDestination = audioCtx.createMediaStreamDestination();
    }

    if (!micGainNode) {
      micGainNode = audioCtx.createGain();
      micGainNode.connect(mixedDestination);
    }

    if (localStream && localStream.getAudioTracks().length > 0) {
      if (micSourceNode) {
        try {
          micSourceNode.disconnect();
        } catch (e) {}
      }
      micSourceNode = audioCtx.createMediaStreamSource(localStream);
      micSourceNode.connect(micGainNode);

      if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
      }
      micSourceNode.connect(analyser);
    }

    // Sambungkan DJ Musik jika node DJ ada
    if (djGainNode) {
      try {
        djGainNode.disconnect();
      } catch (e) {}
      djGainNode.connect(audioCtx.destination);
      if (mixedDestination) {
        djGainNode.connect(mixedDestination);
      }
    }
  } catch (err) {
    console.warn('[Audio Pipeline] ensureMixingPipeline warning:', err);
  }
}

// 6. Sistem Audio Recovery Terpusat (restartAudioStream - Resilient Non-Destructive Soft-Reload)
async function restartAudioStream() {
  // a. Cegah eksekusi tumpang-tindih (anti-spam)
  if (isSwitchingAudio) {
    console.log('[Audio Recovery] Pemulihan audio sedang berjalan, mengabaikan panggilan duplikat.');
    return localStream;
  }
  isSwitchingAudio = true;
  lastAudioSwitchTime = Date.now();
  console.log('[Audio Recovery] Memulai soft-reload audio non-destructive (tanpa reload halaman)...');

  // PENTING: JANGAN STOP track lama duluan!
  // Kita ambil stream baru terlebih dahulu agar rider TIDAK MEMBISU jika transisi hardware memerlukan waktu
  const oldStream = localStream;
  let newStream = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      newStream = await acquireUniversalStream();
      if (newStream && newStream.getAudioTracks().length > 0) break;
    } catch (err) {
      console.warn(`[Audio Recovery] getUserMedia percobaan ke-${attempt + 1} belum berhasil:`, err);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }

  // Jika gagal mendapatkan stream baru, jangan matikan track lama agar rider tidak bisu total!
  if (!newStream || newStream.getAudioTracks().length === 0) {
    console.error('[Audio Recovery] Gagal memperoleh stream audio baru. Mempertahankan jalur aktif.');
    showDeviceToast('⚠️ Gagal memuat mic baru. Cek izin mikrofon di browser.');
    isSwitchingAudio = false;
    return localStream;
  }

  try {
    // e. Pasang track audio baru ke localStream
    localStream = newStream;
    const newTrack = newStream.getAudioTracks()[0];

    // Terapkan state mode interkom (ALWAYS_ON atau PTT)
    applyModeAudioState();

    // Pastikan WebAudio mixing pipeline terhubung
    ensureMixingPipeline();

    // f. Perbarui track audio pada semua RTCPeerConnection sender yang aktif via replaceTrack()
    // Koneksi P2P antar-rider TIDAK AKAN PUTUS atau perlu jabat tangan ulang
    syncTracksToAllPeers();

    // g. Tangani event onmute & onunmute tingkat OS Xiaomi / Android
    newTrack.onmute = () => {
      console.warn('[Audio Track] Mikrofon di-mute sementara oleh OS (notifikasi/panggilan/fokus)');
    };
    newTrack.onunmute = () => {
      console.log('[Audio Track] Mikrofon di-unmute oleh OS, memulihkan status mic');
      applyModeAudioState();
      resumeAudioContext();
    };

    // h. Pasang listener 'ended' pada track baru (misal: headset bluetooth mati / out of range)
    newTrack.onended = () => {
      if (!isSwitchingAudio && Date.now() - lastAudioSwitchTime > 4000) {
        console.log('[Audio Recovery] Track audio berakhir (hardware/bluetooth off), memicu auto soft-reload...');
        triggerDebouncedAudioReload('Jalur audio disesuaikan');
      }
    };

    // i. Bersihkan track mikrofon LAMA HANYA SETELAH track baru aktif & tersambung
    if (oldStream && oldStream !== newStream) {
      oldStream.getTracks().forEach((t) => {
        try {
          t.onended = null;
          t.onmute = null;
          t.onunmute = null;
          t.stop();
        } catch (e) {
          console.warn('[Audio Recovery] Stop old track error:', e);
        }
      });
    }

    // j. Resume AudioContext jika statusnya suspended
    await resumeAudioContext();

    // k. Mainkan sound cue pendek (beep 800Hz 0.15 detik) sebagai konfirmasi ke helm
    playRecoveryBeep();

    console.log('[Audio Recovery] ✅ Mic & WebRTC tracks sukses dipulihkan. Audio normal kembali!');
    showDeviceToast('✅ Jalur audio aktif & normal');
    return localStream;
  } catch (err) {
    console.error('[Audio Recovery] Error pada tahap finalisasi stream:', err);
    return localStream;
  } finally {
    isSwitchingAudio = false;
    lastAudioSwitchTime = Date.now();
  }
}

// Helper alias untuk kompatibilitas fungsi lama
async function setupLocalAudioStream() {
  return await restartAudioStream();
}

// 7. Handler Tombol Manual "Reset Mic / Audio" (Fail-Safe)
function handleManualAudioReset() {
  showDeviceToast('🔄 Mengatur ulang audio stream...');
  restartAudioStream();
}

// Inisialisasi Mikrofon Awal & WebAudio Mixing Pipeline + VAD
async function setupAudio() {
  try {
    // 1. Ambil stream lokal menggunakan helper restartAudioStream
    await restartAudioStream();

    // 2. WebAudio mixing pipeline & VAD (hanya dibuat satu kali)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !audioCtx) {
      audioCtx = new AudioContextClass();
      audioCtx.onstatechange = () => {
        console.log(`[Audio Focus] audioCtx state: ${audioCtx.state}`);
        if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
          if (document.visibilityState === 'visible') {
            audioCtx.resume().catch(console.warn);
          }
        }
      };

      micGainNode = audioCtx.createGain();
      if (localStream) {
        micSourceNode = audioCtx.createMediaStreamSource(localStream);
        micSourceNode.connect(micGainNode);
      }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      if (micSourceNode) micSourceNode.connect(analyser);

      // Destination for mixed audio (Mic + DJ MP3)
      mixedDestination = audioCtx.createMediaStreamDestination();
      micGainNode.connect(mixedDestination);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let isSpeaking = false;

      if (vadInterval) clearInterval(vadInterval);
      vadInterval = setInterval(() => {
        if (!localStream || !localStream.getAudioTracks()[0] || !localStream.getAudioTracks()[0].enabled) {
          if (isSpeaking) {
            isSpeaking = false;
            socket.emit('voice-state', { isSpeaking: false });
            setLocalMarkerSpeaking(false);
          }
          return;
        }

        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;

        if (avg > 25 && !isSpeaking) {
          isSpeaking = true;
          socket.emit('voice-state', { isSpeaking: true });
          setLocalMarkerSpeaking(true);
        } else if (avg <= 25 && isSpeaking) {
          isSpeaking = false;
          socket.emit('voice-state', { isSpeaking: false });
          setLocalMarkerSpeaking(false);
        }
      }, 100);
    }

    applyModeAudioState();
    await resumeAudioContext();
  } catch (err) {
    alert(`Izin Mikrofon Gagal: ${err.message}. Pastikan mikrofon diizinkan!`);
  }
}

// 7. Audio Gain Management: Gain statis murni tanpa ducking dinamis
function applyModeAudioState() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;

  if (intercomMode === 'ALWAYS_ON') {
    track.enabled = !isMuted;
  } else {
    track.enabled = isTransmitting && !isMuted;
  }
}

// 8. DJ Kapten Music Player & Playlist Engine
function initDJAudioNodes() {
  if (djSourceNode || !audioCtx) return;

  djAudioEl = document.getElementById('dj-audio');
  if (!djAudioEl) return;

  // Auto-next track saat lagu berakhir
  djAudioEl.addEventListener('ended', () => {
    console.log('[DJ Kapten] Lagu berakhir, auto-next...');
    playNextTrack();
  });

  djSourceNode = audioCtx.createMediaElementSource(djAudioEl);
  djGainNode = audioCtx.createGain();
  djGainNode.gain.setValueAtTime(djVolume, audioCtx.currentTime);

  djSourceNode.connect(djGainNode);

  // Cabang 1: Diarahkan ke audioCtx.destination (speaker/headset HP Kapten)
  djGainNode.connect(audioCtx.destination);

  // Cabang 2: Diarahkan ke MediaStreamAudioDestinationNode untuk dikirim ke stream WebRTC
  if (mixedDestination) {
    djGainNode.connect(mixedDestination);
  }
}

function isAudioFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return ['mp3', 'aac', 'ogg', 'm4a', 'wav'].includes(ext) || file.type.startsWith('audio/');
}

function handleFolderSelect(event) {
  const files = Array.from(event.target.files || []);
  const audioFiles = files.filter(isAudioFile);
  if (audioFiles.length === 0) {
    alert('Tidak ditemukan file audio (.mp3, .aac, .ogg, .m4a, .wav) dalam folder yang dipilih.');
    return;
  }
  loadFilesToPlaylist(audioFiles);
}

function handleFilesSelect(event) {
  const files = Array.from(event.target.files || []);
  const audioFiles = files.filter(isAudioFile);
  if (audioFiles.length === 0) return;
  loadFilesToPlaylist(audioFiles);
}

function loadDemoTouringTracks() {
  const demoTracks = [
    {
      title: 'Touring Anthem - Upbeat Synthwave',
      name: 'Touring Anthem - Upbeat Synthwave.mp3',
      url: 'https://cdn.freesound.org/previews/557/557815_11861866-lq.mp3',
      lastModified: Date.now() - 1000,
    },
    {
      title: 'Highway Cruising - Chill Lo-Fi',
      name: 'Highway Cruising - Chill Lo-Fi.mp3',
      url: 'https://cdn.freesound.org/previews/612/612662_11861866-lq.mp3',
      lastModified: Date.now() - 2000,
    },
    {
      title: 'Sunset Coast - Ambient Acoustic',
      name: 'Sunset Coast - Ambient Acoustic.mp3',
      url: 'https://cdn.freesound.org/previews/415/415804_5121236-lq.mp3',
      lastModified: Date.now() - 3000,
    },
  ];

  originalPlaylist = demoTracks;
  applyPlaylistSort();
  if (!isDJMode) {
    toggleDJMode(true);
  }
  selectTrack(0, true);
  showDeviceToast('🎵 Lagu Demo Touring dimuat & dimainkan!');
}

function loadFilesToPlaylist(files) {
  originalPlaylist = files.map((f) => ({
    file: f,
    title: f.name.replace(/\.[^/.]+$/, ''),
    name: f.name,
    lastModified: f.lastModified || 0,
  }));

  applyPlaylistSort();
  if (!isDJMode) {
    toggleDJMode(true);
  }
  if (playlist.length > 0 && currentTrackIndex === -1) {
    selectTrack(0, false);
  }
}

function setPlaylistSort(mode) {
  currentSortMode = mode;
  ['sort-name-btn', 'sort-shuffle-btn', 'sort-date-btn'].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('bg-green');
  });

  if (mode === 'NAME') document.getElementById('sort-name-btn')?.classList.add('bg-green');
  if (mode === 'SHUFFLE') document.getElementById('sort-shuffle-btn')?.classList.add('bg-green');
  if (mode === 'DATE') document.getElementById('sort-date-btn')?.classList.add('bg-green');

  applyPlaylistSort();
}

function applyPlaylistSort() {
  const currentTrack = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : null;
  if (currentSortMode === 'NAME') {
    playlist = [...originalPlaylist].sort((a, b) => a.name.localeCompare(b.name));
  } else if (currentSortMode === 'SHUFFLE') {
    playlist = [...originalPlaylist].sort(() => Math.random() - 0.5);
  } else if (currentSortMode === 'DATE') {
    playlist = [...originalPlaylist].sort((a, b) => b.lastModified - a.lastModified);
  }

  if (currentTrack) {
    currentTrackIndex = playlist.findIndex((t) => t.file === currentTrack.file);
  }
  renderPlaylistUI();
}

function renderPlaylistUI() {
  const countEl = document.getElementById('playlist-count');
  const currentLabel = document.getElementById('dj-current-label');
  const container = document.getElementById('playlist-container');

  if (countEl) countEl.innerText = `Playlist: ${playlist.length} Lagu`;
  if (currentLabel) {
    currentLabel.innerText = currentTrackIndex >= 0 && playlist[currentTrackIndex] ? playlist[currentTrackIndex].title : '-';
  }

  if (!container) return;
  if (playlist.length === 0) {
    container.innerHTML = '<div style="padding:10px; text-align:center; color:#71717a; font-size:11px;">Belum ada lagu dimuat. Pilih folder atau berkas MP3 di atas.</div>';
    return;
  }

  container.innerHTML = playlist
    .map((t, idx) => {
      const isActive = idx === currentTrackIndex;
      return `
        <div onclick="selectTrack(${idx}, true)" style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-radius:6px; margin-bottom:2px; cursor:pointer; background:${isActive ? '#2e1065' : '#18181b'}; border:${isActive ? '1px solid #a855f7' : '1px solid transparent'}; font-size:11px;">
          <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
            <span style="color:${isActive ? '#a855f7' : '#71717a'}; font-weight:bold; font-size:10px; width:18px;">${idx + 1}.</span>
            <span style="color:${isActive ? '#e9d5ff' : '#e4e4e7'}; font-weight:${isActive ? '900' : 'normal'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.title}</span>
          </div>
          ${isActive && isDJPlaying ? '<span style="color:#a855f7; font-size:10px; font-weight:bold;">▶ PUTAR</span>' : ''}
        </div>
      `;
    })
    .join('');
}

async function selectTrack(idx, autoPlay = true) {
  if (idx < 0 || idx >= playlist.length) return;
  currentTrackIndex = idx;
  const track = playlist[currentTrackIndex];
  djTrackTitle = track.title;

  initDJAudioNodes();
  if (djAudioEl) {
    if (track.url) {
      djAudioEl.src = track.url;
    } else if (track.file) {
      djAudioEl.src = URL.createObjectURL(track.file);
    }
  }
  renderPlaylistUI();

  if (autoPlay) {
    await resumeAudioContext();
    try {
      await djAudioEl.play();
      isDJPlaying = true;
      updateDJPlayBtn(true);
      if (socket && socket.connected) {
        socket.emit('dj-music-state', { isPlaying: true, trackTitle: djTrackTitle });
      }
    } catch (e) {
      console.warn('Play track error:', e);
    }
  }
}

async function playNextTrack() {
  if (playlist.length === 0) return;
  const nextIdx = (currentTrackIndex + 1) % playlist.length;
  await selectTrack(nextIdx, true);
}

async function playPrevTrack() {
  if (playlist.length === 0) return;
  const prevIdx = (currentTrackIndex - 1 + playlist.length) % playlist.length;
  await selectTrack(prevIdx, true);
}

function updateDJPlayBtn(playing) {
  const playBtn = document.getElementById('dj-play-btn');
  if (playBtn) {
    if (playing) {
      playBtn.innerText = '⏸ JEDA';
      playBtn.style.background = '#eab308';
    } else {
      playBtn.innerText = '▶ PUTAR';
      playBtn.style.background = '#a855f7';
    }
  }
}

function toggleDJMode(explicitState) {
  isDJMode = explicitState !== undefined ? explicitState : !isDJMode;
  const btn = document.getElementById('dj-toggle-btn');
  const djPill = document.getElementById('dj-status-pill');

  if (isDJMode) {
    btn.innerText = 'AKTIF';
    btn.style.background = '#22c55e';
    btn.style.color = '#000';
    if (djPill) djPill.style.display = 'inline';
    initDJAudioNodes();
    ensureMixingPipeline();
  } else {
    btn.innerText = 'OFF';
    btn.style.background = '#27272a';
    btn.style.color = '#a1a1aa';
    if (djPill) djPill.style.display = 'none';
  }

  syncTracksToAllPeers();
}

async function toggleDJPlay() {
  if (!djAudioEl || playlist.length === 0) {
    alert('Pilih folder atau berkas MP3 terlebih dahulu!');
    return;
  }
  initDJAudioNodes();
  await resumeAudioContext();

  if (isDJPlaying) {
    djAudioEl.pause();
    isDJPlaying = false;
    updateDJPlayBtn(false);
    renderPlaylistUI();
    if (socket && socket.connected) {
      socket.emit('dj-music-state', { isPlaying: false, trackTitle: djTrackTitle });
    }
  } else {
    if (currentTrackIndex === -1) {
      await selectTrack(0, true);
      return;
    }
    try {
      await djAudioEl.play();
      isDJPlaying = true;
      updateDJPlayBtn(true);
      renderPlaylistUI();
      if (socket && socket.connected) {
        socket.emit('dj-music-state', { isPlaying: true, trackTitle: djTrackTitle });
      }
    } catch (err) {
      console.warn('DJ play error:', err);
    }
  }
}

function stopDJMusic() {
  if (djAudioEl) {
    djAudioEl.pause();
    djAudioEl.currentTime = 0;
    isDJPlaying = false;
    updateDJPlayBtn(false);
    renderPlaylistUI();
    if (socket && socket.connected) {
      socket.emit('dj-music-state', { isPlaying: false, trackTitle: '' });
    }
  }
}

function changeDJVolume(val) {
  djVolume = parseFloat(val);
  const label = document.getElementById('dj-vol-label');
  if (label) label.innerText = `${Math.round(djVolume * 100)}%`;

  if (djGainNode && audioCtx) {
    djGainNode.gain.setValueAtTime(djVolume, audioCtx.currentTime);
  }
  if (djAudioEl) {
    djAudioEl.volume = djVolume;
  }
}

function changeReceiverVolume(val) {
  receiverVolume = parseFloat(val);
  const label = document.getElementById('rx-vol-label');
  if (label) label.innerText = `${Math.round(receiverVolume * 100)}%`;
  Object.values(remoteAudios).forEach((audio) => {
    if (audio) audio.volume = receiverVolume;
  });
}

function openDJModal() {
  initDJAudioNodes();
  document.getElementById('dj-modal').style.display = 'flex';
}

function closeDJModal() {
  document.getElementById('dj-modal').style.display = 'none';
}

// 9. WebRTC Peer-to-Peer Mesh (STUN Google)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function createPeerConnection(remoteUserId) {
  if (peerConnections[remoteUserId]) {
    peerConnections[remoteUserId].close();
  }

  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections[remoteUserId] = pc;

  const outgoingTrack = getOutgoingAudioTrack();
  const streamToPass = isDJMode && mixedDestination ? mixedDestination.stream : localStream;
  if (outgoingTrack && streamToPass) {
    try {
      pc.addTrack(outgoingTrack, streamToPass);
    } catch (e) {
      console.warn('[WebRTC] pc.addTrack error:', e);
    }
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        to: remoteUserId,
        signal: { candidate: event.candidate },
      });
    }
  };

  pc.ontrack = (event) => {
    let audio = remoteAudios[remoteUserId];
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `remote-audio-${remoteUserId}`;
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.style.display = 'none';
      document.body.appendChild(audio); // Kunci mutlak di Xiaomi/Android agar browser tidak mematikan audio yang detached
      remoteAudios[remoteUserId] = audio;
    }
    // Alur Audio Langsung: remote stream WebRTC langsung ke elemen <audio> yang terpasang di DOM
    audio.srcObject = event.streams[0];
    audio.volume = receiverVolume;
    audio.play().catch((err) => console.warn('[Audio] Remote audio play warning:', err));
  };

  return pc;
}

// 10. Setup Leaflet Map (CartoDB Dark Matter - Gratis Tanpa Token)
function initMap(initialCoords) {
  const coords = initialCoords || [-6.2088, 106.8456];
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView(coords, 16);

  // CartoDB Dark Matter Tiles (Night Mode Bebas Token & Tanpa Watermark)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(map);

  updateMyMarker(coords);
}

function updateMyMarker(coords) {
  if (!map) return;
  const iconHtml = `
    <div id="local-marker-wrap" style="transform: translate(-50%, -50%); text-align: center;">
      <div class="rider-label">${myUsername} (${myBattery}%)</div>
      <div id="local-marker-circle" style="width: 28px; height: 28px; border-radius: 50%; background: #052e16; border: 3px solid #22c55e; margin: 2px auto 0 auto;"></div>
    </div>
  `;
  const icon = L.divIcon({ className: 'custom-icon', html: iconHtml, iconSize: [0, 0], iconAnchor: [0, 0] });

  if (!myMarker) {
    myMarker = L.marker(coords, { icon, zIndexOffset: 1000 }).addTo(map);
  } else {
    myMarker.setLatLng(coords);
    myMarker.setIcon(icon);
  }
}

function setLocalMarkerSpeaking(isSpeaking) {
  const circle = document.getElementById('local-marker-circle');
  if (circle) {
    if (isSpeaking) {
      circle.classList.add('speaking-ring');
      circle.style.borderColor = '#4ade80';
    } else {
      circle.classList.remove('speaking-ring');
      circle.style.borderColor = '#22c55e';
    }
  }
}

function updateRemoteMarker(userId, username, battery, coords, isSpeaking) {
  if (!map || !coords) return;
  const batt = battery !== undefined ? battery : 100;
  const iconHtml = `
    <div style="transform: translate(-50%, -50%); text-align: center;">
      <div class="rider-label" style="border-color: #38bdf8; color: #38bdf8;">${username} (${batt}%)</div>
      <div class="${isSpeaking ? 'speaking-ring' : ''}" style="width: 28px; height: 28px; border-radius: 50%; background: #082f49; border: 3px solid #38bdf8; margin: 2px auto 0 auto;"></div>
    </div>
  `;
  const icon = L.divIcon({ className: 'custom-icon', html: iconHtml, iconSize: [0, 0], iconAnchor: [0, 0] });

  if (!remoteMarkers[userId]) {
    remoteMarkers[userId] = L.marker(coords, { icon, zIndexOffset: 500 }).addTo(map);
  } else {
    remoteMarkers[userId].setLatLng(coords);
    remoteMarkers[userId].setIcon(icon);
  }
}

// 11. GPS Geolocation Tracking
function startGPSTracking() {
  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        myCurrentCoords = coords;
        updateMyMarker(coords);

        if (followMe && map) {
          map.panTo(coords, { animate: true, duration: 0.5 });
        }

        const speedKmh = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
        const speedEl = document.getElementById('speed-meter');
        if (speedEl) speedEl.innerText = `${speedKmh} km/h`;

        if (socket && socket.connected) {
          socket.emit('update-location', {
            coords,
            battery: myBattery,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
          });
        }
      },
      (err) => console.warn('GPS Error:', err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }
}

// 12. PTT & Mute Control Functions
function toggleMode() {
  intercomMode = intercomMode === 'ALWAYS_ON' ? 'PTT' : 'ALWAYS_ON';
  const btn = document.getElementById('mode-btn');
  const pttBtn = document.getElementById('ptt-btn');
  const pttMain = document.getElementById('ptt-main-text');
  const pttSub = document.getElementById('ptt-sub-text');

  if (intercomMode === 'ALWAYS_ON') {
    btn.innerText = 'Mode: Always-ON';
    pttMain.innerText = 'ALWAYS-ON';
    pttSub.innerText = 'Standby Suara Terbuka';
    pttBtn.classList.remove('transmitting');
  } else {
    btn.innerText = 'Mode: PTT (HT)';
    pttMain.innerText = 'TEKAN UNTUK BICARA';
    pttSub.innerText = 'Tahan tombol saat berbicara';
  }
  applyModeAudioState();
}

function toggleMute(explicitState) {
  isMuted = explicitState !== undefined ? explicitState : !isMuted;
  const btn = document.getElementById('mute-btn');
  const text = document.getElementById('mute-text');
  const icon = document.getElementById('mute-icon');

  if (isMuted) {
    btn.classList.add('muted');
    text.innerText = 'MUTED';
    icon.innerText = '🔇';
  } else {
    btn.classList.remove('muted');
    text.innerText = 'MIC ON';
    icon.innerText = '🎤';
  }
  applyModeAudioState();
}

function pttPress() {
  initAndPlaySilentAudio();
  if (intercomMode !== 'PTT' || isMuted) return;
  isTransmitting = true;
  document.getElementById('ptt-btn').classList.add('transmitting');
  document.getElementById('ptt-main-text').innerText = 'TRANSMITTING...';
  applyModeAudioState();
  socket.emit('voice-state', { isSpeaking: true });
}

function pttRelease() {
  if (intercomMode !== 'PTT') return;
  isTransmitting = false;
  document.getElementById('ptt-btn').classList.remove('transmitting');
  document.getElementById('ptt-main-text').innerText = 'TEKAN UNTUK BICARA';
  applyModeAudioState();
  socket.emit('voice-state', { isSpeaking: false });
}

function pttTouchStart(e) {
  e.preventDefault();
  pttPress();
}

function pttTouchEnd(e) {
  e.preventDefault();
  pttRelease();
}

// 13. Hazard & Alert Modal + Map Marker 5-Menit Auto-Dismiss
function openAlertModal() {
  document.getElementById('alert-modal').style.display = 'flex';
}

function closeAlertModal() {
  document.getElementById('alert-modal').style.display = 'none';
}

function sendAlertAndClose(type, msg) {
  closeAlertModal();
  broadcastAlert(type, msg);
}

function broadcastAlert(type, msg) {
  const alertType = type || 'DANGER';
  const alertMsg = msg || '⚠️ BAHAYA / JALAN RUSAK';
  const coords = myCurrentCoords || (myMarker ? [myMarker.getLatLng().lat, myMarker.getLatLng().lng] : null);

  if (socket && socket.connected) {
    socket.emit('convoy-alert', {
      type: alertType,
      message: alertMsg,
      coords,
    });
  }

  // Handle local marker immediately
  handleIncomingAlert({
    userId: 'me',
    username: myUsername,
    type: alertType,
    message: alertMsg,
    coords,
  });
}

function handleIncomingAlert(alertData) {
  const riderKey = alertData.userId || alertData.username || 'convoy';

  // 1. Hapus timer dan marker alert lama milik rider tersebut agar tidak terjadi penumpukan label
  if (alertMarkersByRider[riderKey]) {
    clearTimeout(alertMarkersByRider[riderKey].timer);
    if (alertMarkersByRider[riderKey].marker) {
      alertMarkersByRider[riderKey].marker.remove();
    }
    delete alertMarkersByRider[riderKey];
  }

  // 2. Buat marker Leaflet jika ada koordinat
  const coords = alertData.coords;
  if (map && coords && Array.isArray(coords)) {
    let pinColor = '#ef4444';
    let pinIcon = '⚠️';
    if (alertData.type === 'FUEL') {
      pinColor = '#eab308';
      pinIcon = '⛽';
    } else if (alertData.type === 'REST') {
      pinColor = '#3b82f6';
      pinIcon = '☕';
    } else if (alertData.type === 'STOP') {
      pinColor = '#b91c1c';
      pinIcon = '🛑';
    }

    const iconHtml = `
      <div style="transform: translate(-50%, -50%); text-align: center;">
        <div style="background:${pinColor}; color:#fff; width:34px; height:34px; border-radius:50%; border:2px solid #fff; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 0 16px ${pinColor}; margin:0 auto;" class="speaking-ring">
          ${pinIcon}
        </div>
        <div style="background:rgba(0,0,0,0.9); color:#fff; border:1px solid ${pinColor}; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:bold; margin-top:2px; white-space:nowrap;">
          ${alertData.message}
        </div>
      </div>
    `;

    const alertIcon = L.divIcon({
      className: 'custom-alert-pin',
      html: iconHtml,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const marker = L.marker(coords, { icon: alertIcon, zIndexOffset: 950 }).addTo(map);
    marker.bindPopup(`
      <div style="color:#000; padding:4px; font-size:12px;">
        <strong>${alertData.username}</strong>: ${alertData.message}<br/>
        <span style="color:#71717a; font-size:10px;">${new Date().toLocaleTimeString()} (Hapus otomatis dalam 5 menit)</span>
      </div>
    `);

    // 3. Timer otomatis 5 menit (300000 ms) untuk membersihkan marker dari peta Leaflet
    const timer = setTimeout(() => {
      if (alertMarkersByRider[riderKey]) {
        alertMarkersByRider[riderKey].marker.remove();
        delete alertMarkersByRider[riderKey];
      }
    }, 300000);

    alertMarkersByRider[riderKey] = {
      marker,
      timer,
      id: alertData.id || Date.now(),
    };
  }

  // 4. Tampilkan Toast Banner peringatan (20 detik auto-dismiss)
  showInAppAlert(alertData.username, alertData.message);
}

function showInAppAlert(sender, message) {
  const banner = document.getElementById('alert-banner');
  const senderEl = document.getElementById('alert-sender');
  const textEl = document.getElementById('alert-text');
  const progressEl = document.getElementById('alert-progress');

  if (!banner) return;

  senderEl.innerText = sender || 'RIDER';
  textEl.innerText = message || 'Peringatan Bahaya!';

  // Reset progress bar
  progressEl.style.transition = 'none';
  progressEl.style.width = '100%';

  banner.classList.add('show');

  // Trigger linear 20-second width transition
  setTimeout(() => {
    progressEl.style.transition = 'width 20s linear';
    progressEl.style.width = '0%';
  }, 50);

  // Vibration feedback haptic
  if ('vibrate' in navigator) {
    navigator.vibrate([300, 100, 300, 100, 300]);
  }

  if (activeAlertToastTimer) clearTimeout(activeAlertToastTimer);

  activeAlertToastTimer = setTimeout(() => {
    dismissAlertBanner();
  }, 20000);
}

function dismissAlertBanner() {
  const banner = document.getElementById('alert-banner');
  if (banner) {
    banner.classList.remove('show');
  }
  if (activeAlertToastTimer) {
    clearTimeout(activeAlertToastTimer);
    activeAlertToastTimer = null;
  }
}

// Modal battery
function openBatteryGuide() {
  document.getElementById('battery-modal').style.display = 'flex';
}
function closeBatteryGuide() {
  document.getElementById('battery-modal').style.display = 'none';
}

// 14. Start App Trigger
async function startApp() {
  const userIn = document.getElementById('username').value.trim();
  const roomIn = document.getElementById('room').value.trim().toUpperCase();

  if (!userIn) {
    alert('Harap isi Nama / Callsign Anda!');
    return;
  }

  myUsername = userIn;
  myRoom = roomIn || 'GIBAH ON THE ROAD';

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  document.getElementById('room-badge').innerText = myRoom;

  initAndPlaySilentAudio();
  initMap();
  setupMediaSession();
  monitorBattery();
  await setupAudio();
  startGPSTracking();

  // Connect Socket.io to STB Server
  socket = io({ reconnection: true });

  socket.on('connect', () => {
    socket.emit('join-room', {
      username: myUsername,
      roomId: myRoom,
      battery: myBattery,
    });
  });

  socket.on('room-users', (data) => {
    data.users.forEach((u) => {
      updateRemoteMarker(u.userId, u.username, u.battery, u.coords, u.isSpeaking);
    });
  });

  socket.on('user-connected', async (data) => {
    const pc = createPeerConnection(data.userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { to: data.userId, signal: offer });
  });

  socket.on('signal', async (data) => {
    let pc = peerConnections[data.from] || createPeerConnection(data.from);
    if (data.signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: data.from, signal: answer });
    } else if (data.signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    }
  });

  socket.on('metadata-updated', (data) => {
    updateRemoteMarker(data.userId, data.username, data.battery, data.coords, data.isSpeaking);
  });

  socket.on('voice-state-changed', (data) => {
    if (remoteMarkers[data.userId]) {
      const marker = remoteMarkers[data.userId];
      updateRemoteMarker(data.userId, data.username, 100, marker.getLatLng(), data.isSpeaking);
    }
  });

  // Convoy alert: 5-menit marker di peta & 20s toast
  socket.on('convoy-alert', (alertData) => {
    handleIncomingAlert(alertData);
  });

  // DJ Music state broadcast
  socket.on('dj-music-state', (data) => {
    const pill = document.getElementById('dj-status-pill');
    if (pill) {
      if (data.isPlaying) {
        pill.style.display = 'inline';
        pill.innerText = `🎵 DJ ${data.djName || 'Musik'}`;
      } else {
        pill.style.display = isDJMode ? 'inline' : 'none';
      }
    }
  });

  socket.on('user-disconnected', (userId) => {
    if (remoteMarkers[userId]) {
      remoteMarkers[userId].remove();
      delete remoteMarkers[userId];
    }
    if (peerConnections[userId]) {
      peerConnections[userId].close();
      delete peerConnections[userId];
    }
    if (remoteAudios[userId]) {
      remoteAudios[userId].pause();
      if (remoteAudios[userId].parentNode) {
        remoteAudios[userId].parentNode.removeChild(remoteAudios[userId]);
      }
      delete remoteAudios[userId];
    }
    if (alertMarkersByRider[userId]) {
      clearTimeout(alertMarkersByRider[userId].timer);
      alertMarkersByRider[userId].marker.remove();
      delete alertMarkersByRider[userId];
    }
  });
}
