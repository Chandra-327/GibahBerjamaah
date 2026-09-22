import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { Socket } from 'socket.io-client';
import { IntercomMode, AudioConnectionStatus, MusicTrack, AudioOutputMode, DJMusicState } from '../types';
import { playIntercomChirp } from '../utils/audioKeepAlive';
import { getBuiltInDemoTracks } from '../utils/demoMusic';
import { DeviceInfoItem } from '../components/AudioDeviceModal';

interface UseIntercomAudioOptions {
  socket: Socket | null;
  roomId: string;
  myCallsign: string;
  mode: IntercomMode;
  isMuted: boolean;
  anyRiderSpeaking?: boolean;
  activeDjState?: DJMusicState | null;
  setActiveDjState?: Dispatch<SetStateAction<DJMusicState | null>>;
}

export function useIntercomAudio({
  socket,
  roomId,
  myCallsign,
  mode,
  isMuted,
  anyRiderSpeaking = false,
  activeDjState = null,
  setActiveDjState,
}: UseIntercomAudioOptions) {
  const [audioStatus, setAudioStatus] = useState<AudioConnectionStatus>('disconnected');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isMySpeaking, setIsMySpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio Output Mode (Dipertahankan untuk backward compatibility)
  const [audioOutputMode] = useState<AudioOutputMode>('headset');

  // Multi-Device & Hardware Routing State
  const [inputDevices, setInputDevices] = useState<DeviceInfoItem[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceInfoItem[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>(''); // '' = Auto / Utamakan Bluetooth
  const [selectedOutputId, setSelectedOutputId] = useState<string>(''); // '' = Auto / Sistem
  const [activeDeviceLabel, setActiveDeviceLabel] = useState<string>('Mendeteksi perangkat...');
  const [isFixingAudio, setIsFixingAudio] = useState<boolean>(false);

  // Audio Device Toast with Auto-Dismiss
  const [deviceToastMessage, setDeviceToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showDeviceToast = useCallback((msg: string) => {
    setDeviceToastMessage(msg);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setDeviceToastMessage(null);
    }, 3000);
  }, []);

  // DJ Kapten Music Sharing & Playlist State
  const [isDjMode, setIsDjMode] = useState(false);
  const [musicTrackTitle, setMusicTrackTitle] = useState<string>('');
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('gibah_music_volume');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
    } catch {}
    return 0.85; // Default 85% volume musik optimal untuk helm
  });
  const [receiverVolume, setReceiverVolume] = useState<number>(1.35); // 0.0 - 2.5 (Remote intercom volume, default 135% boost)
  const [micBoost, setMicBoost] = useState<number>(1.0); // 0.5 - 1.5 (Default 1.0 / 100% clean standard preamp)
  const [isDucked] = useState(false);

  // Playlist State
  const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
  const [originalPlaylist, setOriginalPlaylist] = useState<MusicTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [sortMode, setSortMode] = useState<'NAME' | 'SHUFFLE' | 'DATE'>('NAME');

  // References
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const remoteGainNodesRef = useRef<Record<string, GainNode>>({});
  const remoteSourceNodesRef = useRef<Record<string, MediaStreamAudioSourceNode>>({});
  const remoteMasterLimiterRef = useRef<DynamicsCompressorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const isSpeakingStateRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isSwitchingAudioRef = useRef(false);
  const deviceChangeDebounceRef = useRef<number | null>(null);

  // DJ Nodes & Compressor
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const musicGainNodeRef = useRef<GainNode | null>(null);
  const musicMixedGainNodeRef = useRef<GainNode | null>(null);
  const musicPocketFilterRef = useRef<BiquadFilterNode | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const micPreampGainNodeRef = useRef<GainNode | null>(null);
  const micHighPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const micPresenceFilterRef = useRef<BiquadFilterNode | null>(null);
  const vocalCompressorNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const masterBroadcastLimiterRef = useRef<DynamicsCompressorNode | null>(null);
  const mixedMasterBusRef = useRef<GainNode | null>(null);
  const makeupGainNodeRef = useRef<GainNode | null>(null);
  const mixedDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const keepAliveNodeRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);

  // Auto-next track ref
  const playNextTrackRef = useRef<(() => Promise<void>) | null>(null);

  // Audio Playback Tracking Refs for Resilient Auto-Resume
  const isMusicPlayingRef = useRef(isMusicPlaying);
  useEffect(() => {
    isMusicPlayingRef.current = isMusicPlaying;
  }, [isMusicPlaying]);

  const musicTrackTitleRef = useRef(musicTrackTitle);
  useEffect(() => {
    musicTrackTitleRef.current = musicTrackTitle;
  }, [musicTrackTitle]);

  // Exclusive Single-DJ Status Calculation (Resilient against socket reconnects)
  const isDjOwner = Boolean(
    activeDjState?.isDjActive &&
    ((activeDjState.activeDjId && socket?.id && activeDjState.activeDjId === socket.id) ||
      (activeDjState.activeDjName && myCallsign && activeDjState.activeDjName.trim().toLowerCase() === myCallsign.trim().toLowerCase()))
  );
  const isDjLockedByOther = Boolean(
    activeDjState?.isDjActive &&
    !isDjOwner
  );

  // Auto-synchronize local DJ state with server broadcast (Resilient against signal drops)
  useEffect(() => {
    if (activeDjState) {
      const isMe = Boolean(
        (activeDjState.activeDjId && socket?.id && activeDjState.activeDjId === socket.id) ||
        (activeDjState.activeDjName && myCallsign && activeDjState.activeDjName.trim().toLowerCase() === myCallsign.trim().toLowerCase())
      );

      if (activeDjState.isDjActive && isMe) {
        setIsDjMode(true);
        // Jika socket ID baru setelah reconnect saat sinyal pulih, update klaim ke server
        if (socket?.connected && activeDjState.activeDjId !== socket.id) {
          socket.emit('claim-dj');
        }
      } else if (activeDjState.isDjActive && !isMe) {
        // Rider lain yang sah telah mengambil alih kursi DJ
        setIsDjMode(false);
        if (isMusicPlaying) {
          isMusicPlayingRef.current = false;
          if (musicAudioRef.current) {
            musicAudioRef.current.pause();
            musicAudioRef.current.currentTime = 0;
          }
          setIsMusicPlaying(false);
        }
      } else if (!activeDjState.isDjActive) {
        // Status DJ di server non-aktif (misal karena reset atau sinyal putus sementara)
        // JANGAN matikan musik lokal jika perangkat ini sedang aktif memutar musik!
        if (!isMusicPlayingRef.current) {
          setIsDjMode(false);
        } else if (socket?.connected) {
          // Otomatis pulihkan status DJ jika musik lokal masih berputar
          console.log('[DJ] Memulihkan klaim DJ saat sinyal/server pulih...');
          socket.emit('claim-dj');
          socket.emit('dj-music-state', {
            isPlaying: true,
            trackTitle: musicTrackTitleRef.current,
          });
        }
      }
    }
  }, [activeDjState, socket?.id, socket, myCallsign, isMusicPlaying]);

  // Queued ICE candidates to prevent InvalidStateError before setRemoteDescription
  const queuedCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const makingOfferRef = useRef<Record<string, boolean>>({});
  const [connectedPeersCount, setConnectedPeersCount] = useState<number>(0);
  const knownRoomUsersRef = useRef<string[]>([]);

  // Out-of-Range Alarm & Auto-Reconnect State Tracking
  const lastKnownOnlinePeersRef = useRef<number>(0);
  const wasOutOfRangeRef = useRef<boolean>(false);
  const lastAlarmPlayedAtRef = useRef<number>(0);
  const outOfRangeTimerRef = useRef<number | null>(null);

  // ICE Servers (High-Availability Google, Cloudflare, Twilio STUN + OpenRelay TURN for Mobile 4G/5G/CGNAT)
  const iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
          'turns:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelay',
        credential: 'openrelay',
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };

  // Helper untuk memeriksa apakah sebuah label merupakan Bluetooth / Headset Helm / Wired External
  const isBluetoothOrHeadset = (label: string): boolean => {
    const l = (label || '').toLowerCase();
    return (
      l.includes('bluetooth') ||
      l.includes('headset') ||
      l.includes('wireless') ||
      l.includes('handsfree') ||
      l.includes('airpods') ||
      l.includes('buds') ||
      l.includes('tws') ||
      l.includes('earpiece') ||
      l.includes('sena') ||
      l.includes('cardo') ||
      l.includes('ejeas') ||
      l.includes('freedconn') ||
      l.includes('intercom') ||
      l.includes('wired') ||
      l.includes('headphone') ||
      l.includes('earphone') ||
      l.includes('usb') ||
      l.includes('type-c')
    );
  };

  // Helper untuk mendapatkan singleton AudioContext yang stabil
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioCtx({ latencyHint: 'interactive' });
    }
    return audioContextRef.current;
  }, []);

  // Resume AudioContext jika tertidur oleh kebijakan browser mobile saat pergantian device
  const resumeAudioContext = useCallback(async () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended' || ctx.state === ('interrupted' as AudioContextState)) {
        await ctx.resume();
        console.log('[AudioContext] Resumed successfully. State:', ctx.state);
      }
    } catch (e) {
      console.warn('[AudioContext] Resume error:', e);
    }
  }, [getAudioContext]);

  // Unpause semua remote audio elements & pastikan WebAudio berjalan
  const unpauseAllRemoteAudios = useCallback(() => {
    (Object.values(audioElementsRef.current) as HTMLAudioElement[]).forEach((audio) => {
      if (audio && audio.srcObject) {
        audio.muted = false;
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      }
    });
    if (
      audioContextRef.current &&
      (audioContextRef.current.state === 'suspended' ||
        audioContextRef.current.state === ('interrupted' as AudioContextState))
    ) {
      audioContextRef.current.resume().catch(() => {});
    }
  }, []);

  // Terapkan Sink ID output (Speaker/Bluetooth) ke seluruh audio element jika browser mendukung
  const applyAudioSinkId = useCallback(
    async (targetSinkId?: string) => {
      const sink = targetSinkId !== undefined ? targetSinkId : selectedOutputId;
      for (const audio of Object.values(audioElementsRef.current)) {
        if (audio && 'setSinkId' in (audio as Record<string, unknown>)) {
          try {
            await (audio as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(sink);
          } catch (e) {
            console.warn('[Audio Sink] SetSinkId element note:', e);
          }
        }
      }
      if (musicAudioRef.current && 'setSinkId' in (musicAudioRef.current as Record<string, unknown>)) {
        try {
          await (musicAudioRef.current as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(sink);
        } catch (e) {
          console.warn('[Audio Sink] SetSinkId DJ music note:', e);
        }
      }
      if (audioContextRef.current && 'setSinkId' in (audioContextRef.current as Record<string, unknown>)) {
        try {
          await (audioContextRef.current as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(sink);
        } catch (e) {
          console.warn('[Audio Sink] SetSinkId AudioContext note:', e);
        }
      }
    },
    [selectedOutputId]
  );

  // Enumerate & Refresh Available Devices List
  const refreshAudioDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();

      const inputs: DeviceInfoItem[] = [];
      const outputs: DeviceInfoItem[] = [];

      devices.forEach((d) => {
        const isBt = isBluetoothOrHeadset(d.label);
        if (d.kind === 'audioinput') {
          inputs.push({
            deviceId: d.deviceId,
            label: d.label || `Mikrofon ${inputs.length + 1}`,
            kind: 'audioinput',
            isBluetooth: isBt,
          });
        } else if (d.kind === 'audiooutput') {
          outputs.push({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${outputs.length + 1}`,
            kind: 'audiooutput',
            isBluetooth: isBt,
          });
        }
      });

      setInputDevices(inputs);
      setOutputDevices(outputs);

      const activeTrack = localStreamRef.current?.getAudioTracks()[0];
      if (activeTrack && activeTrack.label) {
        setActiveDeviceLabel(activeTrack.label);
      } else {
        const btInput = inputs.find((i) => i.isBluetooth);
        if (btInput) {
          setActiveDeviceLabel(`🎧 ${btInput.label}`);
        } else if (inputs.length > 0) {
          setActiveDeviceLabel(`📱 ${inputs[0].label || 'Mikrofon Bawaan HP'}`);
        } else {
          setActiveDeviceLabel('Audio Otomatis');
        }
      }
    } catch (e) {
      console.warn('[Audio Devices] Enumerate error:', e);
    }
  }, []);

  // Adaptive Multi-Tier Audio Constraints dengan Fallback Khusus Berbagai Merek HP
  const acquireUniversalStream = useCallback(
    async (targetDeviceId?: string): Promise<MediaStream> => {
      let preferredDeviceId = targetDeviceId || (selectedInputId !== '' ? selectedInputId : undefined);

      if (!preferredDeviceId) {
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const bt = devices.find((d) => d.kind === 'audioinput' && isBluetoothOrHeadset(d.label));
            if (bt && bt.deviceId) {
              preferredDeviceId = bt.deviceId;
              console.log('[Audio Device] Memprioritaskan Bluetooth/Headset Helm:', bt.label);
            }
          }
        } catch {}
      }

      let stream: MediaStream | null = null;

      // Tier 1: Preferensi interkom jernih (Echo Cancellation + Noise Suppression, Tanpa AGC yang mengecilkan volume)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: preferredDeviceId ? { ideal: preferredDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false, // CRITICAL: Mencegah volume mengecil sendiri
          },
          video: false,
        });
        console.log('[Audio Device] Berhasil memperoleh stream Tier-1 (AEC & NS Aktif, AGC Off)');
      } catch (err1: unknown) {
        console.warn('[Audio Device] Tier-1 ditolak oleh hardware/driver:', err1);
      }

      // Tier 2: Standard Echo Cancellation
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: preferredDeviceId ? { ideal: preferredDeviceId } : undefined,
              echoCancellation: true,
              autoGainControl: false,
            },
            video: false,
          });
          console.log('[Audio Device] Berhasil memperoleh stream Tier-2');
        } catch (err2: unknown) {
          console.warn('[Audio Device] Tier-2 ditolak:', err2);
        }
      }

      // Tier 3: Universal Fallback (Raw Audio)
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: preferredDeviceId ? { deviceId: { ideal: preferredDeviceId } } : true,
            video: false,
          });
          console.log('[Audio Device] Berhasil memperoleh stream Tier-3 (Raw Audio)');
        } catch (err3: unknown) {
          console.error('[Audio Device] Semua konfigurasi audio ditolak:', err3);
          throw err3;
        }
      }

      // Pasang Event Listeners ke Track agar deteksi jika OS mematikan/mute track secara sepihak
      const track = stream.getAudioTracks()[0];
      if (track) {
        setActiveDeviceLabel(track.label || 'Mikrofon Aktif');

        track.onended = () => {
          console.warn('[Audio Track] Track mic ended (terputus oleh OS/driver), auto-recovering...');
          setTimeout(() => {
            if (!isSwitchingAudioRef.current) {
              restartAudioStream();
            }
          }, 300);
        };

        track.onmute = () => {
          console.warn('[Audio Track] Track mic dimute oleh OS (hardware route transition)...');
          resumeAudioContext();
        };

        track.onunmute = () => {
          console.log('[Audio Track] Track mic unmuted oleh OS.');
          resumeAudioContext();
          unpauseAllRemoteAudios();
        };
      }

      return stream;
    },
    [selectedInputId, resumeAudioContext, unpauseAllRemoteAudios]
  );

  // Update Mic Gain Node (On/Off)
  const updateMicGain = useCallback((enabled: boolean) => {
    if (micGainNodeRef.current && audioContextRef.current) {
      try {
        micGainNodeRef.current.gain.setValueAtTime(
          enabled ? 1.0 : 0.0,
          audioContextRef.current.currentTime
        );
      } catch {}
    }
  }, []);

  // Setup Master Audio Graph (Preamp Voice Booster + Intelligibility EQ + Continuous DJ Mixing Engine)
  const ensureAudioPipeline = useCallback(
    (stream?: MediaStream) => {
      try {
        const ctx = getAudioContext();
        if (
          ctx.state === 'suspended' ||
          ctx.state === ('interrupted' as AudioContextState)
        ) {
          ctx.resume().catch(() => {});
        }

        // 1. Destination permanen untuk WebRTC broadcast stream (Vokal + Musik)
        if (!mixedDestinationRef.current) {
          mixedDestinationRef.current = ctx.createMediaStreamDestination();
        }

        // 2. Master Broadcast Mix Bus & Master Limiter (Transparan & Anti-Pumping)
        if (!mixedMasterBusRef.current) {
          const bus = ctx.createGain();
          bus.gain.setValueAtTime(1.0, ctx.currentTime);
          mixedMasterBusRef.current = bus;
        }

        if (!masterBroadcastLimiterRef.current) {
          const lim = ctx.createDynamicsCompressor();
          lim.threshold.setValueAtTime(-2.5, ctx.currentTime);
          lim.knee.setValueAtTime(6, ctx.currentTime);
          lim.ratio.setValueAtTime(3.0, ctx.currentTime);
          lim.attack.setValueAtTime(0.005, ctx.currentTime);
          lim.release.setValueAtTime(0.20, ctx.currentTime);
          masterBroadcastLimiterRef.current = lim;
        }

        // 3. Post-Limiter Makeup Gain ke WebRTC broadcast destination
        if (!makeupGainNodeRef.current) {
          const makeup = ctx.createGain();
          makeup.gain.setValueAtTime(1.0, ctx.currentTime);
          makeup.connect(mixedDestinationRef.current);
          makeupGainNodeRef.current = makeup;

          if (mixedMasterBusRef.current && masterBroadcastLimiterRef.current) {
            mixedMasterBusRef.current.connect(masterBroadcastLimiterRef.current);
            masterBroadcastLimiterRef.current.connect(makeup);
          }
        }

        // 4. Sub-audible Keep-alive Clock (40Hz @ 0.00001 gain) HANYA ke mixedDestination
        if (!keepAliveNodeRef.current) {
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(40, ctx.currentTime);
            gain.gain.setValueAtTime(0.00001, ctx.currentTime);
            osc.connect(gain);
            gain.connect(mixedDestinationRef.current);
            osc.start();
            keepAliveNodeRef.current = { osc, gain };
          } catch (e) {
            console.warn('[KeepAlive] Clock node note:', e);
          }
        }

        // 5. Inisialisasi Jalur Mikrofon Rider (Preamp Booster + Low-cut 130Hz + Vocal Presence 2800Hz + Vocal Compressor)
        const micStream = stream || localStreamRef.current;
        if (micStream && micStream.getAudioTracks().length > 0) {
          if (micSourceNodeRef.current) {
            try {
              micSourceNodeRef.current.disconnect();
            } catch {}
          }

          const micSource = ctx.createMediaStreamSource(micStream);
          micSourceNodeRef.current = micSource;

          // High-Pass Filter (160Hz): Memotong gemuruh knalpot, getaran mesin motor, & turbulensi angin helm
          if (!micHighPassFilterRef.current) {
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(160, ctx.currentTime);
            hp.Q.setValueAtTime(0.7, ctx.currentTime);
            micHighPassFilterRef.current = hp;
          }

          // Presence Filter (2600Hz, +2.5dB): Memperjelas artikulasi vokal konsonan tanpa mengangkat desis angin
          if (!micPresenceFilterRef.current) {
            const eq = ctx.createBiquadFilter();
            eq.type = 'peaking';
            eq.frequency.setValueAtTime(2600, ctx.currentTime);
            eq.gain.setValueAtTime(2.5, ctx.currentTime);
            eq.Q.setValueAtTime(1.0, ctx.currentTime);
            micPresenceFilterRef.current = eq;
          }

          // Preamp Booster Gain: Rentang 50% - 150% (0.5x - 1.5x)
          if (!micPreampGainNodeRef.current) {
            const pre = ctx.createGain();
            const effectiveGain = Math.max(0.5, Math.min(1.5, micBoost));
            pre.gain.setValueAtTime(effectiveGain, ctx.currentTime);
            micPreampGainNodeRef.current = pre;
          }

          // Mic Gate Gain (1.0 = aktif bicara, 0.0 = senyap/mute)
          if (!micGainNodeRef.current) {
            const gate = ctx.createGain();
            micGainNodeRef.current = gate;
          }

          const shouldBeLive = mode === 'ALWAYS_ON' ? !isMuted : isTransmitting && !isMuted;
          micGainNodeRef.current.gain.setValueAtTime(shouldBeLive ? 1.0 : 0.0, ctx.currentTime);

          // Dedicated Vocal Compressor (Meratakan suara vokal agar konsisten & tidak terdistorsi)
          if (!vocalCompressorNodeRef.current) {
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.setValueAtTime(-22, ctx.currentTime);
            comp.knee.setValueAtTime(6, ctx.currentTime);
            comp.ratio.setValueAtTime(3.0, ctx.currentTime);
            comp.attack.setValueAtTime(0.005, ctx.currentTime);
            comp.release.setValueAtTime(0.15, ctx.currentTime);
            vocalCompressorNodeRef.current = comp;
          }

          // Hubungkan rantai vokal: Source -> HPF -> Presence -> Preamp -> Gate -> Vocal Compressor -> Mixed Master Bus
          try {
            micSource.connect(micHighPassFilterRef.current);
            micHighPassFilterRef.current.connect(micPresenceFilterRef.current);
            micPresenceFilterRef.current.connect(micPreampGainNodeRef.current);
            micPreampGainNodeRef.current.connect(micGainNodeRef.current);
            if (vocalCompressorNodeRef.current && mixedMasterBusRef.current) {
              micGainNodeRef.current.connect(vocalCompressorNodeRef.current);
              vocalCompressorNodeRef.current.connect(mixedMasterBusRef.current);
            }
          } catch (e) {
            console.warn('[Mic Chain] Connect note:', e);
          }

          // VAD Analyser Node
          if (!analyserRef.current) {
            const analyserNode = ctx.createAnalyser();
            analyserNode.fftSize = 256;
            analyserNode.smoothingTimeConstant = 0.4;
            analyserRef.current = analyserNode;
          }
          try {
            micSource.connect(analyserRef.current);
          } catch {}

          // VAD Meter Interval
          if (!vadIntervalRef.current && analyserRef.current) {
            const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
            vadIntervalRef.current = window.setInterval(() => {
              if (!localStreamRef.current?.getAudioTracks()[0]?.enabled) {
                if (isSpeakingStateRef.current) {
                  isSpeakingStateRef.current = false;
                  setIsMySpeaking(false);
                  socket?.emit('voice-state', { isSpeaking: false });
                }
                return;
              }

              if (analyserRef.current) {
                analyserRef.current.getByteFrequencyData(buffer);
                let sum = 0;
                for (let i = 0; i < buffer.length; i++) sum += buffer[i];
                const avg = sum / buffer.length;

                if (avg > 25 && !isSpeakingStateRef.current) {
                  isSpeakingStateRef.current = true;
                  setIsMySpeaking(true);
                  socket?.emit('voice-state', { isSpeaking: true });
                } else if (avg <= 25 && isSpeakingStateRef.current) {
                  isSpeakingStateRef.current = false;
                  setIsMySpeaking(false);
                  socket?.emit('voice-state', { isSpeaking: false });
                }
              }
            }, 100);
          }
        }

        // 6. Inisialisasi Elemen Audio Musik DJ
        let audioEl = musicAudioRef.current;
        if (!audioEl) {
          audioEl = document.getElementById('dj-music-audio-element') as HTMLAudioElement;
          if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = 'dj-music-audio-element';
            audioEl.loop = false;
            audioEl.setAttribute('playsinline', 'true');
            audioEl.setAttribute('webkit-playsinline', 'true');
            audioEl.style.position = 'fixed';
            audioEl.style.bottom = '0px';
            audioEl.style.right = '0px';
            audioEl.style.width = '1px';
            audioEl.style.height = '1px';
            audioEl.style.opacity = '0.01';
            audioEl.style.pointerEvents = 'none';
            document.body.appendChild(audioEl);
          }

          audioEl.onended = () => {
            console.log('[DJ] Lagu selesai, lanjut ke lagu berikutnya...');
            playNextTrackRef.current?.();
          };

          // Auto-recovery jika musik terhenti mendadak oleh interupsi OS, sinyal, atau browser throttling
          audioEl.onpause = () => {
            if (isMusicPlayingRef.current) {
              console.log('[DJ] Deteksi musik terpause tak terduga, menjadwalkan auto-resume...');
              setTimeout(() => {
                if (isMusicPlayingRef.current && audioEl && audioEl.paused) {
                  audioEl.play().catch((err) => {
                    console.warn('[DJ] Auto-resume onpause note:', err);
                  });
                }
              }, 250);
            }
          };

          audioEl.onerror = (e) => {
            console.warn('[DJ] Audio playback error terdeteksi:', e);
            if (isMusicPlayingRef.current && audioEl && audioEl.src) {
              const lastTime = audioEl.currentTime;
              setTimeout(() => {
                if (isMusicPlayingRef.current && audioEl) {
                  audioEl.load();
                  audioEl.currentTime = lastTime;
                  audioEl.play().catch(() => {});
                }
              }, 500);
            }
          };

          musicAudioRef.current = audioEl;
        }

        if (audioEl) {
          try {
            audioEl.volume = musicVolume;
          } catch {}
        }

        // 7. Hubungkan MediaElementSource ke WebAudio Graph SEKALI saja
        if (!musicSourceNodeRef.current && audioEl) {
          try {
            musicSourceNodeRef.current = ctx.createMediaElementSource(audioEl);
          } catch (e) {
            console.warn('[DJ] createMediaElementSource note:', e);
          }
        }

        // Gain Musik Lokal (Speaker/Headset DJ sendiri)
        if (!musicGainNodeRef.current) {
          const mg = ctx.createGain();
          mg.gain.setValueAtTime(musicVolume, ctx.currentTime);
          musicGainNodeRef.current = mg;
        }

        // Vocal Pocket Filter on Music Track (2500Hz dip -3.5dB): Memberi ruang frekuensi vokal rider agar musik tidak menabrak/menutupi suara manusia
        if (!musicPocketFilterRef.current) {
          const pocket = ctx.createBiquadFilter();
          pocket.type = 'peaking';
          pocket.frequency.setValueAtTime(2500, ctx.currentTime);
          pocket.gain.setValueAtTime(-3.5, ctx.currentTime);
          pocket.Q.setValueAtTime(1.0, ctx.currentTime);
          musicPocketFilterRef.current = pocket;
        }

        // Gain Musik Siaran Campuran WebRTC (Siaran ke rider lain - Terisolasi & Stabil)
        if (!musicMixedGainNodeRef.current) {
          const mm = ctx.createGain();
          const targetMix = isDjMode && isMusicPlaying ? (musicVolume * 0.70) : 0.0;
          mm.gain.setValueAtTime(targetMix, ctx.currentTime);
          musicMixedGainNodeRef.current = mm;
        }

        // Sambungkan Musik Secara Terpisah (Independent Parallel Routing):
        // 1. Source -> MusicGain (Lokal) -> ctx.destination (DJ dengar sesuai slider)
        // 2. Source -> MusicPocketFilter -> MusicMixedGain (Siaran WebRTC) -> MixedMasterBus (Stabil ke rider lain)
        if (
          musicSourceNodeRef.current &&
          musicGainNodeRef.current &&
          musicMixedGainNodeRef.current &&
          mixedMasterBusRef.current
        ) {
          try {
            musicSourceNodeRef.current.disconnect();
          } catch {}

          try {
            // Jalur Lokal DJ (Full-range hi-fi tanpa pemotongan)
            musicSourceNodeRef.current.connect(musicGainNodeRef.current);
            musicGainNodeRef.current.connect(ctx.destination);

            // Jalur Siaran Campuran (Direct Stable Broadcast -> Master Bus)
            if (musicPocketFilterRef.current) {
              musicSourceNodeRef.current.connect(musicPocketFilterRef.current);
              musicPocketFilterRef.current.connect(musicMixedGainNodeRef.current);
            } else {
              musicSourceNodeRef.current.connect(musicMixedGainNodeRef.current);
            }
            musicMixedGainNodeRef.current.connect(mixedMasterBusRef.current);
          } catch (e) {
            console.warn('[Music Chain] Connect note:', e);
          }
        }
      } catch (err) {
        console.warn('[Audio Pipeline] Setup note:', err);
      }
    },
    [getAudioContext, mode, isMuted, isTransmitting, musicVolume, isDjMode, isMusicPlaying, socket, micBoost]
  );

  // Audio track aktif yang selalu mengalir ke peer WebRTC
  const getActiveOutgoingTrack = useCallback(() => {
    if (mixedDestinationRef.current) {
      const mixedTrack = mixedDestinationRef.current.stream.getAudioTracks()[0];
      if (mixedTrack) return mixedTrack;
    }
    return localStreamRef.current?.getAudioTracks()[0] || localStream?.getAudioTracks()[0] || null;
  }, [localStream]);

  // Sinkronisasi active track ke semua peer WebRTC tanpa memutus koneksi
  const syncTrackToPeers = useCallback(() => {
    const newTrack = getActiveOutgoingTrack();
    if (!newTrack) return;

    if (newTrack.enabled === false && mode === 'ALWAYS_ON' && !isMuted) {
      newTrack.enabled = true;
    }

    const outgoingStream = mixedDestinationRef.current
      ? mixedDestinationRef.current.stream
      : localStreamRef.current;

    (Object.values(peersRef.current) as RTCPeerConnection[]).forEach((pc) => {
      try {
        const senders = pc.getSenders();
        let audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
        if (!audioSender) {
          audioSender = senders.find((s) => !s.track);
        }
        if (audioSender && audioSender.track !== newTrack) {
          audioSender.replaceTrack(newTrack).catch((err) => {
            console.warn('[WebRTC] replaceTrack warning:', err);
          });
        } else if (!audioSender && outgoingStream) {
          pc.addTrack(newTrack, outgoingStream);
        }
      } catch (e) {
        console.warn('[WebRTC] sync track error:', e);
      }
    });
  }, [getActiveOutgoingTrack, mode, isMuted]);

  // Restart / Switch Audio Stream dengan Transisi Mulus Antar Perangkat (HP / Bluetooth / Headset)
  const restartAudioStream = useCallback(
    async (targetDeviceId?: string) => {
      if (isSwitchingAudioRef.current) return localStreamRef.current;
      isSwitchingAudioRef.current = true;
      console.log('[Audio Transition] Memulai transisi perangkat audio...');

      try {
        await resumeAudioContext();
        const newStream = await acquireUniversalStream(targetDeviceId);
        if (!newStream || newStream.getAudioTracks().length === 0) {
          isSwitchingAudioRef.current = false;
          return localStreamRef.current;
        }

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
        }

        localStreamRef.current = newStream;
        setLocalStream(newStream);
        const newTrack = newStream.getAudioTracks()[0];

        if (mode === 'ALWAYS_ON') {
          newTrack.enabled = !isMuted;
        } else {
          newTrack.enabled = isTransmitting && !isMuted;
        }

        ensureAudioPipeline(newStream);
        syncTrackToPeers();
        await applyAudioSinkId();
        unpauseAllRemoteAudios();
        await refreshAudioDevices();

        const label = newTrack.label || 'Audio';
        const isExt = isBluetoothOrHeadset(label);
        showDeviceToast(isExt ? `🎧 Terhubung ke: ${label}` : `📱 Beralih ke Mic & Speaker HP`);

        return newStream;
      } catch (e) {
        console.warn('[Audio Transition] Error switching audio stream:', e);
        return localStreamRef.current;
      } finally {
        isSwitchingAudioRef.current = false;
      }
    },
    [
      acquireUniversalStream,
      mode,
      isMuted,
      isTransmitting,
      ensureAudioPipeline,
      syncTrackToPeers,
      unpauseAllRemoteAudios,
      showDeviceToast,
      resumeAudioContext,
      applyAudioSinkId,
      refreshAudioDevices,
    ]
  );

  // Force Fix & Re-sync Audio (Tombol Darurat 1-Tap jika suara senyap saat ganti HP/Headset)
  const forceFixAudio = useCallback(async () => {
    setIsFixingAudio(true);
    try {
      console.log('[Audio Force Fix] Melakukan reset & pemulihan total audio engine...');
      await resumeAudioContext();
      await restartAudioStream();
      unpauseAllRemoteAudios();
      await applyAudioSinkId();
      playIntercomChirp('join');
      showDeviceToast('⚡ Audio berhasil dipulihkan & aktif!');
    } catch (e) {
      console.warn('[Audio Force Fix] Error:', e);
      showDeviceToast('⚠️ Gagal memulihkan otomatis, cek izin mikrofon browser');
    } finally {
      setIsFixingAudio(false);
    }
  }, [resumeAudioContext, restartAudioStream, unpauseAllRemoteAudios, applyAudioSinkId, showDeviceToast]);

  // Listener Otomatis Pergantian Perangkat Hardware (navigator.mediaDevices.ondevicechange)
  useEffect(() => {
    const handleDeviceChange = async () => {
      console.log('[Hardware Audio Event] Deteksi pasang/cabut perangkat audio (Bluetooth/Kabel)...');
      if (deviceChangeDebounceRef.current) {
        window.clearTimeout(deviceChangeDebounceRef.current);
      }
      deviceChangeDebounceRef.current = window.setTimeout(async () => {
        if (
          audioStatus === 'connected' ||
          audioStatus === 'connecting' ||
          audioStatus === 'muted' ||
          localStreamRef.current
        ) {
          await restartAudioStream();
        } else {
          await refreshAudioDevices();
        }
      }, 400);
    };

    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      navigator.mediaDevices.ondevicechange = handleDeviceChange;
    }

    refreshAudioDevices();

    return () => {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        navigator.mediaDevices.ondevicechange = null;
      }
      if (deviceChangeDebounceRef.current) {
        window.clearTimeout(deviceChangeDebounceRef.current);
      }
    };
  }, [audioStatus, restartAudioStream, refreshAudioDevices]);

  // Watchdog Timer Pemulihan Otomatis (Self-Healing Loop) tiap 2 detik
  useEffect(() => {
    const watchdogInterval = window.setInterval(() => {
      if (
        audioContextRef.current &&
        (audioContextRef.current.state === 'suspended' ||
          audioContextRef.current.state === ('interrupted' as AudioContextState))
      ) {
        audioContextRef.current.resume().catch(() => {});
      }

      (Object.values(audioElementsRef.current) as HTMLAudioElement[]).forEach((el) => {
        if (el && el.paused && el.srcObject) {
          el.play().catch(() => {});
        }
      });

      // Watchdog untuk elemen pemutar musik DJ lokal jika ter-pause tak terduga
      if (isMusicPlayingRef.current && musicAudioRef.current && musicAudioRef.current.paused) {
        console.log('[Audio Watchdog] Menghidupkan kembali pemutaran musik DJ yang sempat terhenti...');
        musicAudioRef.current.play().catch(() => {});
      }

      if (localStreamRef.current && (audioStatus === 'connected' || audioStatus === 'muted')) {
        const trk = localStreamRef.current.getAudioTracks()[0];
        if (trk && trk.readyState === 'ended' && !isSwitchingAudioRef.current) {
          console.warn('[Audio Watchdog] Track mikrofon terdeteksi mati, memulai pemulihan...');
          restartAudioStream();
        }
      }
    }, 2000);

    return () => clearInterval(watchdogInterval);
  }, [audioStatus, restartAudioStream]);

  // Sinkronisasi status jumlah peer audio yang benar-benar terhubung + Alarm Ringan Keluar/Masuk Jangkauan
  const updateConnectedPeersCount = useCallback(() => {
    let count = 0;
    (Object.values(peersRef.current) as RTCPeerConnection[]).forEach((pc) => {
      if (
        pc.iceConnectionState === 'connected' ||
        pc.iceConnectionState === 'completed' ||
        pc.connectionState === 'connected'
      ) {
        count += 1;
      }
    });

    setConnectedPeersCount(count);

    // Deteksi jika sebelumnya sudah pernah tersambung ke rider lain (rombongan), lalu tiba-tiba terputus / keluar jangkauan
    if (count > 0) {
      lastKnownOnlinePeersRef.current = count;

      // Jika sebelumnya sempat keluar jangkauan dan sekarang berhasil tersambung kembali
      if (wasOutOfRangeRef.current) {
        console.log('[Intercom Watchdog] Masuk kembali ke dalam jangkauan! Membunyikan nada sambut...');
        wasOutOfRangeRef.current = false;
        if (outOfRangeTimerRef.current) {
          window.clearTimeout(outOfRangeTimerRef.current);
          outOfRangeTimerRef.current = null;
        }
        playIntercomChirp('in-range');
        showDeviceToast('📶 Masuk jangkauan! Terhubung otomatis.');
      }
    } else if (count === 0 && lastKnownOnlinePeersRef.current > 0) {
      // Hanya picu alarm jika terputus selama > 2.5 detik (menghindari alarm palsu saat pergantian jalur ICE sejenak)
      if (!outOfRangeTimerRef.current && !wasOutOfRangeRef.current) {
        outOfRangeTimerRef.current = window.setTimeout(() => {
          outOfRangeTimerRef.current = null;
          // Periksa kembali apakah masih 0 peer
          let currentCheck = 0;
          (Object.values(peersRef.current) as RTCPeerConnection[]).forEach((pc) => {
            if (
              pc.iceConnectionState === 'connected' ||
              pc.iceConnectionState === 'completed' ||
              pc.connectionState === 'connected'
            ) {
              currentCheck += 1;
            }
          });

          if (currentCheck === 0) {
            const now = Date.now();
            if (now - lastAlarmPlayedAtRef.current > 12000) {
              console.warn('[Intercom Watchdog] Di luar jangkauan rombongan! Membunyikan alarm...');
              lastAlarmPlayedAtRef.current = now;
              wasOutOfRangeRef.current = true;
              playIntercomChirp('out-of-range');
              showDeviceToast('⚠️ Di luar jangkauan sinyal! Otomatis konek saat mendekat.');
            }
          }
        }, 2500);
      }
    }
  }, [showDeviceToast]);

  // Buat koneksi RTCPeerConnection baru dengan Jitter Smoothing Buffer & Dynamic Recovery
  const createPeerConnection = useCallback(
    (userId: string): RTCPeerConnection => {
      if (peersRef.current[userId] && peersRef.current[userId].signalingState !== 'closed') {
        return peersRef.current[userId];
      }

      console.log(`[WebRTC] Creating RTCPeerConnection for rider: ${userId}`);
      const pc = new RTCPeerConnection(iceServers);
      peersRef.current[userId] = pc;

      // Tambahkan broadcast audio track permanen
      const activeTrack = getActiveOutgoingTrack();
      const currentStream = mixedDestinationRef.current
        ? mixedDestinationRef.current.stream
        : localStreamRef.current || undefined;

      if (activeTrack && currentStream) {
        try {
          pc.addTrack(activeTrack, currentStream);
        } catch (e) {
          console.warn('[WebRTC] Add track error:', e);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('signal', {
            to: userId,
            signal: { candidate: event.candidate },
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE state (${userId}): ${pc.iceConnectionState}`);
        updateConnectedPeersCount();

        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          unpauseAllRemoteAudios();
        }

        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.warn(`[WebRTC] ICE ${pc.iceConnectionState} with ${userId}, scheduling ICE restart...`);
          setTimeout(() => {
            if (
              peersRef.current[userId] === pc &&
              (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected')
            ) {
              initiatePeerCall(userId, true);
            }
          }, 1200);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state (${userId}): ${pc.connectionState}`);
        updateConnectedPeersCount();
      };

      // Penerimaan Audio Remote dari Rider Lawan
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received audio track from ${userId}, track id: ${event.track.id}`);
        const remoteStream =
          event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);

        try {
          const receivers = pc.getReceivers();
          const r = receivers.find((rec) => rec.track && rec.track.id === event.track.id) || receivers[0];
          if (r) {
            if ('playoutDelayHint' in r) {
              (r as unknown as { playoutDelayHint: number }).playoutDelayHint = 0.20;
            }
            if ('jitterBufferTarget' in r) {
              (r as unknown as { jitterBufferTarget: number }).jitterBufferTarget = 200;
            }
          }
        } catch (e) {
          console.warn('[WebRTC] Receiver buffer tuning note:', e);
        }

        const ctx = getAudioContext();
        if (
          ctx.state === 'suspended' ||
          ctx.state === ('interrupted' as AudioContextState)
        ) {
          ctx.resume().catch(() => {});
        }

        if (!remoteMasterLimiterRef.current) {
          const lim = ctx.createDynamicsCompressor();
          lim.threshold.setValueAtTime(-1.5, ctx.currentTime);
          lim.knee.setValueAtTime(6, ctx.currentTime);
          lim.ratio.setValueAtTime(4.0, ctx.currentTime);
          lim.attack.setValueAtTime(0.003, ctx.currentTime);
          lim.release.setValueAtTime(0.25, ctx.currentTime);
          lim.connect(ctx.destination);
          remoteMasterLimiterRef.current = lim;
        }

        // Seluruh audio remote (termasuk DJ) menggunakan receiverVolume murni
        // Hal ini memisahkan volume suara teman dari volume musik dan mencegah suara DJ tercekik
        const initialGain = receiverVolume;

        if (!remoteGainNodesRef.current[userId]) {
          const rGain = ctx.createGain();
          rGain.gain.setValueAtTime(initialGain, ctx.currentTime);
          rGain.connect(remoteMasterLimiterRef.current);
          remoteGainNodesRef.current[userId] = rGain;
        } else {
          remoteGainNodesRef.current[userId].gain.setValueAtTime(initialGain, ctx.currentTime);
        }

        if (remoteSourceNodesRef.current[userId]) {
          try {
            remoteSourceNodesRef.current[userId].disconnect();
          } catch {}
        }
        try {
          const rSrc = ctx.createMediaStreamSource(remoteStream);
          rSrc.connect(remoteGainNodesRef.current[userId]);
          remoteSourceNodesRef.current[userId] = rSrc;
        } catch (e) {
          console.warn('[WebAudio] Remote source connection note:', e);
        }

        let audio = audioElementsRef.current[userId];
        if (!audio) {
          audio = document.createElement('audio');
          audio.id = `remote-audio-${userId}`;
          audio.autoplay = true;
          audio.muted = false;
          audio.setAttribute('playsinline', 'true');
          audio.setAttribute('webkit-playsinline', 'true');
          audio.style.position = 'fixed';
          audio.style.bottom = '0px';
          audio.style.right = '0px';
          audio.style.width = '1px';
          audio.style.height = '1px';
          audio.style.opacity = '0.01';
          audio.style.pointerEvents = 'none';
          document.body.appendChild(audio);
          audioElementsRef.current[userId] = audio;

          audio.onpause = () => {
            setTimeout(() => {
              if (audio && audio.paused && audio.srcObject) {
                audio.play().catch(() => {});
              }
            }, 100);
          };
        }

        event.track.onunmute = () => {
          if (audio && audio.paused && audio.srcObject) {
            audio.play().catch(() => {});
          }
          if (
            ctx.state === 'suspended' ||
            ctx.state === ('interrupted' as AudioContextState)
          ) {
            ctx.resume().catch(() => {});
          }
        };

        audio.srcObject = remoteStream;
        audio.muted = false;
        audio.volume = 0.001;

        if (selectedOutputId && 'setSinkId' in audio) {
          try {
            (audio as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedOutputId);
          } catch {}
        }

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((playErr) => {
            console.warn(`[WebRTC] Audio auto-play note for ${userId}:`, playErr);
          });
        }
      };

      return pc;
    },
    [getActiveOutgoingTrack, socket, receiverVolume, getAudioContext, selectedOutputId, updateConnectedPeersCount, unpauseAllRemoteAudios]
  );

  // Inisiasi Panggilan P2P / Offer ke target user dengan perlindungan Perfect Negotiation
  const initiatePeerCall = useCallback(
    async (targetUserId: string, restartIce: boolean = false) => {
      if (!socket || !targetUserId || targetUserId === socket.id) return;
      console.log(`[WebRTC] Initiating call to rider: ${targetUserId} (restartIce=${restartIce})`);

      let pc = peersRef.current[targetUserId];
      if (!pc) {
        pc = createPeerConnection(targetUserId);
      }

      try {
        makingOfferRef.current[targetUserId] = true;
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          iceRestart: restartIce,
        });
        offer.sdp = optimizeOpusSdp(offer.sdp || '');

        if (pc.signalingState !== 'stable') {
          console.warn(`[WebRTC] Skipping setLocalDescription, signalingState is ${pc.signalingState}`);
          return;
        }

        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: targetUserId, signal: offer });
      } catch (err) {
        console.error(`[WebRTC] Create offer to ${targetUserId} failed:`, err);
      } finally {
        makingOfferRef.current[targetUserId] = false;
      }
    },
    [socket, createPeerConnection]
  );

  // Optimasi Opus SDP untuk Transmisi Vokal & Musik High-Fidelity Bebas Fluktuasi
  const optimizeOpusSdp = (sdp: string): string => {
    if (!sdp) return sdp;
    return sdp.replace(/a=fmtp:(\d+) (.*)/g, (_match, pt, params) => {
      const cleanParams = params
        .replace(/;?usedtx=\d/g, '')
        .replace(/;?useinbandfec=\d/g, '')
        .replace(/;?maxaveragebitrate=\d+/g, '')
        .replace(/;?stereo=\d/g, '')
        .replace(/;?sprop-stereo=\d/g, '')
        .replace(/;?cbr=\d/g, '')
        .replace(/;?ptime=\d+/g, '')
        .replace(/;?maxptime=\d+/g, '')
        .replace(/;?sprop-maxcapturerate=\d+/g, '')
        .replace(/;?maxplaybackrate=\d+/g, '');
      return `a=fmtp:${pt} ${cleanParams};usedtx=0;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=96000;cbr=0;ptime=20;maxptime=40;sprop-maxcapturerate=48000;maxplaybackrate=48000`;
    });
  };

  // Re-sinkronisasi semua peer yang ada di room (Dipanggil manual atau via watchdog)
  const syncAllPeers = useCallback(() => {
    if (!socket || !socket.connected) return;
    console.log('[WebRTC] Syncing all known peers in room:', knownRoomUsersRef.current);
    knownRoomUsersRef.current.forEach((peerId) => {
      if (peerId && peerId !== socket.id) {
        const pc = peersRef.current[peerId];
        if (!pc || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.connectionState === 'failed') {
          initiatePeerCall(peerId, true);
        } else if (pc.iceConnectionState === 'new' || pc.signalingState === 'stable') {
          initiatePeerCall(peerId, false);
        }
      }
    });
  }, [socket, initiatePeerCall]);

  // Handle Socket.io WebRTC Signals & Room Events
  useEffect(() => {
    if (!socket) return;

    // Saat rider baru bergabung ke room
    const handleUserConnected = async (data: { userId: string; username: string }) => {
      if (!data.userId || data.userId === socket.id) return;
      console.log(`[WebRTC] Rider baru bergabung: ${data.username} (${data.userId})`);
      playIntercomChirp('join');

      if (!knownRoomUsersRef.current.includes(data.userId)) {
        knownRoomUsersRef.current.push(data.userId);
      }

      await initiatePeerCall(data.userId);
    };

    // Saat menerima daftar rider yang sudah ada di dalam room
    const handleRoomUsers = (data: { roomId: string; users: { userId: string; username: string }[] }) => {
      if (!data.users || !Array.isArray(data.users)) return;
      console.log(`[WebRTC] Daftar rider di room (${data.roomId}):`, data.users);

      const otherUserIds = data.users
        .map((u) => u.userId)
        .filter((id) => id && id !== socket.id);

      knownRoomUsersRef.current = otherUserIds;

      // Tunggu 600ms agar rider lama memiliki kesempatan membuat offer terlebih dahulu
      setTimeout(() => {
        otherUserIds.forEach((targetId) => {
          const pc = peersRef.current[targetId];
          if (!pc || (pc.iceConnectionState === 'new' && pc.signalingState === 'stable')) {
            console.log(`[WebRTC] Memulai inisiasi P2P fallback ke rider lama: ${targetId}`);
            initiatePeerCall(targetId);
          }
        });
      }, 700);
    };

    // Handle Pertukaran Sinyal WebRTC (Offer, Answer, ICE Candidate)
    const handleSignal = async (data: {
      from: string;
      signal: RTCSessionDescriptionInit & { candidate?: RTCIceCandidateInit };
    }) => {
      const { from, signal } = data;
      if (!from || from === socket.id) return;

      if (!knownRoomUsersRef.current.includes(from)) {
        knownRoomUsersRef.current.push(from);
      }

      let pc = peersRef.current[from];
      if (!pc) {
        pc = createPeerConnection(from);
      }

      try {
        if (signal.type === 'offer') {
          const isPolite = socket.id ? socket.id.localeCompare(from) > 0 : true;
          const offerCollision =
            pc.signalingState !== 'stable' ||
            makingOfferRef.current[from] ||
            (pc as unknown as { isMakingOffer?: boolean }).isMakingOffer;

          if (offerCollision) {
            console.log(`[WebRTC] Offer collision detected with ${from}. Is polite: ${isPolite}`);
            if (!isPolite) {
              console.log(`[WebRTC] Impolite peer ignoring offer from ${from}`);
              return;
            }
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit),
              pc.setRemoteDescription(new RTCSessionDescription(signal)),
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          }

          // Proses antrian ICE candidate yang tiba sebelum remote description
          if (queuedCandidatesRef.current[from]) {
            for (const cand of queuedCandidatesRef.current[from]) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (iceErr) {
                console.warn('[WebRTC] Queued ICE add error:', iceErr);
              }
            }
            delete queuedCandidatesRef.current[from];
          }

          const answer = await pc.createAnswer();
          answer.sdp = optimizeOpusSdp(answer.sdp || '');
          await pc.setLocalDescription(answer);
          socket.emit('signal', { to: from, signal: answer });
        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          }

          if (queuedCandidatesRef.current[from]) {
            for (const cand of queuedCandidatesRef.current[from]) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (iceErr) {
                console.warn('[WebRTC] Queued ICE add error on answer:', iceErr);
              }
            }
            delete queuedCandidatesRef.current[from];
          }
        } else if (signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            if (!queuedCandidatesRef.current[from]) {
              queuedCandidatesRef.current[from] = [];
            }
            queuedCandidatesRef.current[from].push(signal.candidate);
          }
        }
      } catch (err) {
        console.error(`[WebRTC] Signaling error from ${from}:`, err);
      }
    };

    const handleUserDisconnected = (data: { userId: string } | string) => {
      const targetUserId = typeof data === 'string' ? data : data?.userId;
      if (!targetUserId) return;
      console.log(`[WebRTC] Rider disconnected: ${targetUserId}`);
      playIntercomChirp('leave');

      knownRoomUsersRef.current = knownRoomUsersRef.current.filter((id) => id !== targetUserId);

      // Jangan langsung mematikan status DJ lokal jika perangkat ini adalah DJ yang sedang memutar musik,
      // atau jika DJ lain hanya mengalami fluktuasi sinyal sementara (server mengelola grace period 25s)
      const isMe = Boolean(
        (activeDjState?.activeDjId && socket?.id && activeDjState.activeDjId === socket.id) ||
        (activeDjState?.activeDjName && myCallsign && activeDjState.activeDjName.trim().toLowerCase() === myCallsign.trim().toLowerCase())
      );
      if (activeDjState && activeDjState.activeDjId === targetUserId && !isMe && !isMusicPlayingRef.current) {
        console.log('[DJ] Remote DJ connection dropped. Waiting for server grace period...');
      }

      if (peersRef.current[targetUserId]) {
        try {
          peersRef.current[targetUserId].close();
        } catch {}
        delete peersRef.current[targetUserId];
      }
      if (remoteSourceNodesRef.current[targetUserId]) {
        try {
          remoteSourceNodesRef.current[targetUserId].disconnect();
        } catch {}
        delete remoteSourceNodesRef.current[targetUserId];
      }
      if (remoteGainNodesRef.current[targetUserId]) {
        try {
          remoteGainNodesRef.current[targetUserId].disconnect();
        } catch {}
        delete remoteGainNodesRef.current[targetUserId];
      }
      if (audioElementsRef.current[targetUserId]) {
        audioElementsRef.current[targetUserId].srcObject = null;
        audioElementsRef.current[targetUserId].remove();
        delete audioElementsRef.current[targetUserId];
      }
      updateConnectedPeersCount();
    };

    const handleDjClaimRejected = (data: { message?: string }) => {
      showDeviceToast(data.message || '🔒 DJ sedang dikontrol oleh rider lain');
      setIsDjMode(false);
    };

    const handleConnect = () => {
      console.log('[WebRTC Socket] Connected/Reconnected, checking DJ & audio sync...');
      if (isMusicPlayingRef.current) {
        console.log('[DJ] Socket reconnected while music is playing. Reclaiming DJ status on server...');
        socket.emit('claim-dj');
        socket.emit('dj-music-state', {
          isPlaying: true,
          trackTitle: musicTrackTitleRef.current,
        });
      }
      syncTrackToPeers();
    };

    socket.on('connect', handleConnect);
    socket.on('user-connected', handleUserConnected);
    socket.on('room-users', handleRoomUsers);
    socket.on('signal', handleSignal);
    socket.on('user-disconnected', handleUserDisconnected);
    socket.on('dj-claim-rejected', handleDjClaimRejected);

    // Watchdog Re-sync P2P audio: jika ada rider di room tapi belum ada peer connection
    const p2pWatchdogInterval = setInterval(() => {
      if (knownRoomUsersRef.current.length > 0) {
        const unconnectedUsers = knownRoomUsersRef.current.filter((id) => {
          const pc = peersRef.current[id];
          return !pc || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected';
        });

        if (unconnectedUsers.length > 0) {
          console.log('[WebRTC Watchdog] Ditemukan rider yang belum terhubung, mencoba re-sync:', unconnectedUsers);
          unconnectedUsers.forEach((targetId) => {
            initiatePeerCall(targetId, true);
          });
        }
      }
    }, 4500);

    return () => {
      clearInterval(p2pWatchdogInterval);
      socket.off('connect', handleConnect);
      socket.off('user-connected', handleUserConnected);
      socket.off('room-users', handleRoomUsers);
      socket.off('signal', handleSignal);
      socket.off('user-disconnected', handleUserDisconnected);
      socket.off('dj-claim-rejected', handleDjClaimRejected);
    };
  }, [socket, createPeerConnection, initiatePeerCall, updateConnectedPeersCount]);

  // Inisialisasi Mikrofon Pengguna
  const initMicrophone = useCallback(async () => {
    try {
      setAudioStatus('connecting');
      setErrorMessage(null);

      await resumeAudioContext();
      const stream = await acquireUniversalStream();
      localStreamRef.current = stream;
      setLocalStream(stream);

      const track = stream.getAudioTracks()[0];
      if (track) {
        if (mode === 'ALWAYS_ON') {
          track.enabled = !isMuted;
        } else {
          track.enabled = false;
        }
      }

      ensureAudioPipeline(stream);
      syncTrackToPeers();
      setAudioStatus(isMuted ? 'muted' : 'connected');
      playIntercomChirp('join');
      await refreshAudioDevices();
      return stream;
    } catch (err: unknown) {
      console.error('Failed to get user media:', err);
      const isPermissionDenied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      const errText = isPermissionDenied
        ? 'Izin mikrofon ditolak. Klik ikon gembok di URL browser untuk mengizinkan.'
        : 'Mikrofon tidak terdeteksi atau sedang dipakai aplikasi lain.';

      setErrorMessage(errText);
      setAudioStatus('failed');
      return null;
    }
  }, [resumeAudioContext, acquireUniversalStream, mode, isMuted, ensureAudioPipeline, syncTrackToPeers, refreshAudioDevices]);

  // Kontrol PTT (Push-To-Talk)
  const startPtt = useCallback(() => {
    if (mode !== 'PTT' || !localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = true;
      updateMicGain(true);
      setIsTransmitting(true);
      playIntercomChirp('ptt-on');
      socket?.emit('voice-state', { isSpeaking: true });
    }
  }, [mode, localStream, socket, updateMicGain]);

  const endPtt = useCallback(() => {
    if (mode !== 'PTT' || !localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = false;
      updateMicGain(false);
      setIsTransmitting(false);
      playIntercomChirp('ptt-off');
      socket?.emit('voice-state', { isSpeaking: false });
    }
  }, [mode, localStream, socket, updateMicGain]);

  // Sinkronisasi mode PTT / ALWAYS_ON
  useEffect(() => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;

    if (mode === 'ALWAYS_ON') {
      const active = !isMuted;
      track.enabled = active;
      updateMicGain(active);
      setAudioStatus(isMuted ? 'muted' : 'connected');
    } else {
      const active = isTransmitting && !isMuted;
      track.enabled = active;
      updateMicGain(active);
      setAudioStatus(active ? 'connected' : isMuted ? 'muted' : 'connected');
    }
  }, [localStream, mode, isMuted, isTransmitting, updateMicGain]);

  // Sinkronisasi gain mixed music saat isDjMode, isMusicPlaying, atau musicVolume berubah
  // Auto-ducking dinonaktifkan sesuai permintaan: volume siaran musik murni stabil mengikuti slider volume
  useEffect(() => {
    if (musicMixedGainNodeRef.current && audioContextRef.current) {
      const baseBroadcastVolume = musicVolume * 0.70;
      const targetGain = isDjMode && isMusicPlaying ? Math.max(0, Math.min(1, baseBroadcastVolume)) : 0.0;
      const ctx = audioContextRef.current;
      musicMixedGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
      musicMixedGainNodeRef.current.gain.linearRampToValueAtTime(
        targetGain,
        ctx.currentTime + 0.05
      );
    }
  }, [isDjMode, isMusicPlaying, musicVolume]);

  // Handle Manual Input Device Selection
  const handleSelectInputDevice = useCallback(
    async (deviceId: string) => {
      setSelectedInputId(deviceId);
      await restartAudioStream(deviceId);
    },
    [restartAudioStream]
  );

  // Handle Manual Output Device Selection
  const handleSelectOutputDevice = useCallback(
    async (deviceId: string) => {
      setSelectedOutputId(deviceId);
      await applyAudioSinkId(deviceId);
      showDeviceToast(
        deviceId ? '🔊 Output dialihkan ke perangkat yang dipilih' : '🔊 Output mengikuti rute default'
      );
    },
    [applyAudioSinkId, showDeviceToast]
  );

  // Sort playlist helper
  const applySort = useCallback(
    (tracks: MusicTrack[], sortType: 'NAME' | 'SHUFFLE' | 'DATE') => {
      const sorted = [...tracks];
      if (sortType === 'NAME') {
        sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
      } else if (sortType === 'SHUFFLE') {
        for (let i = sorted.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
        }
      } else if (sortType === 'DATE') {
        sorted.sort((a, b) => b.lastModified - a.lastModified);
      }
      return sorted;
    },
    []
  );

  const setPlaylistSortMode = useCallback(
    (newMode: 'NAME' | 'SHUFFLE' | 'DATE') => {
      setSortMode(newMode);
      setPlaylist((prev) => applySort(prev, newMode));
    },
    [applySort]
  );

  // Claim DJ Seat (First-Come First-Served lock via server with Stale Detection)
  const claimDjSeat = useCallback(async (): Promise<boolean> => {
    // Periksa apakah rider yang tercatat sebagai DJ masih ada di dalam room
    const isPreviousDjPresent = activeDjState?.activeDjId
      ? knownRoomUsersRef.current.includes(activeDjState.activeDjId)
      : false;

    // Jika terkunci oleh rider lain TAPI rider tersebut masih ada di room
    if (isDjLockedByOther && isPreviousDjPresent) {
      showDeviceToast(`🔒 DJ sedang dikontrol oleh ${activeDjState?.activeDjName || 'rider lain'}`);
      return false;
    }

    if (socket?.connected) {
      if (isDjLockedByOther && !isPreviousDjPresent) {
        showDeviceToast('⚡ Mengambil alih kursi DJ dari rider yang telah keluar...');
      }
      socket.emit('claim-dj', (res?: { success: boolean; message?: string }) => {
        if (res && !res.success) {
          showDeviceToast(res.message || '⚠️ Gagal mengambil alih kursi DJ');
          setIsDjMode(false);
        } else {
          setIsDjMode(true);
          showDeviceToast('👑 Anda sekarang menjadi DJ Kapten');
        }
      });
      setIsDjMode(true);
      return true;
    }
    return false;
  }, [isDjLockedByOther, activeDjState?.activeDjId, activeDjState?.activeDjName, socket, showDeviceToast]);

  // Release DJ Seat so another rider can claim
  const releaseDjSeat = useCallback(() => {
    if (socket?.connected) {
      socket.emit('release-dj');
    }
    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current.currentTime = 0;
    }
    setIsMusicPlaying(false);
    setMusicTrackTitle('');
    setCurrentTrackIndex(-1);
    setIsDjMode(false);
    showDeviceToast('Status DJ Kapten dilepaskan');
  }, [socket, showDeviceToast]);

  // Force Reset / Ambil Alih DJ Lock jika ada kendala user keluar
  const forceResetDjLock = useCallback(() => {
    if (socket?.connected) {
      socket.emit('force-release-dj', (res?: { success: boolean }) => {
        if (res?.success) {
          showDeviceToast('🔄 Kursi DJ Kapten berhasil direset & siap diklaim');
        }
      });
    }
    if (setActiveDjState) {
      setActiveDjState({
        activeDjId: null,
        activeDjName: null,
        isDjActive: false,
        isPlaying: false,
        trackTitle: '',
      });
    }
    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current.currentTime = 0;
    }
    setIsMusicPlaying(false);
    setIsDjMode(false);
    showDeviceToast('🔄 Kursi DJ Kapten direset');
  }, [socket, setActiveDjState, showDeviceToast]);

  // Putar lagu pada indeks tertentu
  const playTrackAtIndex = useCallback(
    async (index: number) => {
      if (index < 0 || index >= playlist.length) return;

      if (isDjLockedByOther) {
        showDeviceToast(`🔒 DJ sedang dikontrol oleh ${activeDjState?.activeDjName || 'rider lain'}`);
        return;
      }

      // Automatically ensure DJ seat is claimed before broadcasting audio
      if (!isDjOwner && socket?.connected) {
        socket.emit('claim-dj');
      }

      ensureAudioPipeline(localStreamRef.current || undefined);
      await resumeAudioContext();

      const track = playlist[index];
      setCurrentTrackIndex(index);
      setMusicTrackTitle(track.title);

      if (musicAudioRef.current) {
        try {
          musicAudioRef.current.volume = musicVolume;
        } catch {}
        if (track.file) {
          musicAudioRef.current.removeAttribute('crossorigin');
          musicAudioRef.current.src = URL.createObjectURL(track.file);
        } else if (track.url) {
          try {
            const res = await fetch(track.url);
            const blob = await res.blob();
            musicAudioRef.current.removeAttribute('crossorigin');
            musicAudioRef.current.src = URL.createObjectURL(blob);
          } catch (e) {
            console.warn('[DJ] Blob fetch note:', e);
            musicAudioRef.current.removeAttribute('crossorigin');
            musicAudioRef.current.src = track.url;
          }
        }

        try {
          isMusicPlayingRef.current = true;
          await musicAudioRef.current.play();
          setIsMusicPlaying(true);
          setIsDjMode(true);
          unpauseAllRemoteAudios();
          socket?.emit('dj-music-state', {
            isPlaying: true,
            trackTitle: track.title,
          });
        } catch (err) {
          console.warn('Track play failed:', err);
        }
      }
    },
    [
      playlist,
      isDjLockedByOther,
      isDjOwner,
      activeDjState?.activeDjName,
      showDeviceToast,
      ensureAudioPipeline,
      resumeAudioContext,
      unpauseAllRemoteAudios,
      socket,
    ]
  );

  // Muat Lagu Demo Touring Bebas Masalah (Built-in In-Memory WAV Generator)
  const loadDemoTouringTracks = useCallback(async () => {
    if (isDjLockedByOther) {
      showDeviceToast(`🔒 DJ sedang dikontrol oleh ${activeDjState?.activeDjName || 'rider lain'}`);
      return;
    }

    if (!isDjOwner && socket?.connected) {
      socket.emit('claim-dj');
    }

    const demoTracks = getBuiltInDemoTracks();
    setOriginalPlaylist(demoTracks);
    setPlaylist(demoTracks);
    setCurrentTrackIndex(0);
    setMusicTrackTitle(demoTracks[0].title);
    ensureAudioPipeline(localStreamRef.current || undefined);
    await resumeAudioContext();
    setIsDjMode(true);

    if (musicAudioRef.current && demoTracks[0].file) {
      try {
        musicAudioRef.current.volume = musicVolume;
      } catch {}
      musicAudioRef.current.removeAttribute('crossorigin');
      musicAudioRef.current.src = URL.createObjectURL(demoTracks[0].file);
      try {
        await musicAudioRef.current.play();
        setIsMusicPlaying(true);
        unpauseAllRemoteAudios();
        socket?.emit('dj-music-state', {
          isPlaying: true,
          trackTitle: demoTracks[0].title,
        });
      } catch (e) {
        console.warn('Demo play error:', e);
      }
    }
  }, [
    isDjLockedByOther,
    isDjOwner,
    activeDjState?.activeDjName,
    showDeviceToast,
    ensureAudioPipeline,
    resumeAudioContext,
    unpauseAllRemoteAudios,
    socket,
  ]);

  // Putar lagu berikutnya
  const playNextTrack = useCallback(async () => {
    if (playlist.length === 0) return;
    const nextIdx = (currentTrackIndex + 1) % playlist.length;
    await playTrackAtIndex(nextIdx);
  }, [currentTrackIndex, playlist.length, playTrackAtIndex]);

  playNextTrackRef.current = playNextTrack;

  // Putar lagu sebelumnya
  const playPrevTrack = useCallback(async () => {
    if (playlist.length === 0) return;
    const prevIdx = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    await playTrackAtIndex(prevIdx);
  }, [currentTrackIndex, playlist.length, playTrackAtIndex]);

  // Toggle Play / Pause musik
  const togglePlayMusic = useCallback(async () => {
    if (isDjLockedByOther) {
      showDeviceToast(`🔒 DJ sedang dikontrol oleh ${activeDjState?.activeDjName || 'rider lain'}`);
      return;
    }

    ensureAudioPipeline(localStreamRef.current || undefined);
    await resumeAudioContext();

    if (!musicAudioRef.current) return;

    if (isMusicPlaying) {
      isMusicPlayingRef.current = false;
      musicAudioRef.current.pause();
      setIsMusicPlaying(false);
      socket?.emit('dj-music-state', {
        isPlaying: false,
        trackTitle: musicTrackTitle,
      });
    } else {
      if (!isDjOwner && socket?.connected) {
        socket.emit('claim-dj');
      }
      if (currentTrackIndex === -1 && playlist.length > 0) {
        await playTrackAtIndex(0);
      } else {
        try {
          if (musicAudioRef.current) {
            try {
              musicAudioRef.current.volume = musicVolume;
            } catch {}
          }
          isMusicPlayingRef.current = true;
          await musicAudioRef.current.play();
          setIsMusicPlaying(true);
          setIsDjMode(true);
          unpauseAllRemoteAudios();
          socket?.emit('dj-music-state', {
            isPlaying: true,
            trackTitle: musicTrackTitle,
          });
        } catch (err) {
          console.warn('Resume play failed:', err);
        }
      }
    }
  }, [
    isDjLockedByOther,
    isDjOwner,
    activeDjState?.activeDjName,
    showDeviceToast,
    ensureAudioPipeline,
    resumeAudioContext,
    isMusicPlaying,
    socket,
    musicTrackTitle,
    currentTrackIndex,
    playlist.length,
    playTrackAtIndex,
    unpauseAllRemoteAudios,
  ]);

  // Hentikan musik sepenuhnya
  const stopMusic = useCallback(() => {
    isMusicPlayingRef.current = false;
    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current.currentTime = 0;
    }
    setIsMusicPlaying(false);
    setMusicTrackTitle('');
    setCurrentTrackIndex(-1);
    socket?.emit('dj-music-state', {
      isPlaying: false,
      trackTitle: '',
    });
  }, [socket]);

  // Load User Music Files
  const loadMusicFiles = useCallback(
    async (files: FileList | File[]) => {
      if (isDjLockedByOther) {
        showDeviceToast(`🔒 DJ sedang dikontrol oleh ${activeDjState?.activeDjName || 'rider lain'}`);
        return;
      }

      const audioFiles = Array.from(files).filter(
        (f) =>
          f.type.startsWith('audio/') ||
          /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f.name)
      );

      if (audioFiles.length === 0) return;

      if (!isDjOwner && socket?.connected) {
        socket.emit('claim-dj');
      }

      const tracks: MusicTrack[] = audioFiles.map((file) => {
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
        return {
          title: cleanTitle,
          name: file.name,
          file,
          lastModified: file.lastModified,
        };
      });

      const sorted = applySort(tracks, sortMode);
      setOriginalPlaylist(tracks);
      setPlaylist(sorted);
      setCurrentTrackIndex(0);
      setMusicTrackTitle(sorted[0].title);

      ensureAudioPipeline(localStreamRef.current || undefined);
      await resumeAudioContext();
      setIsDjMode(true);

      if (musicAudioRef.current) {
        try {
          musicAudioRef.current.volume = musicVolume;
        } catch {}
        musicAudioRef.current.removeAttribute('crossorigin');
        musicAudioRef.current.src = URL.createObjectURL(sorted[0].file!);
        try {
          await musicAudioRef.current.play();
          setIsMusicPlaying(true);
          unpauseAllRemoteAudios();
          socket?.emit('dj-music-state', {
            isPlaying: true,
            trackTitle: sorted[0].title,
          });
        } catch (err) {
          console.warn('Auto play failed:', err);
        }
      }
    },
    [
      isDjLockedByOther,
      isDjOwner,
      activeDjState?.activeDjName,
      showDeviceToast,
      applySort,
      sortMode,
      ensureAudioPipeline,
      resumeAudioContext,
      unpauseAllRemoteAudios,
      socket,
    ]
  );

  // Toggle DJ Mode (Exclusive 1-Rider Lock)
  const toggleDjMode = useCallback(
    (enable?: boolean) => {
      const shouldEnable = enable !== undefined ? enable : !isDjMode;
      if (shouldEnable) {
        if (isDjLockedByOther) {
          showDeviceToast(`🔒 DJ sedang dikontrol oleh ${activeDjState?.activeDjName || 'rider lain'}`);
          return;
        }
        claimDjSeat();
      } else {
        releaseDjSeat();
      }
    },
    [isDjMode, isDjLockedByOther, activeDjState?.activeDjName, claimDjSeat, releaseDjSeat, showDeviceToast]
  );

  // Ubah volume musik (berlaku untuk Kapten lokal, siaran rombongan, dan penerimaan di helm setiap rider)
  const handleSetMusicVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      setMusicVolume(clamped);

      try {
        localStorage.setItem('gibah_music_volume', clamped.toString());
      } catch {}

      // Update elemen audio HTML jika ada
      if (musicAudioRef.current) {
        try {
          musicAudioRef.current.volume = clamped;
        } catch {}
      }

      if (audioContextRef.current) {
        const ctx = audioContextRef.current;

        // 1. Jika DJ lokal, sesuaikan speaker/headset DJ
        if (musicGainNodeRef.current) {
          musicGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
          musicGainNodeRef.current.gain.linearRampToValueAtTime(
            clamped,
            ctx.currentTime + 0.05
          );
        }

        // 2. Jika DJ sedang siaran musik, sesuaikan juga siaran ke seluruh rombongan secara proporsional & stabil
        if (musicMixedGainNodeRef.current && isDjMode && isMusicPlaying) {
          const targetBroadcastGain = Math.max(0, Math.min(1, clamped * 0.70));
          musicMixedGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
          musicMixedGainNodeRef.current.gain.linearRampToValueAtTime(
            targetBroadcastGain,
            ctx.currentTime + 0.05
          );
        }
      }
    },
    [isDjMode, isMusicPlaying]
  );

  // Update volume remote interkom (WebAudio Gain Node per rider: suara teman independen dari musik)
  useEffect(() => {
    if (audioContextRef.current) {
      const ctx = audioContextRef.current;
      (Object.entries(remoteGainNodesRef.current) as [string, GainNode][]).forEach(([, gainNode]) => {
        if (gainNode) {
          try {
            gainNode.gain.cancelScheduledValues(ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(receiverVolume, ctx.currentTime + 0.05);
          } catch {}
        }
      });
    }
  }, [receiverVolume]);

  // Update Mic Preamp Boost secara real-time (Rentang 50% - 150%)
  useEffect(() => {
    if (micPreampGainNodeRef.current && audioContextRef.current) {
      const ctx = audioContextRef.current;
      const effectiveGain = Math.max(0.5, Math.min(1.5, micBoost));
      micPreampGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
      micPreampGainNodeRef.current.gain.linearRampToValueAtTime(effectiveGain, ctx.currentTime + 0.05);
    }
  }, [micBoost]);

  // Sinkronkan volume musik lokal Kapten saat state berubah secara halus
  useEffect(() => {
    if (!musicGainNodeRef.current || !audioContextRef.current) return;
    const ctx = audioContextRef.current;
    musicGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
    musicGainNodeRef.current.gain.linearRampToValueAtTime(
      musicVolume,
      ctx.currentTime + 0.05
    );
    if (musicAudioRef.current) {
      try {
        musicAudioRef.current.volume = musicVolume;
      } catch {}
    }
  }, [musicVolume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
      }
      if (keepAliveNodeRef.current) {
        try {
          keepAliveNodeRef.current.osc.stop();
          keepAliveNodeRef.current.osc.disconnect();
        } catch {}
        keepAliveNodeRef.current = null;
      }
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current.src = '';
      }
      (Object.values(peersRef.current) as RTCPeerConnection[]).forEach((pc) => pc.close());
      (Object.values(remoteSourceNodesRef.current) as MediaStreamAudioSourceNode[]).forEach((node) => {
        if (node) {
          try {
            node.disconnect();
          } catch {}
        }
      });
      remoteSourceNodesRef.current = {};
      (Object.values(remoteGainNodesRef.current) as GainNode[]).forEach((node) => {
        if (node) {
          try {
            node.disconnect();
          } catch {}
        }
      });
      remoteGainNodesRef.current = {};
      if (remoteMasterLimiterRef.current) {
        try {
          remoteMasterLimiterRef.current.disconnect();
        } catch {}
        remoteMasterLimiterRef.current = null;
      }
      (Object.values(audioElementsRef.current) as HTMLAudioElement[]).forEach((audio) => {
        audio.srcObject = null;
        audio.remove();
      });
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    audioStatus,
    localStream,
    isTransmitting,
    isMySpeaking,
    errorMessage,
    initMicrophone,
    restartAudioStream,
    startPtt,
    endPtt,
    resumeAudioContext,

    // Audio Output Mode & Device Management
    audioOutputMode,
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    activeDeviceLabel,
    selectInputDevice: handleSelectInputDevice,
    selectOutputDevice: handleSelectOutputDevice,
    forceFixAudio,
    isFixingAudio,
    connectedPeersCount,
    syncAllPeers,
    toggleAudioOutput: () => {},
    updateAudioOutput: async () => {},

    // Audio Device Toast
    deviceToastMessage,
    dismissDeviceToast: () => setDeviceToastMessage(null),

    // Mic Boost & Sensitivity
    micBoost,
    setMicBoost,

    // DJ Kapten features & Playlist (Single-DJ Lock Protected)
    isDjMode,
    isDjOwner,
    isDjLockedByOther,
    claimDjSeat,
    releaseDjSeat,
    forceResetDjLock,
    resetDjLock: forceResetDjLock,
    setIsDjMode,
    toggleDjMode,
    musicTrackTitle,
    isMusicPlaying,
    musicVolume,
    setMusicVolume: handleSetMusicVolume,
    receiverVolume,
    setReceiverVolume,
    isDucked,
    playlist,
    currentTrackIndex,
    sortMode,
    setPlaylistSortMode,
    loadMusicFiles,
    loadDemoTouringTracks,
    playTrackAtIndex,
    playNextTrack,
    playPrevTrack,
    togglePlayMusic,
    stopMusic,
  };
}
