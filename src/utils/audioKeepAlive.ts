// Background Audio Keep-Alive and Alert Synthesizer
// Generates in-memory silent audio to prevent mobile OS task killers from suspending the browser
// when screen is locked or phone is in a riding pocket.

let silentAudioElement: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;
let keepAliveOscillator: OscillatorNode | null = null;
let keepAliveGain: GainNode | null = null;

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

let cachedSilentWavUrl: string | null = null;

export function startBackgroundAudioKeepAlive(): () => void {
  try {
    // 1. Inisialisasi dan putar elemen audio senyap kontinu
    if (!silentAudioElement) {
      if (!cachedSilentWavUrl) {
        const blob = createSilentWavBlob();
        cachedSilentWavUrl = URL.createObjectURL(blob);
      }
      const el = document.createElement('audio');
      el.id = 'gibah-background-keepalive';
      el.loop = true;
      el.autoplay = true;
      el.muted = false;
      el.volume = 0.001; // Volume mikro non-nol menjaga audio daemon mobile tetap aktif
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');
      el.src = cachedSilentWavUrl;
      el.style.position = 'fixed';
      el.style.bottom = '0px';
      el.style.right = '0px';
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.opacity = '0.01';
      el.style.pointerEvents = 'none';

      el.onpause = () => {
        // Otomatis putar ulang jika sistem mencoba mem-pause di background
        setTimeout(() => {
          if (el && el.paused && cachedSilentWavUrl) {
            el.play().catch(() => {});
          }
        }, 200);
      };

      document.body.appendChild(el);
      silentAudioElement = el;
    }

    if (silentAudioElement.paused) {
      silentAudioElement.play().catch((e) => {
        console.warn('[KeepAlive] Audio keepalive play warning:', e);
      });
    }

    // 2. Daftarkan Media Session API agar Android/iOS mengenali aplikasi sebagai Foreground Audio Service
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Gibah On The Road',
          artist: 'Intercom & Musik Aktif (Latar Belakang)',
          album: 'Touring Mode',
          artwork: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch (e) {
        console.warn('[KeepAlive] mediaSession metadata error:', e);
      }
    }
  } catch (e) {
    console.warn('[KeepAlive] Failed to init background keep-alive:', e);
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
    } catch {}
    silentAudioElement = null;
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
export function playIntercomChirp(type: 'ptt-on' | 'ptt-off' | 'alert' | 'join' | 'leave') {
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
    } else if (type === 'leave') {
      // Descending chime for rider leaving room
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(523.25, now + 0.1); // C5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
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
