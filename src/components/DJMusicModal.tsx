import React, { useRef } from 'react';
import {
  Music,
  Play,
  Pause,
  Square,
  Volume2,
  Mic,
  Disc3,
  X,
  Radio,
  FolderOpen,
  FilePlus,
  SkipForward,
  SkipBack,
  Shuffle,
  SortAsc,
  Clock,
  Lock,
  Crown,
  ShieldCheck,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { MusicTrack } from '../types';

interface DJMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDjMode: boolean;
  onToggleDjMode: (enable: boolean) => void;
  onResetDjLock?: () => void;
  isDjLockedByOther?: boolean;
  activeDjName?: string | null;
  isDjOwner?: boolean;
  trackTitle: string;
  isPlaying: boolean;
  volume: number; // Kapten local music volume
  onVolumeChange: (vol: number) => void;
  receiverVolume?: number;
  onReceiverVolumeChange?: (vol: number) => void;
  micBoost?: number;
  onMicBoostChange?: (boost: number) => void;
  isDucked: boolean;
  playlist: MusicTrack[];
  currentTrackIndex: number;
  sortMode: 'NAME' | 'SHUFFLE' | 'DATE';
  onSetSortMode: (mode: 'NAME' | 'SHUFFLE' | 'DATE') => void;
  onLoadFiles: (files: File[]) => void;
  onLoadDemoTracks?: () => void;
  onSelectTrack: (index: number) => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
}

export const DJMusicModal: React.FC<DJMusicModalProps> = ({
  isOpen,
  onClose,
  isDjMode,
  onToggleDjMode,
  onResetDjLock,
  isDjLockedByOther = false,
  activeDjName = null,
  isDjOwner = false,
  trackTitle,
  isPlaying,
  volume,
  onVolumeChange,
  receiverVolume = 1.35,
  onReceiverVolumeChange,
  micBoost = 1.5,
  onMicBoostChange,
  playlist,
  currentTrackIndex,
  sortMode,
  onSetSortMode,
  onLoadFiles,
  onLoadDemoTracks,
  onSelectTrack,
  onNextTrack,
  onPrevTrack,
  onTogglePlay,
  onStop,
}) => {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDjLockedByOther) return;
    if (e.target.files && e.target.files.length > 0) {
      onLoadFiles(Array.from(e.target.files));
      if (!isDjMode) onToggleDjMode(true);
    }
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDjLockedByOther) return;
    if (e.target.files && e.target.files.length > 0) {
      onLoadFiles(Array.from(e.target.files));
      if (!isDjMode) onToggleDjMode(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl flex flex-col gap-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/40 text-purple-400">
              <Disc3 className={`w-6 h-6 ${isPlaying ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-black tracking-wider text-white uppercase flex items-center gap-2">
                <span>DJ KAPTEN</span>
                <span className="text-[10px] bg-purple-500 text-zinc-950 px-2 py-0.5 rounded-full font-bold">
                  P2P AUDIO
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Pilih folder/file MP3 untuk diputar bersama saat touring
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Exclusive DJ Lock Alert Banner (When Another Rider is DJ) */}
        {isDjLockedByOther && (
          <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0 animate-pulse" />
              <div className="text-xs leading-snug">
                <div className="font-bold text-amber-200">
                  DJ Sedang Dikuasai oleh: <span className="text-amber-400 uppercase">{activeDjName || 'Rider Lain'}</span>
                </div>
                <div className="text-[11px] text-amber-300/80 mt-0.5">
                  Jika pengguna telah keluar atau terputus, klik Reset DJ untuk mengambil alih kontrol musik.
                </div>
              </div>
            </div>
            {onResetDjLock && (
              <button
                type="button"
                onClick={onResetDjLock}
                className="self-end sm:self-center px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 hover:text-amber-100 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors shrink-0 shadow"
                title="Bebaskan kursi DJ jika pengontrol sebelumnya telah keluar"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset DJ</span>
              </button>
            )}
          </div>
        )}

        {/* DJ Kapten Mode Toggle Box */}
        <div
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
            isDjLockedByOther
              ? 'bg-zinc-950/70 border-zinc-800 opacity-80'
              : isDjOwner
              ? 'bg-purple-950/40 border-purple-500/60 shadow-lg shadow-purple-950/30'
              : 'bg-zinc-950 border-zinc-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {isDjLockedByOther ? (
              <Lock className="w-5 h-5 text-amber-500 shrink-0" />
            ) : isDjOwner ? (
              <Crown className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
            ) : (
              <Radio className={`w-5 h-5 ${isDjMode ? 'text-purple-400' : 'text-zinc-500'} shrink-0`} />
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-white uppercase flex items-center gap-1.5 truncate">
                <span>Status DJ Kapten</span>
                {isDjOwner && (
                  <span className="text-[10px] bg-amber-500 text-zinc-950 px-1.5 py-0.2 rounded font-black">
                    ANDA DJ
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {isDjLockedByOther
                  ? `Dikuasai oleh ${activeDjName || 'rider lain'}`
                  : isDjOwner
                  ? 'Anda sedang mengontrol audio musik konvoi'
                  : 'Siapapun dapat klaim (1 orang saja)'}
              </div>
            </div>
          </div>

          <button
            onClick={() => onToggleDjMode(!isDjMode)}
            disabled={isDjLockedByOther}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 flex items-center gap-1.5 ${
              isDjLockedByOther
                ? 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/60 cursor-not-allowed opacity-60'
                : isDjOwner
                ? 'bg-red-950/80 border border-red-500/80 text-red-300 hover:bg-red-900 shadow-lg'
                : 'bg-purple-500 text-zinc-950 hover:bg-purple-400 shadow-lg shadow-purple-500/30'
            }`}
          >
            {isDjLockedByOther ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>TERKUNCI</span>
              </>
            ) : isDjOwner ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>LEPAS DJ</span>
              </>
            ) : (
              <span>AKTIFKAN</span>
            )}
          </button>
        </div>

        {/* File & Folder Pickers */}
        <div
          className={`p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-3 ${
            isDjLockedByOther ? 'opacity-40 pointer-events-none select-none' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
              Pilih Sumber Musik
            </span>
            <span className="text-[10px] text-purple-400 font-mono bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/40">
              {playlist.length} Lagu Dimuat
            </span>
          </div>

          {/* Hidden inputs for folder and files */}
          <input
            ref={folderInputRef}
            type="file"
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            webkitdirectory=""
            directory=""
            multiple
            accept="audio/*"
            className="hidden"
            onChange={handleFolderChange}
          />
          <input
            ref={filesInputRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.aac,.ogg,.m4a,.wav"
            className="hidden"
            onChange={handleFilesChange}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={isDjLockedByOther}
              className="py-3 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-600/40 text-xs font-bold text-purple-200 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
            >
              <FolderOpen className="w-4 h-4 text-purple-400" />
              <span>Pilih Folder Musik</span>
            </button>

            <button
              onClick={() => filesInputRef.current?.click()}
              disabled={isDjLockedByOther}
              className="py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-zinc-200 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
            >
              <FilePlus className="w-4 h-4 text-emerald-400" />
              <span>Pilih Berkas MP3</span>
            </button>
          </div>

          {onLoadDemoTracks && (
            <button
              onClick={onLoadDemoTracks}
              disabled={isDjLockedByOther}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-900/40 via-indigo-900/40 to-purple-900/40 hover:from-purple-800/50 hover:to-indigo-800/50 border border-purple-500/30 text-xs font-bold text-purple-200 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
            >
              <Music className="w-4 h-4 text-purple-400 animate-pulse" />
              <span>Putar Demo Musik Touring (Tanpa File)</span>
            </button>
          )}

          {/* Current track indicator */}
          <div className="text-xs font-bold truncate text-zinc-200 flex items-center gap-2 pt-1 border-t border-zinc-800/80">
            <Music className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="truncate">
              {trackTitle ? `Diputar: ${trackTitle}` : 'Belum ada lagu yang dipilih'}
            </span>
          </div>
        </div>

        {/* Playlist & Sorting Controls */}
        {playlist.length > 0 && (
          <div
            className={`p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2.5 ${
              isDjLockedByOther ? 'opacity-50 pointer-events-none select-none' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                Urutan Playlist
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSetSortMode('NAME')}
                  className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                    sortMode === 'NAME'
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <SortAsc className="w-3 h-3" />
                  <span>A - Z</span>
                </button>
                <button
                  onClick={() => onSetSortMode('SHUFFLE')}
                  className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                    sortMode === 'SHUFFLE'
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Shuffle className="w-3 h-3" />
                  <span>Acak</span>
                </button>
                <button
                  onClick={() => onSetSortMode('DATE')}
                  className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                    sortMode === 'DATE'
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>Waktu</span>
                </button>
              </div>
            </div>

            {/* Scrollable list */}
            <div className="max-h-36 overflow-y-auto pr-1 flex flex-col gap-1">
              {playlist.map((track, idx) => {
                const isActive = idx === currentTrackIndex;
                return (
                  <button
                    key={`${track.name}-${idx}`}
                    onClick={() => onSelectTrack(idx)}
                    disabled={isDjLockedByOther}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-all ${
                      isActive
                        ? 'bg-purple-950 border border-purple-500/80 text-purple-200 font-bold'
                        : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 font-normal border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[10px] opacity-60 w-4 shrink-0">{idx + 1}.</span>
                      <span className="truncate">{track.title}</span>
                    </div>
                    {isActive && isPlaying && (
                      <span className="text-[10px] text-purple-400 font-bold shrink-0 ml-2">
                        ▶ PUTAR
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Playback Controls with Prev / Next */}
        <div
          className={`flex items-center gap-2 ${
            isDjLockedByOther ? 'opacity-50 pointer-events-none select-none' : ''
          }`}
        >
          <button
            onClick={onPrevTrack}
            disabled={playlist.length === 0 || isDjLockedByOther}
            className="w-14 h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 flex items-center justify-center active:scale-95 transition-all"
            title="Lagu Sebelumnya"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={onTogglePlay}
            disabled={(!trackTitle && playlist.length === 0) || isDjLockedByOther}
            className={`flex-1 h-14 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl active:scale-98 ${
              (!trackTitle && playlist.length === 0) || isDjLockedByOther
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800'
                : isPlaying
                ? 'bg-amber-500 text-zinc-950 shadow-amber-500/30'
                : 'bg-purple-500 text-zinc-950 shadow-purple-500/30'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-5 h-5" />
                <span>JEDA</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>PUTAR</span>
              </>
            )}
          </button>

          <button
            onClick={onNextTrack}
            disabled={playlist.length === 0 || isDjLockedByOther}
            className="w-14 h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 flex items-center justify-center active:scale-95 transition-all"
            title="Lagu Berikutnya"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            onClick={onStop}
            disabled={(!trackTitle && playlist.length === 0) || isDjLockedByOther}
            className="w-14 h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40 text-zinc-300 flex items-center justify-center active:scale-95 transition-all"
            title="Stop Musik"
          >
            <Square className="w-5 h-5" />
          </button>
        </div>

        {/* Volume Sliders (DJ Local & Intercom Receiver Amplified) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* DJ Music Volume */}
          <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-zinc-300">
                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                <span>{isDjOwner ? 'Volume Musik DJ (Master)' : 'Volume Musik DJ di Helm'}</span>
              </div>
              <span className="font-mono text-purple-400 font-bold">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-purple-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />
            {/* Quick preset buttons for gloves */}
            <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
              <button
                type="button"
                onClick={() => onVolumeChange(0)}
                className={`px-1.5 py-0.5 rounded transition ${volume === 0 ? 'bg-purple-600 text-white font-bold' : 'hover:text-purple-400'}`}
              >
                Mute
              </button>
              <button
                type="button"
                onClick={() => onVolumeChange(0.5)}
                className={`px-1.5 py-0.5 rounded transition ${Math.abs(volume - 0.5) < 0.04 ? 'bg-purple-600 text-white font-bold' : 'hover:text-purple-400'}`}
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => onVolumeChange(0.8)}
                className={`px-1.5 py-0.5 rounded transition ${Math.abs(volume - 0.8) < 0.04 ? 'bg-purple-600 text-white font-bold' : 'hover:text-purple-400'}`}
              >
                80%
              </button>
              <button
                type="button"
                onClick={() => onVolumeChange(1.0)}
                className={`px-1.5 py-0.5 rounded transition ${volume === 1.0 ? 'bg-purple-600 text-white font-bold' : 'hover:text-purple-400'}`}
              >
                100%
              </button>
            </div>
          </div>

          {/* Receiver Volume with Super Boost */}
          {onReceiverVolumeChange && (
            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-zinc-300">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Volume Intercom Rider</span>
                </div>
                <div className="flex items-center gap-1">
                  {receiverVolume > 1.0 && (
                    <span className="text-[10px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-bold">
                      BOOST
                    </span>
                  )}
                  <span className="font-mono text-emerald-400 font-bold">
                    {Math.round(receiverVolume * 100)}%
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="2.5"
                step="0.05"
                value={receiverVolume}
                onChange={(e) => onReceiverVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
                <span>100%</span>
                <button
                  type="button"
                  onClick={() => onReceiverVolumeChange(1.5)}
                  className={`px-1.5 py-0.5 rounded transition ${receiverVolume === 1.5 ? 'bg-emerald-500 text-black font-bold' : 'hover:text-emerald-400'}`}
                >
                  150%
                </button>
                <button
                  type="button"
                  onClick={() => onReceiverVolumeChange(2.0)}
                  className={`px-1.5 py-0.5 rounded transition ${receiverVolume === 2.0 ? 'bg-emerald-500 text-black font-bold' : 'hover:text-emerald-400'}`}
                >
                  200%
                </button>
                <button
                  type="button"
                  onClick={() => onReceiverVolumeChange(2.5)}
                  className={`px-1.5 py-0.5 rounded transition ${receiverVolume === 2.5 ? 'bg-emerald-500 text-black font-bold' : 'hover:text-emerald-400'}`}
                >
                  MAX (250%)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mic Preamp Boost Slider */}
        {onMicBoostChange && (
          <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-zinc-300">
                <Mic className="w-3.5 h-3.5 text-amber-400" />
                <span>Preamp Sensitivitas Mic Saya</span>
              </div>
              <div className="flex items-center gap-1">
                {micBoost < 1.0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-bold">
                    REDAM BISING
                  </span>
                ) : micBoost > 1.0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded font-bold">
                    +3.5dB BOOST
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded font-bold">
                    STANDAR
                  </span>
                )}
                <span className="font-mono text-amber-400 font-bold">
                  {Math.round(micBoost * 100)}%
                </span>
              </div>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={micBoost}
              onChange={(e) => onMicBoostChange(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />
          </div>
        )}

        {/* Stable Music Volume Indicator */}
        <div
          className="p-3 rounded-2xl border flex items-center gap-3 transition-all bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
        >
          <div
            className="p-2 rounded-xl shrink-0 bg-emerald-500/20 text-emerald-400"
          >
            <Sliders className="w-4 h-4" />
          </div>
          <div className="text-xs leading-snug">
            <div className="font-bold flex items-center gap-1.5">
              <span>Volume Musik:</span>
              <span className="text-emerald-300 font-black">
                Stabil Penuh (100% Mengikuti Slider)
              </span>
            </div>
            <div className="text-[11px] opacity-80 mt-0.5">
              Auto-ducking dinonaktifkan. Volume musik tidak akan mengecil atau berfluktuasi saat ada yang berbicara, murni stabil sesuai posisi tombol slider.
            </div>
          </div>
        </div>

        {/* Technical Notice */}
        <p className="text-[10px] text-zinc-500 text-center leading-tight">
          💡 Remote audio stream dialirkan langsung ke elemen audio & speaker/headset Bluetooth, menjaga kestabilan suara di latar belakang.
        </p>
      </div>
    </div>
  );
};
