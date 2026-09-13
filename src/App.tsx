import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Rider, IntercomMode, ConvoyAlert, DJMusicState } from './types';
import { useBattery } from './hooks/useBattery';
import { useWakeLock } from './hooks/useWakeLock';
import { useMediaSession } from './hooks/useMediaSession';
import { useIntercomAudio } from './hooks/useIntercomAudio';
import { startBackgroundAudioKeepAlive, playIntercomChirp } from './utils/audioKeepAlive';
import { IntercomMap } from './components/IntercomMap';
import { RiderControls } from './components/RiderControls';
import { LobbyScreen } from './components/LobbyScreen';
import { ConvoyAlertModal } from './components/ConvoyAlertModal';
import { RiderListModal } from './components/RiderListModal';
import { BatteryGuideModal } from './components/BatteryGuideModal';
import { ConvoyAlertToast } from './components/ConvoyAlertToast';
import { DJMusicModal } from './components/DJMusicModal';
import { VolumeBoosterModal } from './components/VolumeBoosterModal';
import { AudioDeviceModal } from './components/AudioDeviceModal';
import { Radio, Wifi, WifiOff, Users, Battery, LogOut, Info, Music, Zap, Headphones, Bluetooth } from 'lucide-react';

export default function App() {
  const [isJoined, setIsJoined] = useState(false);
  const [callsign, setCallsign] = useState('');
  const [roomId, setRoomId] = useState('GIBAH ON THE ROAD');
  const [mode, setMode] = useState<IntercomMode>('ALWAYS_ON');
  const [isMuted, setIsMuted] = useState(false);

  // GPS & Telemetry
  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const [myHeading, setMyHeading] = useState<number | null>(null);
  const [mySpeed, setMySpeed] = useState<number | null>(null);
  const [followMe, setFollowMe] = useState(true);

  // Convoy & Alerts
  const [riders, setRiders] = useState<Rider[]>([]);
  const [activeAlert, setActiveAlert] = useState<ConvoyAlert | null>(null);
  const [alertHistory, setAlertHistory] = useState<ConvoyAlert[]>([]);

  // Otomatis hilangkan bilah alert (Bensin/SPBU/Bahaya/Razia) setelah 40 detik
  useEffect(() => {
    if (!activeAlert) return;
    const timer = setTimeout(() => {
      setActiveAlert(null);
    }, 40500);
    return () => clearTimeout(timer);
  }, [activeAlert]);

  // Modals
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isRiderListOpen, setIsRiderListOpen] = useState(false);
  const [isBatteryGuideOpen, setIsBatteryGuideOpen] = useState(false);
  const [isDJModalOpen, setIsDJModalOpen] = useState(false);
  const [isVolumeBoosterOpen, setIsVolumeBoosterOpen] = useState(false);
  const [isAudioDeviceModalOpen, setIsAudioDeviceModalOpen] = useState(false);
  const [activeDjState, setActiveDjState] = useState<DJMusicState | null>(null);

  // Networking state
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);

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
    micBoost,
    setMicBoost,
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
    deviceToastMessage,
    dismissDeviceToast,
    toggleDjMode,
    isDjOwner,
    isDjLockedByOther,
    resetDjLock,
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    activeDeviceLabel,
    selectInputDevice,
    selectOutputDevice,
    forceFixAudio,
    isFixingAudio,
    connectedPeersCount,
    syncAllPeers,
    resumeAudioContext,
  } = useIntercomAudio({
    socket: socketInstance,
    roomId,
    myCallsign: callsign,
    mode,
    isMuted,
    anyRiderSpeaking: riders.some((r) => r.isSpeaking),
    activeDjState,
    setActiveDjState,
  });

  // Handle Mute Toggle
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
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

    // 1. Resume AudioContext instantly during user click gesture to unlock mobile autoplay
    try {
      await resumeAudioContext();
    } catch {}

    // 2. Start silent audio keep-alive to keep mobile OS from suspending in pocket
    startBackgroundAudioKeepAlive();

    // 3. Request initial wake lock
    await requestLock();

    // 4. Request microphone FIRST so audio track is ready before signaling begins
    await initMicrophone();

    // 5. Connect Socket.io
    const socket = io({
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

    // Rider baru bergabung
    socket.on('user-connected', (data: { userId: string; username: string; battery?: number; coords?: [number, number] }) => {
      setRiders((prev) => {
        if (prev.some((r) => r.userId === data.userId)) return prev;
        return [
          ...prev,
          {
            userId: data.userId,
            username: data.username,
            battery: data.battery ?? 100,
            coords: data.coords ?? null,
            heading: null,
            speed: null,
            isMuted: false,
            isSpeaking: false,
            lastSeen: Date.now(),
          },
        ];
      });
    });

    // Rider disconnect / keluar room
    socket.on('user-disconnected', (data: { userId: string } | string) => {
      const disconnectedId = typeof data === 'string' ? data : data?.userId;
      if (!disconnectedId) return;
      console.log('[Socket] User disconnected from room:', disconnectedId);
      setRiders((prev) => prev.filter((r) => r.userId !== disconnectedId));

      // Jika rider yang keluar adalah DJ yang sedang aktif, langsung reset status DJ di App.tsx
      setActiveDjState((current) => {
        if (current && current.activeDjId === disconnectedId) {
          console.log('[DJ] Active DJ disconnected, clearing App.tsx activeDjState');
          return {
            activeDjId: null,
            activeDjName: null,
            isDjActive: false,
            isPlaying: false,
            trackTitle: '',
          };
        }
        return current;
      });
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
              coords: data.coords,
              battery: data.battery,
              heading: data.heading,
              speed: data.speed,
              isMuted: data.isMuted,
              isSpeaking: data.isSpeaking,
              lastSeen: Date.now(),
            },
          ];
        }
      });
    });

    // Convoy Alert Broadcast Listener
    socket.on('convoy-alert', (alert: ConvoyAlert) => {
      console.log('[Alert] Incoming convoy alert:', alert);
      setActiveAlert(alert);
      setAlertHistory((prev) => [alert, ...prev.slice(0, 49)]);
      playIntercomChirp('alert');
    });

    // DJ Music State Broadcast Listener (from Kapten)
    socket.on('dj-music-state', (djState: DJMusicState) => {
      console.log('[DJ] Remote DJ State received:', djState);
      setActiveDjState(djState);
    });

    setIsJoined(true);
  };

  // GPS Geolocation Tracking
  useEffect(() => {
    if (!isJoined) return;

    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, speed } = position.coords;
        const newCoords: [number, number] = [latitude, longitude];

        setMyCoords(newCoords);
        setMyHeading(heading);
        setMySpeed(speed !== null ? Math.round(speed * 3.6) : null); // m/s to km/h

        if (socketRef.current?.connected) {
          socketRef.current.emit('metadata-update', {
            coords: newCoords,
            heading: heading || null,
            speed: speed !== null ? Math.round(speed * 3.6) : null,
          });
        }
      },
      (error) => {
        console.warn('Geolocation watch error:', error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isJoined]);

  // Sync Battery Level across the convoy
  useEffect(() => {
    if (isJoined && socketRef.current?.connected) {
      socketRef.current.emit('metadata-update', {
        battery: batteryLevel,
      });
    }
  }, [batteryLevel, isJoined]);

  // Sync Mute State across the convoy
  useEffect(() => {
    if (isJoined && socketRef.current?.connected) {
      socketRef.current.emit('metadata-update', {
        isMuted,
      });
    }
  }, [isMuted, isJoined]);

  // Send Alert Handler
  const handleSendAlert = (
    type: 'DANGER' | 'REST' | 'POLICE' | 'FUEL' | 'LOST' | 'INFO',
    title: string,
    message: string
  ) => {
    if (!socketRef.current) return;
    const alertData = {
      type,
      title,
      message,
      coords: myCoords,
    };
    socketRef.current.emit('convoy-alert', alertData);
  };

  // Leave room handler
  const handleLeave = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
    }
    setIsJoined(false);
    setRiders([]);
    setActiveAlert(null);
  };

  // Render Lobby screen if not joined
  if (!isJoined) {
    return (
      <div className="h-screen w-screen bg-black text-white flex flex-col justify-between overflow-hidden">
        <LobbyScreen
          defaultCallsign={callsign}
          defaultRoom={roomId}
          defaultMode={mode}
          onJoin={handleJoin}
          batteryLevel={batteryLevel}
        />
      </div>
    );
  }

  const isBluetoothActive =
    activeDeviceLabel.toLowerCase().includes('bluetooth') ||
    activeDeviceLabel.toLowerCase().includes('headset') ||
    activeDeviceLabel.toLowerCase().includes('wireless') ||
    activeDeviceLabel.toLowerCase().includes('sena') ||
    activeDeviceLabel.toLowerCase().includes('cardo') ||
    activeDeviceLabel.toLowerCase().includes('ejeas') ||
    activeDeviceLabel.toLowerCase().includes('freedconn');

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden select-none">
      {/* Top HUD Status Bar */}
      <header className="h-14 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/80 px-3 flex items-center justify-between z-30 shrink-0">
        {/* Left: Branding & Intercom Status */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm tracking-tight">{roomId}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-bold">
                {callsign}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-medium">
              <span className="flex items-center gap-1">
                {isConnected ? (
                  <Wifi className="w-3 h-3 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3 h-3 text-red-400 animate-pulse" />
                )}
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
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* P2P WebRTC Connection Status & One-Tap Re-Sync */}
          {riders.length > 0 && (
            <button
              onClick={syncAllPeers}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold transition active:scale-95 ${
                connectedPeersCount > 0
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/20'
                  : 'bg-amber-950/80 border-amber-500/70 text-amber-300 animate-pulse'
              }`}
              title={
                connectedPeersCount > 0
                  ? `P2P Audio Terhubung (${connectedPeersCount} Rider). Klik untuk Re-sync.`
                  : 'Menghubungkan Audio P2P WebRTC. Klik untuk Paksa Sambung.'
              }
            >
              <Radio className={`w-3.5 h-3.5 ${connectedPeersCount > 0 ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="text-[11px] font-mono">
                {connectedPeersCount > 0 ? `${connectedPeersCount} P2P` : 'Sync P2P'}
              </span>
            </button>
          )}

          {/* Audio Device Switcher & Fix Button */}
          <button
            onClick={() => setIsAudioDeviceModalOpen(true)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold transition active:scale-95 ${
              isBluetoothActive
                ? 'bg-purple-950/80 border-purple-500 text-purple-300 shadow-sm shadow-purple-500/30'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
            }`}
            title="Pengaturan Audio & Bluetooth Helm"
          >
            {isBluetoothActive ? (
              <Bluetooth className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            ) : (
              <Headphones className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span className="hidden sm:inline text-[11px]">{isBluetoothActive ? 'BT Helm' : 'Audio HP'}</span>
          </button>

          {/* Quick Audio Volume Booster Button */}
          <button
            onClick={() => setIsVolumeBoosterOpen(true)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-mono font-bold transition active:scale-95 ${
              receiverVolume > 1.0
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/30'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300'
            }`}
            title="Penguat Volume & Mic Rider"
          >
            <Zap className={`w-3.5 h-3.5 ${receiverVolume > 1.0 ? 'text-emerald-400' : 'text-zinc-400'}`} />
            <span>{Math.round(receiverVolume * 100)}%</span>
          </button>

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
        onOpenBooster={() => setIsVolumeBoosterOpen(true)}
        onOpenAudioDevices={() => setIsAudioDeviceModalOpen(true)}
        activeDeviceLabel={activeDeviceLabel}
        receiverVolume={receiverVolume}
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

      {/* Audio Device & Bluetooth Helm Modal */}
      <AudioDeviceModal
        isOpen={isAudioDeviceModalOpen}
        onClose={() => setIsAudioDeviceModalOpen(false)}
        activeDeviceLabel={activeDeviceLabel}
        inputDevices={inputDevices}
        outputDevices={outputDevices}
        selectedInputId={selectedInputId}
        selectedOutputId={selectedOutputId}
        onSelectInputDevice={selectInputDevice}
        onSelectOutputDevice={selectOutputDevice}
        onForceFixAudio={forceFixAudio}
        isFixingAudio={isFixingAudio}
        audioStatus={audioStatus}
      />

      {/* DJ Kapten Music Sharing Modal */}
      <DJMusicModal
        isOpen={isDJModalOpen}
        onClose={() => setIsDJModalOpen(false)}
        isDjMode={isDjMode}
        onToggleDjMode={toggleDjMode}
        onResetDjLock={resetDjLock}
        isDjLockedByOther={isDjLockedByOther}
        activeDjName={activeDjState?.activeDjName}
        isDjOwner={isDjOwner}
        trackTitle={musicTrackTitle}
        isPlaying={isMusicPlaying}
        volume={musicVolume}
        onVolumeChange={setMusicVolume}
        receiverVolume={receiverVolume}
        onReceiverVolumeChange={setReceiverVolume}
        micBoost={micBoost}
        onMicBoostChange={setMicBoost}
        isDucked={isDucked}
        playlist={playlist}
        currentTrackIndex={currentTrackIndex}
        sortMode={sortMode}
        onSetSortMode={setPlaylistSortMode}
        onLoadFiles={loadMusicFiles}
        onLoadDemoTracks={loadDemoTouringTracks}
        onSelectTrack={playTrackAtIndex}
        onNextTrack={playNextTrack}
        onPrevTrack={playPrevTrack}
        onTogglePlay={togglePlayMusic}
        onStop={stopMusic}
      />

      {/* Volume Booster Modal (Penguat Suara Rider & Mic Preamp) */}
      <VolumeBoosterModal
        isOpen={isVolumeBoosterOpen}
        onClose={() => setIsVolumeBoosterOpen(false)}
        receiverVolume={receiverVolume}
        onReceiverVolumeChange={setReceiverVolume}
        micBoost={micBoost}
        onMicBoostChange={setMicBoost}
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
