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
  VolumeX,
} from 'lucide-react';
import { MusicTrack, DJCaptainState } from '../types';

interface DJMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDjMode: boolean;
  onToggleDjMode: (enable: boolean) => void;
  trackTitle: string;
  isPlaying: boolean;
  volume: number; // Kapten local music volume
  onVolumeChange: (vol: number) => void;
  receiverVolume?: number;
  onReceiverVolumeChange?: (vol: number) => void;
  isDucked: boolean;
  playlist: MusicTrack[];
  currentTrackIndex: number;
  sortMode: 'NAME' | 'SHUFFLE' | 'DATE';
  onSetSortMode: (mode: 'NAME' | 'SHUFFLE' | 'DATE') => void;
  onLoadFiles: (files: File[]) => void;
  onSelectTrack: (index: number) => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  djCaptain: DJCaptainState | null;
  isCurrentRiderCaptain: boolean;
  canControlMusic: boolean;
  onAcquireCaptain: () => void;
  onReleaseCaptain: () => void;
}

export const DJMusicModal: React.FC<DJMusicModalProps> = ({
  isOpen,
  onClose,
  isDjMode,
  onToggleDjMode,
  trackTitle,
  isPlaying,
  volume,
  onVolumeChange,
  receiverVolume = 1.0,
  onReceiverVolumeChange,
  isDucked,
  playlist,
  currentTrackIndex,
  sortMode,
  onSetSortMode,
  onLoadFiles,
  onSelectTrack,
  onNextTrack,
  onPrevTrack,
  onTogglePlay,
  onStop,
  djCaptain,
  isCurrentRiderCaptain,
  canControlMusic,
  onAcquireCaptain,
  onReleaseCaptain,
}) => {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onLoadFiles(Array.from(e.target.files));
      if (!isDjMode) onToggleDjMode(true);
    }
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        {/* DJ Kapten Mode Toggle */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
          <div className="flex items-center gap-3">
            <Radio className={`w-5 h-5 ${isDjMode ? 'text-purple-400' : 'text-zinc-500'}`} />
            <div>
              <div className="text-xs font-bold text-white uppercase">Status DJ Kapten</div>
              <div className="text-[11px] text-zinc-400">
                {isCurrentRiderCaptain
                  ? 'Anda memegang kendali musik'
                  : djCaptain
                    ? `Dipakai ${djCaptain.djName}`
                    : 'Belum ada kapten musik'}
              </div>
            </div>
          </div>

          <button
            onClick={isCurrentRiderCaptain ? onReleaseCaptain : onAcquireCaptain}
            disabled={!!djCaptain && !isCurrentRiderCaptain}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              isCurrentRiderCaptain
                ? 'bg-purple-500 text-zinc-950 shadow-lg shadow-purple-500/30'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50'
            }`}
          >
            {isCurrentRiderCaptain ? 'LEPASKAN' : djCaptain ? 'TERKUNCI' : 'AMBIL KAPTEN'}
          </button>
        </div>

        {/* File & Folder Pickers */}
        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-3">
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
              disabled={!canControlMusic}
              className="py-3 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-600/40 text-xs font-bold text-purple-200 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <FolderOpen className="w-4 h-4 text-purple-400" />
              <span>Pilih Folder Musik</span>
            </button>

            <button
              onClick={() => filesInputRef.current?.click()}
              disabled={!canControlMusic}
              className="py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-zinc-200 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <FilePlus className="w-4 h-4 text-emerald-400" />
              <span>Pilih Berkas MP3</span>
            </button>
          </div>

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
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2.5">
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
                    disabled={!canControlMusic}
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
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevTrack}
            disabled={!canControlMusic || playlist.length === 0}
            className="w-14 h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 flex items-center justify-center active:scale-95 transition-all"
            title="Lagu Sebelumnya"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={onTogglePlay}
            disabled={!canControlMusic || (!trackTitle && playlist.length === 0)}
            className={`flex-1 h-14 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl active:scale-98 ${
              !trackTitle && playlist.length === 0
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
            disabled={!canControlMusic || playlist.length === 0}
            className="w-14 h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 flex items-center justify-center active:scale-95 transition-all"
            title="Lagu Berikutnya"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            onClick={onStop}
            disabled={!canControlMusic || (!trackTitle && playlist.length === 0)}
            className="w-14 h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40 text-zinc-300 flex items-center justify-center active:scale-95 transition-all"
            title="Stop Musik"
          >
            <Square className="w-5 h-5" />
          </button>
        </div>

        {/* Volume Sliders (DJ Local & Intercom Receiver) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* DJ Music Volume */}
          <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-zinc-300">
                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Volume Musik DJ</span>
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
          </div>

          {/* Receiver Volume */}
          {onReceiverVolumeChange && (
            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-zinc-300">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Volume Intercom Teman</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold">
                  {Math.round(receiverVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={receiverVolume}
                onChange={(e) => onReceiverVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Direct Audio Routing Indicator */}
        <div
          className="p-3 rounded-2xl border flex items-center gap-3 transition-all bg-sky-950/40 border-sky-800/60 text-sky-200"
        >
          <div
            className="p-2 rounded-xl shrink-0 bg-sky-500/20 text-sky-400"
          >
            <Mic className="w-4 h-4" />
          </div>
          <div className="text-xs leading-snug">
            <div className="font-bold flex items-center gap-1.5">
              <span>Audio Routing:</span>
              <span className="text-sky-300 font-black">
                Direct (Gain Statis)
              </span>
            </div>
            <div className="text-[11px] opacity-80 mt-0.5">
              Auto-ducking dinonaktifkan. Volume musik dan percakapan interkom berjalan murni pada level normal tanpa manipulasi dinamis.
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
