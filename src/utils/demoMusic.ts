// In-memory Procedural Touring Music Synthesizer & WAV Generator
// Generates 100% offline, zero-latency, high-energy music tracks as WAV Blobs.
// No external HTTP requests, no 404s, no CORS issues, guaranteed to play in all browsers.

import { MusicTrack } from '../types';

interface SynthTrackConfig {
  title: string;
  name: string;
  bpm: number;
  durationSeconds: number;
  rootFreq: number; // Base frequency in Hz (e.g. 146.83 = D3)
  scale: number[]; // Semitone intervals
  style: 'synthwave' | 'rock' | 'chill';
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Generates a 16-bit PCM WAV Blob from mono float samples (-1.0 to 1.0)
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write 16-bit clamped samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// Generate music waveform based on style, tempo, and chord progression
function synthesizeTrack(config: SynthTrackConfig): Blob {
  const sampleRate = 32000;
  const totalSamples = Math.floor(sampleRate * config.durationSeconds);
  const buffer = new Float32Array(totalSamples);

  const beatDuration = 60 / config.bpm;
  const stepDuration = beatDuration / 4; // 16th note
  const totalSteps = Math.floor(config.durationSeconds / stepDuration);

  // Chord progression definitions (semitone offsets from root)
  // Progression: i - VI - III - VII (Classic energetic touring synthwave)
  const chordRoots = [0, -4, 3, -2]; // In semitones

  for (let step = 0; step < totalSteps; step++) {
    const stepStartTime = step * stepDuration;
    const startSample = Math.floor(stepStartTime * sampleRate);
    const endSample = Math.min(totalSamples, Math.floor((stepStartTime + stepDuration) * sampleRate));

    const beatInBar = (step % 16) / 4;
    const stepInBeat = step % 4;
    const barIndex = Math.floor(step / 16);
    const currentChordRoot = chordRoots[barIndex % chordRoots.length];

    const isKick = step % 4 === 0; // Beat 1, 2, 3, 4
    const isSnare = step % 8 === 4; // Beat 2 and 4
    const isHihat = step % 2 === 0; // 8th notes

    // Bass note: rolling 16th note pattern
    const bassMidiOffset = currentChordRoot + (step % 2 === 0 ? 0 : 12);
    const bassFreq = config.rootFreq * Math.pow(2, bassMidiOffset / 12);

    // Melody note (arpeggiated lead)
    const melodyScaleIndex = (step * 3) % config.scale.length;
    const melodyMidiOffset = currentChordRoot + config.scale[melodyScaleIndex] + 24;
    const melodyFreq = config.rootFreq * Math.pow(2, melodyMidiOffset / 12);

    for (let i = startSample; i < endSample; i++) {
      const t = (i - startSample) / sampleRate;
      const progressInStep = t / stepDuration;
      let sample = 0;

      // 1. Kick Drum (Punchy pitch envelope 150Hz -> 45Hz)
      if (isKick) {
        const kickEnv = Math.exp(-progressInStep * 10);
        const kickPitch = 45 + 105 * Math.exp(-progressInStep * 25);
        sample += 0.45 * Math.sin(2 * Math.PI * kickPitch * t) * kickEnv;
      }

      // 2. Snare Drum (Body + White noise burst)
      if (isSnare) {
        const snareEnv = Math.exp(-progressInStep * 8);
        const tone = Math.sin(2 * Math.PI * 180 * t);
        const noise = Math.random() * 2 - 1;
        sample += 0.35 * (0.3 * tone + 0.7 * noise) * snareEnv;
      }

      // 3. Hi-Hat (Crisp high-frequency click)
      if (isHihat) {
        const hatEnv = Math.exp(-progressInStep * 24);
        const noise = Math.random() * 2 - 1;
        sample += 0.12 * noise * hatEnv;
      }

      // 4. Bassline (Driving saw wave with filter decay)
      const bassEnv = Math.exp(-progressInStep * 4.5);
      const bassPhase = (t * bassFreq) % 1;
      const bassSaw = 2 * bassPhase - 1;
      sample += 0.32 * bassSaw * bassEnv;

      // 5. Synth Melody / Pad (Pleasant pulse/square warmth)
      const melodyEnv = Math.exp(-progressInStep * 3.5);
      const melodyPhase = (t * melodyFreq) % 1;
      const melodyWave = melodyPhase < 0.5 ? 0.7 : -0.7;
      sample += 0.18 * melodyWave * melodyEnv;

      buffer[i] += sample;
    }
  }

  // Master Normalize & Soft Limiting
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0.001) {
    const gain = 0.88 / peak;
    for (let i = 0; i < totalSamples; i++) {
      buffer[i] = Math.tanh(buffer[i] * gain);
    }
  }

  return encodeWav(buffer, sampleRate);
}

// Generate the 3 built-in demo tracks on demand and cache them
let cachedDemoTracks: MusicTrack[] | null = null;

export function getBuiltInDemoTracks(): MusicTrack[] {
  if (cachedDemoTracks) return cachedDemoTracks;

  const configs: SynthTrackConfig[] = [
    {
      title: 'Touring Synthwave Anthem',
      name: 'Touring_Synthwave_Anthem.wav',
      bpm: 124,
      durationSeconds: 64,
      rootFreq: 73.42, // D2
      scale: [0, 3, 5, 7, 10, 12, 15], // D minor pentatonic
      style: 'synthwave',
    },
    {
      title: 'Highway Cruiser Beat',
      name: 'Highway_Cruiser_Beat.wav',
      bpm: 128,
      durationSeconds: 60,
      rootFreq: 82.41, // E2
      scale: [0, 2, 4, 7, 9, 12], // E major pentatonic
      style: 'rock',
    },
    {
      title: 'Sunset Coast Chillout',
      name: 'Sunset_Coast_Chillout.wav',
      bpm: 108,
      durationSeconds: 64,
      rootFreq: 65.41, // C2
      scale: [0, 4, 7, 9, 11, 12], // C major 7th / lo-fi
      style: 'chill',
    },
  ];

  const tracks: MusicTrack[] = configs.map((cfg, idx) => {
    const blob = synthesizeTrack(cfg);
    const file = new File([blob], cfg.name, { type: 'audio/wav', lastModified: Date.now() - idx * 1000 });
    return {
      title: cfg.title,
      name: cfg.name,
      file,
      url: URL.createObjectURL(blob),
      lastModified: file.lastModified,
    };
  });

  cachedDemoTracks = tracks;
  return tracks;
}
