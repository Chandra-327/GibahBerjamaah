import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { IntercomMode, AudioConnectionStatus, MusicTrack, AudioOutputMode } from '../types';
import { playIntercomChirp } from '../utils/audioKeepAlive';

interface UseIntercomAudioOptions {
  socket: Socket | null;
  roomId: string;
  myCallsign: string;
  mode: IntercomMode;
  isMuted: boolean;
  anyRiderSpeaking?: boolean;
}

export function useIntercomAudio({
  socket,
  roomId,
  myCallsign,
  mode,
  isMuted,
  anyRiderSpeaking = false,
}: UseIntercomAudioOptions) {
  const [audioStatus, setAudioStatus] = useState<AudioConnectionStatus>('disconnected');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isMySpeaking, setIsMySpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio Output Routing (Speakerphone vs Headset)
  const [audioOutputMode, setAudioOutputMode] = useState<AudioOutputMode>('headset');
  const activeSinkIdRef = useRef<string>('');

  // Audio Device Change & Disconnect Toast with Auto-Dismiss
  const [deviceToastMessage, setDeviceToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const previousOutputsRef = useRef<number | null>(null);

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
  const [musicVolume, setMusicVolume] = useState<number>(0.8); // 0.0 - 1.0 (Kapten)
  const [receiverVolume, setReceiverVolume] = useState<number>(1.0); // 0.0 - 1.0 (Remote intercom)
  const [isDucked, setIsDucked] = useState(false);

  // Playlist State
  const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
  const [originalPlaylist, setOriginalPlaylist] = useState<MusicTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [sortMode, setSortMode] = useState<'NAME' | 'SHUFFLE' | 'DATE'>('NAME');

  // References
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const isSpeakingStateRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isDeviceChangingRef = useRef(false);

  // DJ Nodes
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const musicGainNodeRef = useRef<GainNode | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const mixedDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Auto-next track ref
  const playNextTrackRef = useRef<(() => Promise<void>) | null>(null);

  // Queued ICE candidates to prevent InvalidStateError before setRemoteDescription
  const queuedCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});

  // ICE Servers (Google Public STUN with multiple fallbacks)
  const iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
  };

  // Adaptive Multi-Tier Audio Constraints (Universal untuk Semua HP Xiaomi, Samsung, Oppo, STB, & Ragam Headset/Interkom Helm)
  const acquireUniversalStream = useCallback(async (): Promise<MediaStream> => {
    // Cari apakah ada mikrofon Bluetooth/headset yang terdeteksi
    let bluetoothDeviceId: string | undefined;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const bt = devices.find(
          (d) =>
            d.kind === 'audioinput' &&
            (d.label.toLowerCase().includes('bluetooth') ||
              d.label.toLowerCase().includes('headset') ||
              d.label.toLowerCase().includes('wireless') ||
              d.label.toLowerCase().includes('earpiece'))
        );
        if (bt && bt.deviceId) {
          bluetoothDeviceId = bt.deviceId;
          console.log('[Audio Device] Mengutamakan input Bluetooth headset:', bt.label);
        }
      }
    } catch {}

    // Tier 1: Preferensi interkom lengkap (echo cancellation, noise suppression, auto gain)
    try {
      const s1 = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: bluetoothDeviceId ? { ideal: bluetoothDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      console.log('[Audio Device] Berhasil memperoleh stream Tier-1 (Full AEC/NS/AGC)');
      return s1;
    } catch (err1: unknown) {
      console.warn('[Audio Device] Tier-1 ditolak oleh hardware/driver (mungkin Bluetooth SCO mono):', err1);
    }

    // Tier 2: Relaksasi constraints (hanya echo cancellation dasar)
    try {
      const s2 = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: bluetoothDeviceId ? { ideal: bluetoothDeviceId } : undefined,
          echoCancellation: true,
        },
        video: false,
      });
      console.log('[Audio Device] Berhasil memperoleh stream Tier-2 (Echo Cancellation saja)');
      return s2;
    } catch (err2: unknown) {
      console.warn('[Audio Device] Tier-2 ditolak:', err2);
    }

    // Tier 3: Universal Fail-Safe (100% Kompatibel dengan semua HP Android/Xiaomi, iOS, STB, & semua headset Bluetooth helm)
    try {
      const s3 = await navigator.mediaDevices.getUserMedia({
        audio: bluetoothDeviceId ? { deviceId: { ideal: bluetoothDeviceId } } : true,
        video: false,
      });
      console.log('[Audio Device] Berhasil memperoleh stream Tier-3 (Universal Raw Audio)');
      return s3;
    } catch (err3: unknown) {
      console.error('[Audio Device] Semua tier getUserMedia gagal:', err3);
      throw err3;
    }
  }, []);

  // Helper: Resume AudioContext (Handling background / phone call interruptions)
  const resumeAudioContext = useCallback(async () => {
    if (
      audioContextRef.current &&
      (audioContextRef.current.state === 'suspended' ||
        (audioContextRef.current.state as string) === 'interrupted')
    ) {
      try {
        await audioContextRef.current.resume();
        console.log('[Audio Focus] AudioContext resumed, state:', audioContextRef.current.state);
      } catch (err) {
        console.warn('[Audio Focus] AudioContext resume failed:', err);
      }
    }
  }, []);

  // Resilient Audio Engine Flags & Timers
  const isSwitchingAudioRef = useRef(false);
  const lastAudioSwitchTimeRef = useRef(0);
  const audioReloadDebounceTimerRef = useRef<number | null>(null);

  // Sound cue penanda audio ke helm bahwa mic telah pulih (Beep 800Hz 0.15s)
  const playRecoveryBeep = useCallback(() => {
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx =
        audioContextRef.current && audioContextRef.current.state !== 'closed'
          ? audioContextRef.current
          : new AudioCtxClass();
      if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
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
  }, []);

  // Helper: Memastikan pipeline WebAudio (Mic + VAD + DJ Destination) selalu terhubung
  const ensureAudioPipeline = useCallback(
    (stream: MediaStream) => {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioContextClass();
          audioContextRef.current.onstatechange = () => {
            console.log(`[Audio Focus] audioCtx state: ${audioContextRef.current?.state}`);
            if (
              (audioContextRef.current?.state === 'suspended' ||
                (audioContextRef.current?.state as string) === 'interrupted') &&
              document.visibilityState === 'visible'
            ) {
              audioContextRef.current?.resume().catch(console.warn);
            }
          };
        }
        const ctx = audioContextRef.current;

        if (!mixedDestinationRef.current) {
          mixedDestinationRef.current = ctx.createMediaStreamDestination();
        }

        if (!micGainNodeRef.current) {
          micGainNodeRef.current = ctx.createGain();
          micGainNodeRef.current.connect(mixedDestinationRef.current);
        }

        if (micSourceNodeRef.current) {
          try {
            micSourceNodeRef.current.disconnect();
          } catch {}
        }

        const micSource = ctx.createMediaStreamSource(stream);
        micSourceNodeRef.current = micSource;
        micSource.connect(micGainNodeRef.current);

        if (!analyserRef.current) {
          const analyserNode = ctx.createAnalyser();
          analyserNode.fftSize = 256;
          analyserNode.smoothingTimeConstant = 0.4;
          analyserRef.current = analyserNode;
        }
        micSource.connect(analyserRef.current);

        // Sambungkan DJ Musik jika ada
        if (musicGainNodeRef.current) {
          try {
            musicGainNodeRef.current.disconnect();
          } catch {}
          musicGainNodeRef.current.connect(ctx.destination);
          if (mixedDestinationRef.current) {
            musicGainNodeRef.current.connect(mixedDestinationRef.current);
          }
        }

        // Jalankan VAD meter interval
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
      } catch (err) {
        console.warn('[Audio Pipeline] Error setup pipeline:', err);
      }
    },
    [socket]
  );

  // Debounced Auto-Reload Audio Stream (Jeda 1500 ms agar driver/HAL kernel selesai berpindah)
  const triggerDebouncedAudioReload = useCallback((msg = 'Jalur audio disesuaikan') => {
    if (msg) showDeviceToast(msg);
    if (audioReloadDebounceTimerRef.current) {
      window.clearTimeout(audioReloadDebounceTimerRef.current);
    }
    audioReloadDebounceTimerRef.current = window.setTimeout(() => {
      restartAudioStream();
    }, 1500);
  }, [showDeviceToast]);

  const resumeRemoteAudio = useCallback(async () => {
    await resumeAudioContext();
    for (const audio of Object.values(audioElementsRef.current) as HTMLAudioElement[]) {
      if (!audio?.srcObject) continue;
      audio.muted = false;
      audio.volume = receiverVolume;
      if (audio.paused) {
        try {
          await audio.play();
        } catch (err) {
          console.warn('[Audio Recovery] Remote audio playback is waiting for user interaction:', err);
        }
      }
    }
  }, [receiverVolume, resumeAudioContext]);

  // Sistem Audio Recovery Terpusat (restartAudioStream - Resilient Non-Destructive Soft-Reload)
  const restartAudioStream = useCallback(async () => {
    if (isSwitchingAudioRef.current) {
      console.log('[Audio Recovery] Pemulihan audio sedang berjalan, mengabaikan panggilan duplikat.');
      return localStreamRef.current;
    }
    isSwitchingAudioRef.current = true;
    lastAudioSwitchTimeRef.current = Date.now();
    console.log('[Audio Recovery] Memulai soft-reload audio & re-binding Bluetooth...');

    // 1. Bersihkan track lama dan disconnect node terlebih dahulu agar driver Xiaomi/Android
    // melepaskan lock hardware internal mic dan dapat mengalihkan fokus ke headset Bluetooth (SCO)
    const oldStream = localStreamRef.current;
    if (oldStream) {
      oldStream.getTracks().forEach((t) => {
        try {
          t.onended = null;
          t.onmute = null;
          t.onunmute = null;
          t.stop();
        } catch (e) {
          console.warn('[Audio Recovery] Release track warning:', e);
        }
      });
    }

    if (micSourceNodeRef.current) {
      try {
        micSourceNodeRef.current.disconnect();
      } catch {}
      micSourceNodeRef.current = null;
    }

    // Beri jeda 250ms agar AudioRecord HAL Android/MIUI selesai melepaskan mutex
    await new Promise((resolve) => setTimeout(resolve, 250));

    let newStream: MediaStream | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        newStream = await acquireUniversalStream();
        if (newStream && newStream.getAudioTracks().length > 0) break;
      } catch (err) {
        console.warn(`[Audio Recovery] getUserMedia percobaan ke-${attempt + 1} belum berhasil:`, err);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
    }

    if (!newStream || newStream.getAudioTracks().length === 0) {
      console.error('[Audio Recovery] Gagal memulihkan audio stream. Mempertahankan status.');
      showDeviceToast('⚠️ Mic gagal dimuat. Cek izin browser.');
      isSwitchingAudioRef.current = false;
      return localStreamRef.current;
    }

    try {
      localStreamRef.current = newStream;
      setLocalStream(newStream);
      const newTrack = newStream.getAudioTracks()[0];

      // Sesuaikan status aktif mikrofon berdasarkan mode
      if (mode === 'ALWAYS_ON') {
        newTrack.enabled = !isMuted;
      } else {
        newTrack.enabled = isTransmitting && !isMuted;
      }

      // Pastikan pipeline WebAudio terhubung ke stream baru
      ensureAudioPipeline(newStream);

      // Tentukan active track keluar (mic atau campuran DJ)
      const activeTrack =
        isDjMode && mixedDestinationRef.current
          ? mixedDestinationRef.current.stream.getAudioTracks()[0]
          : newTrack;
      const streamToPass =
        isDjMode && mixedDestinationRef.current
          ? mixedDestinationRef.current.stream
          : newStream;

      // Sinkronkan track baru ke semua WebRTC peer connections
      (Object.values(peersRef.current) as RTCPeerConnection[]).forEach((pc) => {
        try {
          const senders = pc.getSenders();
          let audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
          if (!audioSender) {
            audioSender = senders.find((s) => !s.track);
          }
          if (audioSender && activeTrack) {
            audioSender.replaceTrack(activeTrack).catch((err) => {
              console.warn('[WebRTC] replaceTrack warning:', err);
            });
          } else if (streamToPass && activeTrack) {
            pc.addTrack(activeTrack, streamToPass);
          }
        } catch (e) {
          console.warn('[WebRTC] sync peer track warning:', e);
        }
      });

      // Tangani event onmute & onunmute bawaan OS Xiaomi/Android (misal: jeda fokus notifikasi/panggilan)
      newTrack.onmute = () => {
        console.warn('[Audio Track] Mic di-mute sementara oleh OS (notifikasi/panggilan/fokus)');
      };
      newTrack.onunmute = () => {
        console.log('[Audio Track] Mic di-unmute oleh OS, memulihkan status mic');
        newTrack.enabled = mode === 'ALWAYS_ON' ? !isMuted : (isTransmitting && !isMuted);
        resumeAudioContext();
      };

      // Tangani event track berakhir (misal: headset bluetooth dimatikan / putus)
      newTrack.onended = () => {
        if (!isSwitchingAudioRef.current && Date.now() - lastAudioSwitchTimeRef.current > 4000) {
          console.log('[Audio Recovery] Track audio berakhir (hardware off), trigger soft-reload...');
          triggerDebouncedAudioReload('Jalur audio disesuaikan');
        }
      };

      // PENTING: Bangunkan dan un-pause semua elemen audio penerima rider lain yang mungkin ter-pause oleh OS
      for (const [peerId, audio] of Object.entries(audioElementsRef.current) as [string, HTMLAudioElement][]) {
        if (audio) {
          audio.muted = false;
          audio.volume = receiverVolume;
          if ('setSinkId' in HTMLMediaElement.prototype && typeof (audio as any).setSinkId === 'function') {
            try {
              await (audio as any).setSinkId(activeSinkIdRef.current || '');
            } catch (e) {
              console.warn(`[Audio Recovery] setSinkId for ${peerId}:`, e);
            }
          }
          if (audio.srcObject) {
            audio.play().catch((playErr) => {
              console.warn(`[Audio Recovery] Re-play remote audio error for ${peerId}:`, playErr);
            });
          }
        }
      }

      await resumeRemoteAudio();
      playRecoveryBeep();
      showDeviceToast('✅ Jalur mic & audio dipulihkan');
      setAudioStatus(newTrack.enabled ? 'connected' : 'muted');
      return newStream;
    } catch (err) {
      console.error('[Audio Recovery] Error tahap finalisasi:', err);
      return localStreamRef.current;
    } finally {
      isSwitchingAudioRef.current = false;
      lastAudioSwitchTimeRef.current = Date.now();
    }
  }, [
    mode,
    isMuted,
    isTransmitting,
    isDjMode,
    acquireUniversalStream,
    ensureAudioPipeline,
    resumeAudioContext,
    resumeRemoteAudio,
    playRecoveryBeep,
    triggerDebouncedAudioReload,
    showDeviceToast,
  ]);

  // Hardware Switch Listener (ondevicechange) - Mendeteksi penyambungan Headset Bluetooth secara instan
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) {
      const handleDeviceChange = () => {
        console.log('[Audio Hardware] ondevicechange terdeteksi.');
        // 1. Abaikan jika sedang switching atau dalam cooldown 2.5 detik terakhir
        if (isSwitchingAudioRef.current || Date.now() - lastAudioSwitchTimeRef.current < 2500) {
          console.log('[Audio Hardware] ondevicechange diabaikan (cooldown aktif).');
          return;
        }

        console.log('[Audio Hardware] Perubahan hardware terdeteksi, menjadwalkan penyesuaian jalur audio...');
        triggerDebouncedAudioReload('🎧 Headset / Bluetooth terdeteksi');
      };

      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        if (navigator.mediaDevices) {
          navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        }
      };
    }
  }, [triggerDebouncedAudioReload]);

  const setupLocalAudioStream = restartAudioStream;

  // Auto-Resume and unlock all incoming audio on user gesture & visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resumeAudioContext();
        (Object.values(audioElementsRef.current) as HTMLAudioElement[]).forEach((audio) => {
          if (audio && audio.paused && audio.srcObject) {
            audio.play().catch(() => {});
          }
        });
      }
    };

    const unlockAudioPlayback = () => {
      resumeAudioContext();
      (Object.values(audioElementsRef.current) as HTMLAudioElement[]).forEach((audio) => {
        if (audio && audio.srcObject) {
          audio.muted = false;
          audio.volume = receiverVolume;
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', unlockAudioPlayback);
    window.addEventListener('touchstart', unlockAudioPlayback, { passive: true });
    window.addEventListener('click', unlockAudioPlayback, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', unlockAudioPlayback);
      window.removeEventListener('touchstart', unlockAudioPlayback);
      window.removeEventListener('click', unlockAudioPlayback);
    };
  }, [resumeRemoteAudio, receiverVolume]);

  // Adjust all remote audio elements when receiverVolume changes
  useEffect(() => {
    (Object.values(audioElementsRef.current) as HTMLAudioElement[]).forEach((audio) => {
      if (audio) audio.volume = receiverVolume;
    });
  }, [receiverVolume]);

  // Audio Output Routing Logic (Speakerphone Bawaan HP vs Headset/Bluetooth)
  const updateAudioOutput = useCallback(
    async (mode: AudioOutputMode) => {
      setAudioOutputMode(mode);
      try {
        let targetSinkId = '';

        if (mode === 'speaker') {
          // Cari output speaker / loudspeaker internal
          if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
            const speakerDev = audioOutputs.find(
              (d) =>
                d.label.toLowerCase().includes('speaker') ||
                d.label.toLowerCase().includes('loudspeaker') ||
                d.label.toLowerCase().includes('spk')
            );
            if (speakerDev && speakerDev.deviceId) {
              targetSinkId = speakerDev.deviceId;
            }
          }
        } else {
          // Mode Headset: kosongkan sinkId ('') agar OS Android/Xiaomi meroute langsung ke Bluetooth headset/earpiece
          targetSinkId = '';
        }

        activeSinkIdRef.current = targetSinkId;

        // Terapkan sinkId ke seluruh remote audio elements jika didukung
        if ('setSinkId' in HTMLMediaElement.prototype) {
          for (const audio of Object.values(audioElementsRef.current) as HTMLAudioElement[]) {
            if (audio && typeof (audio as any).setSinkId === 'function') {
              try {
                await (audio as any).setSinkId(targetSinkId);
              } catch (e) {
                console.warn('[Audio Output] setSinkId error:', e);
              }
            }
            // Pastikan audio remote rider lawan tidak ter-pause saat berpindah mode
            if (audio && audio.paused && audio.srcObject) {
              audio.play().catch(console.warn);
            }
          }
        }

        await resumeAudioContext();

        showDeviceToast(
          mode === 'speaker'
            ? '🔊 Output: Speakerphone (Bawaan HP)'
            : '🎧 Output: Headset / Bluetooth Helm'
        );
      } catch (err) {
        console.warn('[Audio Output] Error updating sink:', err);
        showDeviceToast(
          mode === 'speaker'
            ? '🔊 Output: Speakerphone'
            : '🎧 Output: Headset'
        );
      }
    },
    [showDeviceToast, resumeAudioContext]
  );

  const toggleAudioOutput = useCallback(() => {
    const nextMode = audioOutputMode === 'speaker' ? 'headset' : 'speaker';
    updateAudioOutput(nextMode);
  }, [audioOutputMode, updateAudioOutput]);

  // Get active outgoing track (mic or DJ mixed)
  const getActiveOutgoingTrack = useCallback(() => {
    if (isDjMode && mixedDestinationRef.current) {
      return mixedDestinationRef.current.stream.getAudioTracks()[0] || null;
    }
    return localStreamRef.current?.getAudioTracks()[0] || localStream?.getAudioTracks()[0] || null;
  }, [isDjMode, localStream]);

  // Replace or add track on all active peer connections when outgoing track changes
  const syncTrackToPeers = useCallback(() => {
    const newTrack = getActiveOutgoingTrack();
    if (!newTrack) return;

    (Object.values(peersRef.current) as RTCPeerConnection[]).forEach((pc) => {
      const senders = pc.getSenders();
      const audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
      if (audioSender) {
        audioSender.replaceTrack(newTrack).catch((err) => {
          console.warn('[WebRTC] replaceTrack warning:', err);
        });
      } else if (localStreamRef.current) {
        try {
          pc.addTrack(newTrack, localStreamRef.current);
        } catch (e) {
          console.warn('[WebRTC] addTrack warning:', e);
        }
      }
    });
  }, [getActiveOutgoingTrack]);

  // Trigger sync when DJ mode or localStream changes
  useEffect(() => {
    syncTrackToPeers();
  }, [isDjMode, localStream, syncTrackToPeers]);

  // 2. Initialize Microphone with Wind & Noise Suppression
  const initMicrophone = useCallback(async () => {
    try {
      setAudioStatus('connecting');
      const stream = await setupLocalAudioStream();

      // Voice Activity Detection (VAD) & WebAudio mixing pipeline
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass && !audioContextRef.current) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        ctx.onstatechange = () => {
          console.log(`[Audio Focus] audioCtx state: ${ctx.state}`);
          if (
            (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') &&
            document.visibilityState === 'visible'
          ) {
            ctx.resume().catch(console.warn);
          }
        };

        const micSource = ctx.createMediaStreamSource(stream);
        micSourceNodeRef.current = micSource;
        const micGain = ctx.createGain();
        micGainNodeRef.current = micGain;
        micSource.connect(micGain);

        const analyserNode = ctx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserNode.smoothingTimeConstant = 0.4;
        micSource.connect(analyserNode);
        analyserRef.current = analyserNode;

        // Destination for mixed audio (Mic + DJ MP3) -> routed to WebRTC peers
        const mixedDest = ctx.createMediaStreamDestination();
        mixedDestinationRef.current = mixedDest;
        micGain.connect(mixedDest);

        // VAD interval check (Runs purely in browser)
        const buffer = new Uint8Array(analyserNode.frequencyBinCount);
        if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = window.setInterval(() => {
          if (!localStreamRef.current?.getAudioTracks()[0]?.enabled) {
            if (isSpeakingStateRef.current) {
              isSpeakingStateRef.current = false;
              setIsMySpeaking(false);
              socket?.emit('voice-state', { isSpeaking: false });
            }
            return;
          }

          analyserNode.getByteFrequencyData(buffer);
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
        }, 100);
      }

      setAudioStatus('connected');
      playIntercomChirp('join');
      await resumeAudioContext();
      syncTrackToPeers();
    } catch (err: unknown) {
      console.error('Microphone init error:', err);
      setAudioStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mengakses mikrofon. Periksa izin browser.'
      );
    }
  }, [setupLocalAudioStream, socket, resumeAudioContext]);

  // 3. Setup Peer Connection (STUN Google dengan candidate queue dan direct output sink)
  const createPeerConnection = useCallback(
    (userId: string) => {
      if (peersRef.current[userId]) {
        try {
          peersRef.current[userId].close();
        } catch {}
      }

      const pc = new RTCPeerConnection(iceServers);
      peersRef.current[userId] = pc;
      queuedCandidatesRef.current[userId] = [];

      // Add local audio track
      const activeTrack = getActiveOutgoingTrack();
      const currentStream = localStreamRef.current;
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
        if (pc.iceConnectionState === 'failed') {
          console.warn(`[WebRTC] ICE failed with ${userId}, restarting ICE...`);
          if ('restartIce' in pc) {
            pc.restartIce();
          }
        }
      };

      // Receive remote audio stream (Zoom Conference Call direct playback)
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received audio track from ${userId}, track id: ${event.track.id}`);
        const remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

        let audio = audioElementsRef.current[userId];
        if (!audio) {
          audio = document.createElement('audio');
          audio.id = `remote-audio-${userId}`;
          audio.autoplay = true;
          audio.muted = false;
          audio.setAttribute('playsinline', 'true');
          audio.setAttribute('webkit-playsinline', 'true');
          // Posisi tetap di viewport agar tidak dianggap phantom tab oleh MIUI Xiaomi
          audio.style.position = 'fixed';
          audio.style.bottom = '0px';
          audio.style.right = '0px';
          audio.style.width = '1px';
          audio.style.height = '1px';
          audio.style.opacity = '0.01';
          audio.style.pointerEvents = 'none';
          document.body.appendChild(audio);
          audioElementsRef.current[userId] = audio;

          // Tangani jika OS Xiaomi mem-pause audio saat Bluetooth tersambung/berpindah
          audio.onpause = () => {
            console.log(`[Audio Element] Remote audio for ${userId} ter-pause oleh OS. Mencoba auto-resume...`);
            setTimeout(() => {
              if (audio && audio.paused && audio.srcObject) {
                audio.play().catch(() => {});
              }
            }, 300);
          };
        }

        audio.srcObject = remoteStream;
        audio.muted = false;
        audio.volume = receiverVolume;

        // Pasang sinkId jika didukung dan valid
        if ('setSinkId' in HTMLMediaElement.prototype && typeof (audio as any).setSinkId === 'function') {
          (audio as any).setSinkId(activeSinkIdRef.current || '').catch((err: unknown) => {
            console.warn('[Audio Output] setSinkId non-fatal error:', err);
          });
        }

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((playErr) => {
            console.warn(`[WebRTC] Audio auto-play prevented for ${userId}:`, playErr);
          });
        }
      };

      return pc;
    },
    [getActiveOutgoingTrack, socket, receiverVolume]
  );

  // 4. Handle Socket.io WebRTC Signals (Reliable Conference Call Mesh)
  useEffect(() => {
    if (!socket) return;

    // Helper untuk mengoptimalkan Opus SDP untuk kualitas vokal dan ketahanan packet loss
    const optimizeOpusSdp = (sdp: string): string => {
      if (!sdp) return sdp;
      return sdp.replace(/a=fmtp:(\d+) (.*)/g, (match, pt, params) => {
        if (params.includes('useinbandfec=')) return match;
        return `a=fmtp:${pt} ${params};useinbandfec=1;usedtx=1;maxaveragebitrate=32000`;
      });
    };

    const handleUserConnected = async (data: { userId: string; username: string }) => {
      console.log(`[WebRTC] Initiating call to new rider: ${data.username} (${data.userId})`);
      playIntercomChirp('join');
      const pc = createPeerConnection(data.userId);
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        offer.sdp = optimizeOpusSdp(offer.sdp || '');
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: data.userId, signal: offer });
      } catch (err) {
        console.error('[WebRTC] Create offer failed:', err);
      }
    };

    const handleSignal = async (data: {
      from: string;
      signal: RTCSessionDescriptionInit & { candidate?: RTCIceCandidateInit };
    }) => {
      const { from, signal } = data;
      let pc = peersRef.current[from];

      if (!pc) {
        pc = createPeerConnection(from);
      }

      try {
        if (signal.type === 'offer') {
          // Glare Collision Handling (Zoom/W3C Polite Peer Pattern)
          if (pc.signalingState !== 'stable') {
            const isPolite = (socket.id || '').localeCompare(from) > 0;
            if (!isPolite) {
              console.log(`[WebRTC] Glare collision from ${from}. Impolite peer ignoring offer.`);
              return;
            }
            console.log(`[WebRTC] Glare collision from ${from}. Polite peer rolling back offer.`);
            await pc.setLocalDescription({ type: 'rollback' });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal));

          // Drain queued ICE candidates yang tiba sebelum offer selesai di-set
          const queued = queuedCandidatesRef.current[from] || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.warn('[WebRTC] Queued ICE candidate error:', e);
            }
          }
          queuedCandidatesRef.current[from] = [];

          const answer = await pc.createAnswer();
          answer.sdp = optimizeOpusSdp(answer.sdp || '');
          await pc.setLocalDescription(answer);
          socket.emit('signal', { to: from, signal: answer });
        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));

            // Drain queued ICE candidates
            const queued = queuedCandidatesRef.current[from] || [];
            for (const cand of queued) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn('[WebRTC] Queued ICE candidate error:', e);
              }
            }
            queuedCandidatesRef.current[from] = [];
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
        console.error('[WebRTC] Signal handling error:', err);
      }
    };

    // Auto-reconnect fallback untuk rider yang sudah ada di room (Jeda 5s agar existing occupants mengirim offer terlebih dahulu)
    const handleRoomUsers = (data: { roomId: string; users: { userId: string; username: string }[] }) => {
      if (!data.users || data.users.length === 0) return;
      const timer = setTimeout(() => {
        data.users.forEach(async (u) => {
          if (u.userId && !peersRef.current[u.userId]) {
            console.log(`[WebRTC] Fallback koneksi call ke rider yang ada: ${u.username}`);
            const pc = createPeerConnection(u.userId);
            try {
              const offer = await pc.createOffer({ offerToReceiveAudio: true });
              offer.sdp = optimizeOpusSdp(offer.sdp || '');
              await pc.setLocalDescription(offer);
              socket.emit('signal', { to: u.userId, signal: offer });
            } catch (err) {
              console.warn('[WebRTC] Fallback offer error:', err);
            }
          }
        });
      }, 5000);
      return () => clearTimeout(timer);
    };

    const handleUserDisconnected = (userId: string) => {
      if (peersRef.current[userId]) {
        try {
          peersRef.current[userId].close();
        } catch {}
        delete peersRef.current[userId];
      }
      delete queuedCandidatesRef.current[userId];
      if (audioElementsRef.current[userId]) {
        const audio = audioElementsRef.current[userId];
        audio.pause();
        audio.srcObject = null;
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
        delete audioElementsRef.current[userId];
      }
    };

    socket.on('user-connected', handleUserConnected);
    socket.on('signal', handleSignal);
    socket.on('room-users', handleRoomUsers);
    socket.on('user-disconnected', handleUserDisconnected);

    return () => {
      socket.off('user-connected', handleUserConnected);
      socket.off('signal', handleSignal);
      socket.off('room-users', handleRoomUsers);
      socket.off('user-disconnected', handleUserDisconnected);
    };
  }, [socket, createPeerConnection]);

  // 5. PTT & Mode Muting Controls
  const startPtt = useCallback(() => {
    if (mode !== 'PTT' || !localStream || isMuted) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = true;
      setIsTransmitting(true);
      playIntercomChirp('ptt-on');
      socket?.emit('voice-state', { isSpeaking: true });
    }
  }, [mode, localStream, isMuted, socket]);

  const endPtt = useCallback(() => {
    if (mode !== 'PTT' || !localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = false;
      setIsTransmitting(false);
      playIntercomChirp('ptt-off');
      socket?.emit('voice-state', { isSpeaking: false });
    }
  }, [mode, localStream, socket]);

  useEffect(() => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;

    if (mode === 'ALWAYS_ON') {
      track.enabled = !isMuted;
      setAudioStatus(isMuted ? 'muted' : 'connected');
    } else {
      track.enabled = isTransmitting && !isMuted;
      setAudioStatus(track.enabled ? 'connected' : isMuted ? 'muted' : 'connected');
    }
  }, [localStream, mode, isMuted, isTransmitting]);

  // 6. DJ Kapten Audio Engine & Dual Output Routing
  const ensureDJNodes = useCallback(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    if (!musicAudioRef.current) {
      const audioEl = document.createElement('audio');
      audioEl.loop = false;
      audioEl.setAttribute('playsinline', 'true');

      audioEl.addEventListener('ended', () => {
        console.log('[DJ] Lagu berakhir, auto-next...');
        playNextTrackRef.current?.();
      });

      musicAudioRef.current = audioEl;

      const sourceNode = ctx.createMediaElementSource(audioEl);
      musicSourceNodeRef.current = sourceNode;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(musicVolume, ctx.currentTime);
      musicGainNodeRef.current = gainNode;

      sourceNode.connect(gainNode);

      // Cabang 1: Diarahkan ke audioContext.destination (speaker/headset HP Kapten)
      gainNode.connect(ctx.destination);

      // Cabang 2: Diarahkan ke MediaStreamAudioDestinationNode (WebRTC P2P stream ke rider lain)
      if (mixedDestinationRef.current) {
        gainNode.connect(mixedDestinationRef.current);
      }
    }
  }, [musicVolume]);

  // Sort playlist
  const applySort = useCallback(
    (tracks: MusicTrack[], mode: 'NAME' | 'SHUFFLE' | 'DATE') => {
      let sorted = [...tracks];
      if (mode === 'NAME') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
      } else if (mode === 'SHUFFLE') {
        sorted.sort(() => Math.random() - 0.5);
      } else if (mode === 'DATE') {
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

  // Play a specific track index
  const playTrackAtIndex = useCallback(
    async (index: number) => {
      if (index < 0 || index >= playlist.length) return;
      ensureDJNodes();
      await resumeAudioContext();

      const track = playlist[index];
      setCurrentTrackIndex(index);
      setMusicTrackTitle(track.title);

      if (musicAudioRef.current) {
        if (track.url) {
          musicAudioRef.current.src = track.url;
        } else if (track.file) {
          musicAudioRef.current.src = URL.createObjectURL(track.file);
        }
        try {
          await musicAudioRef.current.play();
          setIsMusicPlaying(true);
          socket?.emit('dj-music-state', { isPlaying: true, trackTitle: track.title });
        } catch (err) {
          console.warn('Track play failed:', err);
        }
      }
    },
    [playlist, ensureDJNodes, resumeAudioContext, socket]
  );

  // Muat Lagu Demo Touring Bebas Hak Cipta untuk tes audio
  const loadDemoTouringTracks = useCallback(() => {
    const demoTracks: MusicTrack[] = [
      {
        title: 'Touring Synth Anthem',
        name: 'Touring Synth Anthem.mp3',
        url: 'https://cdn.freesound.org/previews/557/557815_11861866-lq.mp3',
        lastModified: Date.now() - 1000,
      },
      {
        title: 'Highway Cruiser Lo-Fi',
        name: 'Highway Cruiser Lo-Fi.mp3',
        url: 'https://cdn.freesound.org/previews/612/612662_11861866-lq.mp3',
        lastModified: Date.now() - 2000,
      },
      {
        title: 'Sunset Coast Ride',
        name: 'Sunset Coast Ride.mp3',
        url: 'https://cdn.freesound.org/previews/415/415804_5121236-lq.mp3',
        lastModified: Date.now() - 3000,
      },
    ];

    setOriginalPlaylist(demoTracks);
    setPlaylist(demoTracks);
    setCurrentTrackIndex(0);
    setMusicTrackTitle(demoTracks[0].title);
    ensureDJNodes();
    setIsDjMode(true);
    if (musicAudioRef.current) {
      musicAudioRef.current.src = demoTracks[0].url!;
      musicAudioRef.current
        .play()
        .then(() => {
          setIsMusicPlaying(true);
          socket?.emit('dj-music-state', { isPlaying: true, trackTitle: demoTracks[0].title });
        })
        .catch((e) => console.warn('Demo play error:', e));
    }
    setDeviceToastMessage('🎵 Lagu Demo Touring dimuat & siap diputar!');
  }, [ensureDJNodes, socket]);

  // Play next track (auto-next loop)
  const playNextTrack = useCallback(async () => {
    if (playlist.length === 0) return;
    const nextIndex = (currentTrackIndex + 1) % playlist.length;
    await playTrackAtIndex(nextIndex);
  }, [playlist.length, currentTrackIndex, playTrackAtIndex]);

  // Play previous track
  const playPrevTrack = useCallback(async () => {
    if (playlist.length === 0) return;
    const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    await playTrackAtIndex(prevIndex);
  }, [playlist.length, currentTrackIndex, playTrackAtIndex]);

  useEffect(() => {
    playNextTrackRef.current = playNextTrack;
  }, [playNextTrack]);

  // Load files from folder or multiple file picker
  const loadMusicFiles = useCallback(
    (files: File[]) => {
      const audioFiles = files.filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        return ['mp3', 'aac', 'ogg', 'm4a', 'wav'].includes(ext) || f.type.startsWith('audio/');
      });

      if (audioFiles.length === 0) return;

      const trackList: MusicTrack[] = audioFiles.map((f) => ({
        file: f,
        title: f.name.replace(/\.[^/.]+$/, ''),
        name: f.name,
        lastModified: f.lastModified || 0,
      }));

      setOriginalPlaylist(trackList);
      const sorted = applySort(trackList, sortMode);
      setPlaylist(sorted);
      setCurrentTrackIndex(0);
      setMusicTrackTitle(sorted[0].title);
      ensureDJNodes();
      setIsDjMode(true);

      if (musicAudioRef.current) {
        musicAudioRef.current.src = URL.createObjectURL(sorted[0].file);
      }
    },
    [sortMode, applySort, ensureDJNodes]
  );

  // Toggle play / pause
  const togglePlayMusic = useCallback(async () => {
    ensureDJNodes();
    await resumeAudioContext();

    if (!musicAudioRef.current) return;

    if (isMusicPlaying) {
      musicAudioRef.current.pause();
      setIsMusicPlaying(false);
      socket?.emit('dj-music-state', { isPlaying: false, trackTitle: musicTrackTitle });
    } else {
      if (currentTrackIndex === -1 && playlist.length > 0) {
        await playTrackAtIndex(0);
        return;
      }
      try {
        await musicAudioRef.current.play();
        setIsMusicPlaying(true);
        socket?.emit('dj-music-state', { isPlaying: true, trackTitle: musicTrackTitle });
      } catch (err) {
        console.warn('Music play failed:', err);
      }
    }
  }, [ensureDJNodes, resumeAudioContext, isMusicPlaying, musicTrackTitle, currentTrackIndex, playlist.length, playTrackAtIndex, socket]);

  // Stop music
  const stopMusic = useCallback(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current.currentTime = 0;
      setIsMusicPlaying(false);
      socket?.emit('dj-music-state', { isPlaying: false, trackTitle: '' });
    }
  }, [socket]);

  // Adjust baseline DJ volume (gain statis normal tanpa ducking)
  const handleSetMusicVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      setMusicVolume(clamped);
      if (musicGainNodeRef.current && audioContextRef.current) {
        musicGainNodeRef.current.gain.setValueAtTime(
          clamped,
          audioContextRef.current.currentTime
        );
      }
    },
    []
  );

  // 7. Direct Audio Routing: Auto-ducking dinonaktifkan, volume musik & interkom statis
  useEffect(() => {
    if (!musicGainNodeRef.current || !audioContextRef.current || !isMusicPlaying) return;

    const ctx = audioContextRef.current;
    // Tetap pada volume normal yang dipilih user
    setIsDucked(false);
    musicGainNodeRef.current.gain.setValueAtTime(musicVolume, ctx.currentTime);
  }, [musicVolume, isMusicPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
      }
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current.src = '';
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch {}
      }
      for (const pc of Object.values(peersRef.current) as RTCPeerConnection[]) {
        pc.close();
      }
      for (const audio of Object.values(audioElementsRef.current) as HTMLAudioElement[]) {
        audio.pause();
        audio.srcObject = null;
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [localStream]);

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

    // Audio Output Mode (Speakerphone vs Headset)
    audioOutputMode,
    toggleAudioOutput,
    updateAudioOutput,

    // Audio Focus & Device Toast
    deviceToastMessage,
    dismissDeviceToast: () => setDeviceToastMessage(null),

    // DJ Kapten features & Playlist
    isDjMode,
    setIsDjMode,
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
