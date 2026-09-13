import React from 'react';
import {
  Volume2,
  Mic,
  Zap,
  ShieldCheck,
  Sparkles,
  Wind,
  X,
  Volume1,
  VolumeX,
} from 'lucide-react';

interface VolumeBoosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiverVolume: number;
  onReceiverVolumeChange: (vol: number) => void;
  micBoost: number;
  onMicBoostChange: (boost: number) => void;
}

export const VolumeBoosterModal: React.FC<VolumeBoosterModalProps> = ({
  isOpen,
  onClose,
  receiverVolume,
  onReceiverVolumeChange,
  micBoost,
  onMicBoostChange,
}) => {
  if (!isOpen) return null;

  const receiverPercent = Math.round(receiverVolume * 100);
  const micPercent = Math.round(micBoost * 100);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 text-zinc-100 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wider text-white">
                Penguat Volume & Mic Rider
              </h2>
              <p className="text-[11px] text-zinc-400">
                Booster audio interkom & kepekaan mic untuk helm
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Volume Intercom Teman (Receiver Booster) */}
        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-sm text-zinc-200">Volume Suara Teman</span>
            </div>
            <div className="flex items-center gap-1.5">
              {receiverPercent > 100 && (
                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {receiverPercent >= 200 ? '🚀 TURBO' : '🔥 BOOST'}
                </span>
              )}
              <span className="font-mono text-emerald-400 font-black text-sm">
                {receiverPercent}%
              </span>
            </div>
          </div>

          {/* Slider */}
          <input
            type="range"
            min="0"
            max="2.5"
            step="0.05"
            value={receiverVolume}
            onChange={(e) => onReceiverVolumeChange(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
          />

          {/* Preset Buttons */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {[
              { label: '50%', val: 0.5 },
              { label: '100% Std', val: 1.0 },
              { label: '150% Boost', val: 1.5 },
              { label: '200% Turbo', val: 2.0 },
            ].map((p) => {
              const isActive = Math.abs(receiverVolume - p.val) < 0.04;
              return (
                <button
                  key={p.label}
                  onClick={() => onReceiverVolumeChange(p.val)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-black border transition-all active:scale-95 ${
                    isActive
                      ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-zinc-400 leading-tight">
            💡 Diperkuat hingga <strong className="text-emerald-400">200% - 250%</strong> dengan <em>Web Audio Dynamic Limiter</em> agar suara teman di helm terdengar jelas saat kecepatan tinggi tanpa pecah.
          </p>
        </div>

        {/* Section 2: Penguat Sensitivitas Mikrofon (Mic Preamp Boost) */}
        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-sm text-zinc-200">Kepekaan Preamp Mic</span>
            </div>
            <div className="flex items-center gap-1.5">
              {micPercent < 100 ? (
                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  🛡️ REDAM BISING
                </span>
              ) : micPercent > 100 ? (
                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  +3.5dB BOOST
                </span>
              ) : (
                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                  STANDAR
                </span>
              )}
              <span className="font-mono text-sky-400 font-black text-sm">
                {micPercent}%
              </span>
            </div>
          </div>

          {/* Slider */}
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={micBoost}
            onChange={(e) => onMicBoostChange(parseFloat(e.target.value))}
            className="w-full accent-sky-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
          />

          {/* Preset Buttons */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {[
              { label: '50% Redam Bising', val: 0.5 },
              { label: '100% Standar', val: 1.0 },
              { label: '150% Sensitif', val: 1.5 },
            ].map((p) => {
              const isActive = Math.abs(micBoost - p.val) < 0.04;
              return (
                <button
                  key={p.label}
                  onClick={() => onMicBoostChange(p.val)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-black border transition-all active:scale-95 ${
                    isActive
                      ? 'bg-sky-500 text-zinc-950 border-sky-400 shadow-md shadow-sky-500/20'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-zinc-400 leading-tight">
            🎙️ Rentang sensitivitas preamp mic dioptimalkan <strong>50% - 150%</strong>. Turunkan ke <strong className="text-emerald-400">50% - 80%</strong> saat riding untuk memotong desis angin & gemuruh knalpot, atau pilih <strong className="text-sky-400">100% - 150%</strong> jika mic tertutup busa tebal helm.
          </p>
        </div>

        {/* Audio Processing Features Badge */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="text-[10px] leading-tight">
              <strong className="text-zinc-200 block">Anti-Clipping</strong>
              <span className="text-zinc-400">Suara tetap jernih</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-[10px] leading-tight">
              <strong className="text-zinc-200 block">Voice Clarity</strong>
              <span className="text-zinc-400">EQ Vokal Konsonan</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center gap-2">
            <Wind className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="text-[10px] leading-tight">
              <strong className="text-zinc-200 block">Wind Filter</strong>
              <span className="text-zinc-400">Low-cut 160Hz</span>
            </div>
          </div>
        </div>

        {/* Done Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-950 font-black text-sm uppercase tracking-wider hover:brightness-110 active:scale-98 shadow-lg shadow-emerald-500/20 transition-all"
        >
          Tutup & Simpan
        </button>
      </div>
    </div>
  );
};
