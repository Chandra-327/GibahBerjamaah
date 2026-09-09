import React from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Volume2,
  VolumeX,
  Sun,
  SunDim,
  AlertTriangle,
  BatteryCharging,
  Users,
  Music,
} from 'lucide-react';
import { IntercomMode } from '../types';

interface RiderControlsProps {
  mode: IntercomMode;
  onToggleMode: () => void;
  isMuted: boolean;
  isTransmitting: boolean;
  isSpeaking: boolean;
  isWakeLocked: boolean;
  onToggleWakeLock: () => void;
  onToggleMute: () => void;
  onPttStart: () => void;
  onPttEnd: () => void;
  onOpenAlerts: () => void;
  onOpenRiderList: () => void;
  onOpenBatteryGuide: () => void;
  onOpenDJModal: () => void;
  isDjActive: boolean;
  isPlayingMusic: boolean;
  connectedCount: number;
}

export const RiderControls: React.FC<RiderControlsProps> = ({
  mode,
  onToggleMode,
  isMuted,
  isTransmitting,
  isSpeaking,
  isWakeLocked,
  onToggleWakeLock,
  onToggleMute,
  onPttStart,
  onPttEnd,
  onOpenAlerts,
  onOpenRiderList,
  onOpenBatteryGuide,
  onOpenDJModal,
  isDjActive,
  isPlayingMusic,
  connectedCount,
}) => {
  return (
    <div className="w-full bg-zinc-950/95 backdrop-blur-lg border-t border-zinc-800/80 px-3 pt-3 pb-safe z-30 flex flex-col gap-2.5">
      {/* Top Quick Action Bar */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Mode Toggle (Always ON vs PTT) */}
        <button
          onClick={onToggleMode}
          className={`flex-1 h-12 px-2.5 sm:px-3 rounded-xl border flex items-center justify-center gap-1.5 sm:gap-2 font-bold text-xs uppercase tracking-wider transition-all active:scale-98 ${
            mode === 'ALWAYS_ON'
              ? 'bg-zinc-900 border-emerald-500 text-emerald-400'
              : 'bg-zinc-900 border-amber-500 text-amber-400'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>{mode === 'ALWAYS_ON' ? 'Always-ON' : 'Push-To-Talk'}</span>
        </button>

        {/* Screen Wake Lock */}
        <button
          onClick={onToggleWakeLock}
          className={`h-12 px-3 rounded-xl border flex items-center gap-1.5 font-bold text-xs transition-all active:scale-95 ${
            isWakeLocked
              ? 'bg-amber-950/50 border-amber-500 text-amber-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}
          title="Keep Screen Awake"
        >
          {isWakeLocked ? <Sun className="w-4 h-4" /> : <SunDim className="w-4 h-4" />}
          <span className="hidden sm:inline">{isWakeLocked ? 'Wake: ON' : 'Wake: OFF'}</span>
        </button>

        {/* Convoy Rider List */}
        <button
          onClick={onOpenRiderList}
          className="h-12 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white flex items-center gap-1.5 font-bold text-xs active:scale-95"
          title="Daftar Rider"
        >
          <Users className="w-4 h-4 text-emerald-400" />
          <span>{connectedCount}</span>
        </button>

        {/* DJ Music Button (Secondary/Access) */}
        <button
          onClick={onOpenDJModal}
          className={`h-12 px-2.5 rounded-xl border flex items-center justify-center font-bold text-xs transition-all active:scale-95 ${
            isDjActive || isPlayingMusic
              ? 'bg-purple-950/80 border-purple-500 text-purple-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
          }`}
          title="DJ Musik (Musik Bersama)"
        >
          <Music className={`w-4 h-4 ${isPlayingMusic ? 'text-purple-400 animate-pulse' : ''}`} />
        </button>

        {/* Hazard / Convoy Alert Button */}
        <button
          onClick={onOpenAlerts}
          className="h-12 px-3 rounded-xl bg-red-950/60 border border-red-600/80 text-red-400 flex items-center gap-1.5 font-black text-xs uppercase tracking-wider active:scale-95 shadow-lg shadow-red-950/40 animate-pulse"
          title="Kirim Peringatan Bahaya"
        >
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="hidden sm:inline">Alert</span>
        </button>
      </div>

      {/* Main Massive Glove-Friendly Controls */}
      <div className="flex items-center gap-2.5">
        {/* Mute / Unmute Button */}
        <button
          onClick={onToggleMute}
          className={`h-20 w-24 rounded-2xl flex flex-col items-center justify-center gap-1 font-black text-xs uppercase tracking-wider transition-all border shadow-lg active:scale-95 ${
            isMuted
              ? 'bg-red-950/80 border-red-500 text-red-300 shadow-red-900/30'
              : 'bg-zinc-900 border-emerald-500 text-emerald-400'
          }`}
        >
          {isMuted ? <MicOff className="w-6 h-6 text-red-400" /> : <Mic className="w-6 h-6 text-emerald-400" />}
          <span>{isMuted ? 'Muted' : 'Mic ON'}</span>
        </button>

        {/* Big PTT / Transmit Button */}
        {mode === 'PTT' ? (
          <button
            onMouseDown={onPttStart}
            onMouseUp={onPttEnd}
            onTouchStart={(e) => {
              e.preventDefault();
              onPttStart();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              onPttEnd();
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={`flex-1 h-20 rounded-2xl border-2 flex flex-col items-center justify-center font-black text-base uppercase tracking-widest transition-all select-none shadow-2xl ${
              isTransmitting
                ? 'bg-emerald-500 border-white text-zinc-950 scale-[0.98] ring-4 ring-emerald-400 animate-speaking'
                : 'bg-zinc-900 border-zinc-700 text-zinc-300 active:scale-95'
            }`}
          >
            <div className="flex items-center gap-2">
              <Radio className={`w-6 h-6 ${isTransmitting ? 'animate-spin' : ''}`} />
              <span>{isTransmitting ? 'TRANSMITTING...' : 'TEKAN UNTUK GIBAH (PTT)'}</span>
            </div>
            <span className="text-[10px] font-normal tracking-normal text-zinc-400 mt-0.5">
              {isTransmitting ? 'Lepas untuk berhenti' : 'Tahan tombol saat berbicara'}
            </span>
          </button>
        ) : (
          <div
            className={`flex-1 h-20 rounded-2xl border-2 flex flex-col items-center justify-center font-black text-base uppercase tracking-wider transition-all shadow-xl ${
              isMuted
                ? 'bg-zinc-900 border-zinc-800 text-zinc-500'
                : isSpeaking
                ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 ring-4 ring-emerald-500/50 animate-speaking'
                : 'bg-zinc-900 border-zinc-700 text-zinc-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {isMuted ? (
                <VolumeX className="w-6 h-6 text-zinc-500" />
              ) : (
                <Volume2 className={`w-6 h-6 ${isSpeaking ? 'text-emerald-400 animate-bounce' : 'text-zinc-400'}`} />
              )}
              <span>
                {isMuted ? 'MIC DIMATIKAN' : isSpeaking ? 'ANDA SEDANG GIBAH...' : 'ALWAYS-ON (STANDBY)'}
              </span>
            </div>
            <span className="text-[10px] font-normal tracking-normal text-zinc-400 mt-0.5">
              {isMuted ? 'Tekan tombol Mic ON untuk berbicara' : 'Noise suppression angin & mesin aktif'}
            </span>
          </div>
        )}
      </div>

      {/* Footer Info & Battery Instruction Hint */}
      <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500 font-medium">
        <button
          onClick={onOpenBatteryGuide}
          className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
        >
          <BatteryCharging className="w-3.5 h-3.5" />
          <span>Setting Baterai HP "Unrestricted"</span>
        </button>
        <span className="text-zinc-600 font-mono">WebRTC Mesh + STB</span>
      </div>
    </div>
  );
};
