import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Rider, IntercomMode, ConvoyAlert, DJMusicState, DJCaptainState } from './types';
import { useBattery } from './hooks/useBattery';
import { useWakeLock } from './hooks/useWakeLock';
import { useMediaSession } from './hooks/useMediaSession';
import { useIntercomAudio } from './hooks/useIntercomAudio';
import { startBackgroundAudioKeepAlive, stopBackgroundAudioKeepAlive, playIntercomChirp } from './utils/audioKeepAlive';
import { IntercomMap } from './components/IntercomMap';
import { RiderControls } from './components/RiderControls';
import { LobbyScreen } from './components/LobbyScreen';
import { ConvoyAlertModal } from './components/ConvoyAlertModal';
import { RiderListModal } from './components/RiderListModal';
import { BatteryGuideModal } from './components/BatteryGuideModal';
import { ConvoyAlertToast } from './components/ConvoyAlertToast';
import { DJMusicModal } from './components/DJMusicModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { Radio, Wifi, WifiOff, Users, Battery, LogOut, Info, Music, Disc3 } from 'lucide-react';

const socketServerUrl =
  import.meta.env.VITE_SOCKET_SERVER_URL?.trim() || 'https://gibah.purbaya.my.id';
const IntercomAudio = registerPlugin<{
  startAudioSession: () => Promise<void>;
  stopAudioSession: () => Promise<void>;
  refreshAudioRoute: () => Promise<void>;
  setAudioOutput: (options: { output: 'speaker' | 'headset' }) => Promise<void>;
  requestAppPermissions: () => Promise<{ granted: boolean }>;
  openBatteryOptimizationSettings: () => Promise<{ opened: boolean }>;
}>('IntercomAudio');

export default function App() {
  const [isJoined, setIsJoined] = useState(false);
  const [callsign, setCallsign] = useState('');
  const [roomId, setRoomId] = useState('GIBAH ON THE ROAD');
  const [mode, setMode] = useState<IntercomMode>('ALWAYS_ON');
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    const requestStartupPermissions = async () => {
      try {
        await IntercomAudio.requestAppPermissions();
        if (!cancelled) {
          await IntercomAudio.openBatteryOptimizationSettings();
        }
      } catch (error) {
        console.error('[Permissions] Permintaan izin awal gagal:', error);
      }
    };
    void requestStartupPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  // GPS & Telemetry
  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const [myHeading, setMyHeading] = useState<number | null>(null);
  const [mySpeed, setMySpeed] = useState<number | null>(null);
  const [followMe, setFollowMe] = useState(true);

  // Convoy & Alerts
  const [riders, setRiders] = useState<Rider[]>([]);
  const [activeAlert, setActiveAlert] = useState<ConvoyAlert | null>(null);
  const [alertHistory, setAlertHistory] = useState<ConvoyAlert[]>([]);

  // Jaminan otomatis hilangkan bilah alert (Bensin/SPBU/Bahaya) setelah 7 detik
  useEffect(() => {
    if (!activeAlert) return;
    const timer = setTimeout(() => {
      setActiveAlert(null);
    }, 7500);
    return () => clearTimeout(timer);
  }, [activeAlert]);

  // Modals
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isRiderListOpen, setIsRiderListOpen] = useState(false);
  const [isBatteryGuideOpen, setIsBatteryGuideOpen] = useState(false);
  const [isDJModalOpen, setIsDJModalOpen] = useState(false);
  const [activeDjState, setActiveDjState] = useState<DJMusicState | null>(null);
  const [djCaptain, setDjCaptain] = useState<DJCaptainState | null>(null);

  // Networking state
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const isCurrentRiderCaptain = djCaptain?.userId === socketRef.current?.id;
  // Local playback must not depend on a possibly stale captain broadcast.
  // The server only uses captain state for coordination; it does not gate
  // the dj-music-state event.
  const canControlMusic = true;

  // Device APIs
  const { batteryLevel } = useBattery();
  const { isLocked: isWakeLocked, toggleLock: toggleWakeLock, requestLock } = useWakeLock();

  // Audio Engine Hook (with DJ Kapten mixing & Auto-Ducking)
  const {
    audioStatus,
    isTransmitting,
    isMySpeaking,
    initMicrophone,
    startPtt,
    endPtt,
    isDjMode,
    setIsDjMode,
    musicTrackTitle,
    isMusicPlaying,
    musicVolume,
    setMusicVolume,
    receiverVolume,
    setReceiverVolume,
    isDucked,
    playlist,
    currentTrackIndex,
    sortMode,
    setPlaylistSortMode,
    loadMusicFiles,
    playTrackAtIndex,
    playNextTrack,
    playPrevTrack,
    togglePlayMusic,
    stopMusic,
    deviceToastMessage,
    dismissDeviceToast,
  } = useIntercomAudio({
    socket: socketInstance,
    roomId,
    myCallsign: callsign,
    mode,
    isMuted,
    anyRiderSpeaking: riders.some((r) => r.isSpeaking),
  });

  // Handle Mute Toggle
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const nextMuted = !prev;
      socketRef.current?.emit('voice-state', {
        isSpeaking: false,
        isMuted: nextMuted,
      });
      playIntercomChirp(nextMuted ? 'ptt-off' : 'ptt-on');
      return nextMuted;
    });
  }, []);

  // Media Session API (Binds Bluetooth Helmet buttons)
  useMediaSession({
    callsign,
    roomId,
    isMuted,
    isSpeaking: isMySpeaking,
    onToggleMute: toggleMute,
  });

  // Join Room Execution
  const handleJoin = async (name: string, room: string, selectedMode: IntercomMode) => {
    setCallsign(name);
    setRoomId(room);
    setMode(selectedMode);

    // 1. Start silent audio keep-alive to keep mobile OS from suspending in pocket
    startBackgroundAudioKeepAlive();

    // 2. Request initial wake lock
    await requestLock();

    // Start native routing before getUserMedia so Bluetooth SCO/wired input is selected first.
    try {
      if (Capacitor.isNativePlatform()) {
        await IntercomAudio.startAudioSession();
      }
      await initMicrophone();
    } catch (error) {
      console.error('[Audio] Tidak dapat memulai sesi interkom:', error);
      stopBackgroundAudioKeepAlive();
      alert('Audio gagal dimulai. Izinkan mikrofon lalu coba lagi.');
      return;
    }

    // 4. Connect Socket.io
    const socket = io(socketServerUrl || undefined, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => {
      console.log(`[Socket] Connected: ${socket.id}`);
      setIsConnected(true);
      socket.emit('join-room', {
        roomId: room,
        username: name,
        battery: batteryLevel,
        coords: myCoords,
      });
    });

    socket.on('disconnect', () => {
      console.warn('[Socket] Disconnected. Waiting to reconnect...');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    // Populate existing riders in room
    socket.on('room-users', (data: { roomId: string; users: Rider[] }) => {
      console.log('[Socket] Existing room users:', data.users);
      setRiders(data.users || []);
    });

    // Remote metadata updates (GPS, battery, etc.)
    socket.on('metadata-updated', (data: {
      userId: string;
      username: string;
      coords?: [number, number];
      battery?: number;
      heading?: number | null;
      speed?: number | null;
      isMuted?: boolean;
      isSpeaking?: boolean;
    }) => {
      setRiders((prev) => {
        const index = prev.findIndex((r) => r.userId === data.userId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            ...data,
            lastSeen: Date.now(),
          };
          return updated;
        } else {
          return [
            ...prev,
            {
              userId: data.userId,
              username: data.username,
              battery: data.battery ?? 100,
              coords: data.coords ?? null,
              heading: data.heading ?? null,
              speed: data.speed ?? null,
              isMuted: data.isMuted ?? false,
              isSpeaking: data.isSpeaking ?? false,
              lastSeen: Date.now(),
            },
          ];
        }
      });
    });

    // Remote Voice State Changed (VAD instant indicator)
    socket.on('voice-state-changed', (data: { userId: string; isSpeaking: boolean; isMuted?: boolean }) => {
      setRiders((prev) =>
        prev.map((r) => {
          if (r.userId === data.userId) {
            return {
              ...r,
              isSpeaking: data.isSpeaking,
              isMuted: data.isMuted !== undefined ? data.isMuted : r.isMuted,
            };
          }
          return r;
        })
      );
    });

    // Convoy Alerts
    socket.on('convoy-alert', (alert: ConvoyAlert) => {
      console.log('[Alert Received]:', alert);
      playIntercomChirp('alert');
      setActiveAlert(alert);
      setAlertHistory((prev) => {
        // Clear previous alert from the same user to avoid duplicate label pileup
        const filtered = prev.filter((a) => a.username !== alert.username && a.id !== alert.id);
        return [alert, ...filtered].slice(0, 20);
      });
    });

    // Remote DJ Kapten Music State (When another rider is playing music)
    socket.on('dj-music-state', (data: DJMusicState) => {
      console.log('[DJ Music State]:', data);
      setActiveDjState(data.isPlaying ? data : null);
    });
    socket.on('dj-captain-state', (data: DJCaptainState | null) => setDjCaptain(data));
    socket.on('dj-captain-rejected', () => {
      console.warn('[DJ] Kapten musik sedang digunakan rider lain');
    });

    // User Disconnected
    socket.on('user-disconnected', (userId: string) => {
      setRiders((prev) => prev.filter((r) => r.userId !== userId));
      setActiveDjState((prev) => (prev?.userId === userId ? null : prev));
      setDjCaptain((prev) => (prev?.userId === userId ? null : prev));
    });

    // 5. Start GPS tracking
    startGeolocationTracking(socket);

    setIsJoined(true);
  };

  // GPS Geolocation Watcher
  const startGeolocationTracking = (socket: Socket) => {
    if (!('geolocation' in navigator)) return;

    let lastEmitTime = 0;

    navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyCoords(coords);
        setMyHeading(pos.coords.heading);
        setMySpeed(pos.coords.speed);

        // Throttle emission to max once per 1000ms
        const now = Date.now();
        if (now - lastEmitTime > 1000) {
          lastEmitTime = now;
          socket.emit('update-metadata', {
            coords,
            battery: batteryLevel,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            isMuted,
            isSpeaking: isMySpeaking,
          });
        }
      },
      (err) => {
        console.warn('Geolocation watch error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );
  };

  // Broadcast Convoy Alert
  const handleSendAlert = (type: 'DANGER' | 'REST' | 'POLICE' | 'FUEL' | 'LOST' | 'INFO', message: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('convoy-alert', {
      type,
      message,
      coords: myCoords,
    });
    playIntercomChirp('alert');
  };

  // Keyboard Spacebar PTT shortcut for testing/cockpit controls
  useEffect(() => {
    if (!isJoined || mode !== 'PTT') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        startPtt();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        endPtt();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isJoined, mode, startPtt, endPtt]);

  // Leave room / Logout
  const handleLeave = () => {
    if (confirm('Keluar dari room interkom touring?')) {
      stopBackgroundAudioKeepAlive();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      IntercomAudio.stopAudioSession().catch((error) => {
        console.warn('[Native Audio] Stop session failed:', error);
      });
      setIsJoined(false);
      setRiders([]);
      setMyCoords(null);
    }
  };

  // Render Lobby Screen if not joined
  if (!isJoined) {
    return <LobbyScreen onJoin={handleJoin} batteryLevel={batteryLevel} />;
  }

  // Active Touring Screen
  return (
    <div className="fixed inset-0 bg-zinc-950 text-white flex flex-col select-none overflow-hidden font-sans">
      {/* Top Tactical Status Bar */}
      <header className="h-14 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-3 flex items-center justify-between z-30 pt-safe">
        {/* Left: Branding & Room */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-zinc-900 border border-emerald-500/60 flex items-center justify-center">
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm text-white tracking-wider">GIBAH BERJAMAAH</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-emerald-400 font-bold border border-zinc-700">
                {roomId}
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
              <span className="text-zinc-200 font-bold">{callsign}</span>
              <span>•</span>
              <span className={isConnected ? 'text-emerald-400' : 'text-amber-400'}>
                {isConnected ? 'WSS Online' : 'Reconnecting...'}
              </span>
              {(isMusicPlaying || activeDjState?.isPlaying) && (
                <>
                  <span>•</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Music className="w-3 h-3 animate-pulse" />
                    <span>{isMusicPlaying ? 'DJ Kamu' : `DJ ${activeDjState?.djName}`}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Telemetry & Actions */}
        <div className="flex items-center gap-2">
          {/* Battery Status */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono">
            <Battery className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-bold">{batteryLevel}%</span>
          </div>

          {/* Connected Riders Badge */}
          <button
            onClick={() => setIsRiderListOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs font-bold active:scale-95"
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>{riders.length + 1}</span>
          </button>

          {/* Leave Button */}
          <button
            onClick={handleLeave}
            className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 flex items-center justify-center active:scale-95"
            title="Keluar Room"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Map Viewport */}
      <main className="flex-1 relative w-full h-full">
        <IntercomMap
          myCoords={myCoords}
          myCallsign={callsign}
          myBattery={batteryLevel}
          myHeading={myHeading}
          mySpeed={mySpeed}
          isMySpeaking={isMySpeaking || isTransmitting}
          riders={riders}
          alerts={alertHistory}
          followMe={followMe}
          onToggleFollowMe={() => setFollowMe((prev) => !prev)}
        />

        {/* Real-time Speaking Notification Banner (Floating bottom-left of map) */}
        {riders.some((r) => r.isSpeaking) && (
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
            <div className="bg-emerald-950/90 border border-emerald-500 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-xl animate-speaking">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-black">
                {riders.filter((r) => r.isSpeaking).map((r) => r.username).join(', ')}
              </span>
              <span className="text-[10px] text-emerald-300">sedang berbicara...</span>
            </div>
          </div>
        )}
      </main>

      {/* Massive Glove-Friendly Rider Bottom Controls */}
      <RiderControls
        mode={mode}
        onToggleMode={() => {
          setMode((prev) => (prev === 'ALWAYS_ON' ? 'PTT' : 'ALWAYS_ON'));
        }}
        isMuted={isMuted}
        isTransmitting={isTransmitting}
        isSpeaking={isMySpeaking}
        isWakeLocked={isWakeLocked}
        onToggleWakeLock={toggleWakeLock}
        onToggleMute={toggleMute}
        onPttStart={startPtt}
        onPttEnd={endPtt}
        onOpenAlerts={() => setIsAlertModalOpen(true)}
        onOpenRiderList={() => setIsRiderListOpen(true)}
        onOpenBatteryGuide={() => setIsBatteryGuideOpen(true)}
        onOpenDJModal={() => setIsDJModalOpen(true)}
        isDjActive={isDjMode}
        isPlayingMusic={isMusicPlaying}
        connectedCount={riders.length + 1}
      />

      {/* Convoy Alert Toast (20s Auto-Dismiss with Fade Out) */}
      <ConvoyAlertToast
        alert={activeAlert}
        onDismiss={() => setActiveAlert(null)}
      />

      {/* Audio Device Notification / Output Switch Toast */}
      {deviceToastMessage && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-sm bg-neutral-900/95 border border-amber-500/60 text-amber-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top duration-300">
          <span className="font-semibold">{deviceToastMessage}</span>
          <button
            onClick={dismissDeviceToast}
            className="text-amber-400 hover:text-amber-100 font-bold text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* DJ Kapten Music Sharing Modal */}
      <DJMusicModal
        isOpen={isDJModalOpen}
        onClose={() => setIsDJModalOpen(false)}
        isDjMode={isDjMode}
        onToggleDjMode={setIsDjMode}
        trackTitle={musicTrackTitle}
        isPlaying={isMusicPlaying}
        volume={musicVolume}
        onVolumeChange={setMusicVolume}
        receiverVolume={receiverVolume}
        onReceiverVolumeChange={setReceiverVolume}
        isDucked={isDucked}
        playlist={playlist}
        currentTrackIndex={currentTrackIndex}
        sortMode={sortMode}
        onSetSortMode={setPlaylistSortMode}
        onLoadFiles={loadMusicFiles}
        onSelectTrack={playTrackAtIndex}
        onNextTrack={playNextTrack}
        onPrevTrack={playPrevTrack}
        onTogglePlay={togglePlayMusic}
        onStop={stopMusic}
        djCaptain={djCaptain}
        isCurrentRiderCaptain={isCurrentRiderCaptain}
        canControlMusic={canControlMusic}
        onAcquireCaptain={() => socketRef.current?.emit('dj-captain-acquire')}
        onReleaseCaptain={() => {
          stopMusic();
          setIsDjMode(false);
          socketRef.current?.emit('dj-captain-release');
        }}
      />

      {/* Modals */}
      <ConvoyAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        onSendAlert={handleSendAlert}
      />

      <RiderListModal
        isOpen={isRiderListOpen}
        onClose={() => setIsRiderListOpen(false)}
        roomId={roomId}
        myCallsign={callsign}
        myBattery={batteryLevel}
        isMyMuted={isMuted}
        isMySpeaking={isMySpeaking || isTransmitting}
        riders={riders}
      />

      <BatteryGuideModal
        isOpen={isBatteryGuideOpen}
        onClose={() => setIsBatteryGuideOpen(false)}
      />
    </div>
  );
}
