// Background Audio Keep-Alive and Alert Synthesizer
// Generates in-memory silent audio to prevent mobile OS task killers from suspending the browser
// when screen is locked or phone is in a riding pocket.

let silentAudioElement: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;
let keepAliveOscillator: OscillatorNode | null = null;
let keepAliveGain: GainNode | null = null;
let cachedSilentWavUrl: string | null = null;

// Generate a valid 1-second silent stereo PCM WAV buffer
function createSilentWavBlob(): Blob {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate * 2; // 2 seconds
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * (bitsPerSample / 8);

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Samples are zeros (silence)
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function startBackgroundAudioKeepAlive(): () => void {
  try {
    if (!silentAudioElement) {
      if (!cachedSilentWavUrl) {
        cachedSilentWavUrl = URL.createObjectURL(createSilentWavBlob());
      }
      silentAudioElement = document.createElement('audio');
      silentAudioElement.src = cachedSilentWavUrl;
      silentAudioElement.loop = true;
      silentAudioElement.preload = 'auto';
      silentAudioElement.volume = 0;
      silentAudioElement.setAttribute('playsinline', 'true');
      silentAudioElement.setAttribute('aria-hidden', 'true');
      silentAudioElement.style.display = 'none';
      document.body.appendChild(silentAudioElement);
      silentAudioElement.play().catch((error) => {
        console.warn('[KeepAlive] Silent background audio did not start:', error);
      });
    }

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Gibah On The Road',
          artist: 'Intercom Aktif (P2P Mesh)',
          album: 'Touring Mode',
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch (e) {
        console.warn('[KeepAlive] mediaSession metadata error:', e);
      }
    }
  } catch (e) {
    console.warn('[KeepAlive] Failed to init media session:', e);
  }

  return () => {
    stopBackgroundAudioKeepAlive();
  };
}

export function stopBackgroundAudioKeepAlive() {
  if (silentAudioElement) {
    try {
      silentAudioElement.pause();
      silentAudioElement.src = '';
      silentAudioElement.remove();
    } catch {}
    silentAudioElement = null;
  }
  if (cachedSilentWavUrl) {
    URL.revokeObjectURL(cachedSilentWavUrl);
    cachedSilentWavUrl = null;
  }
  if (keepAliveOscillator) {
    try {
      keepAliveOscillator.stop();
      keepAliveOscillator.disconnect();
    } catch {}
    keepAliveOscillator = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    try {
      audioContext.close();
    } catch {}
    audioContext = null;
  }
}

// Intercom Beep alert generator for convoy warnings & alerts (PTT chirp, danger chime)
export function playIntercomChirp(type: 'ptt-on' | 'ptt-off' | 'alert' | 'join') {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'ptt-on') {
      // Classic walkie-talkie high-pitch mic opener beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'ptt-off') {
      // Mic closer squelch burst
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.07);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'alert') {
      // Two-tone warning siren for hazard/road danger
      osc.type = 'square';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.setValueAtTime(950, now + 0.12);
      osc.frequency.setValueAtTime(750, now + 0.24);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'join') {
      // Soft chime for new rider joining room
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 600);
  } catch (err) {
    console.warn('Audio alert error:', err);
  }
}
