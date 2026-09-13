import React from 'react';
import {
  Mic,
  MicOff,
  Radio,
  AlertTriangle,
  BatteryCharging,
  Users,
  Volume2,
  VolumeX,
  Music,
  Zap,
  Headphones,
  Bluetooth,
} from 'lucide-react';
import { IntercomMode } from '../types';

interface RiderControlsProps {
  mode: IntercomMode;
  onToggleMode: () => void;
  isMuted: boolean;
  isTransmitting: boolean;
  isSpeaking: boolean;
  isWakeLocked?: boolean;
  onToggleWakeLock?: () => void;
  onToggleMute: () => void;
  onPttStart: () => void;
  onPttEnd: () => void;
  onOpenAlerts: () => void;
  onOpenRiderList: () => void;
  onOpenBatteryGuide: () => void;
  onOpenDJModal: () => void;
  onOpenBooster?: () => void;
  onOpenAudioDevices?: () => void;
  activeDeviceLabel?: string;
  receiverVolume?: number;
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
  onToggleMute,
  onPttStart,
  onPttEnd,
  onOpenAlerts,
  onOpenRiderList,
  onOpenBatteryGuide,
  onOpenDJModal,
  onOpenBooster,
  onOpenAudioDevices,
  activeDeviceLabel = 'Audio HP',
  receiverVolume = 1.35,
  isDjActive,
  isPlayingMusic,
  connectedCount,
}) => {
  const isBluetooth =
    activeDeviceLabel.toLowerCase().includes('bluetooth') ||
    activeDeviceLabel.toLowerCase().includes('headset') ||
    activeDeviceLabel.toLowerCase().includes('wireless') ||
    activeDeviceLabel.toLowerCase().includes('sena') ||
    activeDeviceLabel.toLowerCase().includes('cardo') ||
    activeDeviceLabel.toLowerCase().includes('ejeas') ||
    activeDeviceLabel.toLowerCase().includes('freedconn');

  return (
    <div className="w-full bg-zinc-950/95 backdrop-blur-lg border-t border-zinc-800/80 px-2 sm:px-3 pt-2.5 sm:pt-3 pb-safe z-30 flex flex-col gap-2 sm:gap-2.5">
      {/* Top Quick Action Bar - Proportional 6-Column Responsive Grid (No Overflow) */}
      <div className="w-full grid grid-cols-6 gap-1 sm:gap-1.5">
        {/* Mode Toggle (Always ON vs PTT) */}
        <button
          onClick={onToggleMode}
          className={`h-11 sm:h-12 px-1 sm:px-2 rounded-xl border flex items-center justify-center gap-1 sm:gap-1.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider transition-all active:scale-95 min-w-0 ${
            mode === 'ALWAYS_ON'
              ? 'bg-zinc-900 border-emerald-500 text-emerald-400'
              : 'bg-zinc-900 border-amber-500 text-amber-400'
          }`}
          title={mode === 'ALWAYS_ON' ? 'Mode: Always-ON (Mic Terus Aktif)' : 'Mode: Push-To-Talk (Tekan Bicara)'}
        >
          <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">{mode === 'ALWAYS_ON' ? 'ON' : 'PTT'}</span>
        </button>

        {/* Audio Device & Headset Switcher Button */}
        {onOpenAudioDevices ? (
          <button
            onClick={onOpenAudioDevices}
            className={`h-11 sm:h-12 px-1 sm:px-2 rounded-xl border flex items-center justify-center gap-1 sm:gap-1.5 font-bold text-[10px] sm:text-xs transition-all active:scale-95 min-w-0 ${
              isBluetooth
                ? 'bg-purple-950/80 border-purple-500 text-purple-300 shadow-md shadow-purple-950/40'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
            }`}
            title="Pindah Audio / Bluetooth Helm"
          >
            {isBluetooth ? (
              <Bluetooth className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 animate-pulse shrink-0" />
            ) : (
              <Headphones className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 shrink-0" />
            )}
            <span className="truncate hidden xs:inline sm:inline">{isBluetooth ? 'BT' : 'HP'}</span>
          </button>
        ) : (
          <div />
        )}

        {/* DJ Music Button */}
        <button
          onClick={onOpenDJModal}
          className={`h-11 sm:h-12 px-1 sm:px-2 rounded-xl border flex items-center justify-center gap-1 sm:gap-1.5 font-bold text-[10px] sm:text-xs transition-all active:scale-95 min-w-0 ${
            isDjActive || isPlayingMusic
              ? 'bg-purple-950/80 border-purple-500 text-purple-300 shadow-md shadow-purple-950/40'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="DJ Musik (Musik Bersama)"
        >
          <Music className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isPlayingMusic ? 'text-purple-400 animate-pulse' : ''}`} />
          <span className="truncate hidden xs:inline sm:inline">DJ</span>
        </button>

        {/* Volume & Mic Booster Button */}
        {onOpenBooster ? (
          <button
            onClick={onOpenBooster}
            className={`h-11 sm:h-12 px-1 sm:px-2 rounded-xl border flex items-center justify-center gap-0.5 sm:gap-1 font-bold text-[10px] sm:text-xs transition-all active:scale-95 min-w-0 ${
              receiverVolume > 1.0
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/40'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Penguat Volume & Mic Rider"
          >
            <Zap className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${receiverVolume > 1.0 ? 'text-emerald-400' : 'text-zinc-400'}`} />
            <span className="font-mono text-[9px] sm:text-[11px] font-black truncate">{Math.round(receiverVolume * 100)}%</span>
          </button>
        ) : (
          <div />
        )}

        {/* Convoy Rider List */}
        <button
          onClick={onOpenRiderList}
          className="h-11 sm:h-12 px-1 sm:px-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center gap-1 sm:gap-1.5 font-bold text-[10px] sm:text-xs active:scale-95 min-w-0"
          title="Daftar Rider"
        >
          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
          <span className="font-bold">{connectedCount}</span>
        </button>

        {/* Hazard / Convoy Alert (Warning) Button */}
        <button
          onClick={onOpenAlerts}
          className="h-11 sm:h-12 px-1 sm:px-2 rounded-xl bg-red-950/80 border border-red-500 text-red-300 hover:text-white flex items-center justify-center gap-1 sm:gap-1.5 font-black text-[10px] sm:text-xs uppercase tracking-wider active:scale-95 shadow-lg shadow-red-950/40 min-w-0"
          title="Kirim Peringatan Bahaya & Konvoi (Alert)"
        >
          <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400 animate-pulse shrink-0" />
          <span className="truncate">Alert</span>
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
