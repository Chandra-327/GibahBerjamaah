import React, { useState } from 'react';
import { Radio, Mic, MapPin, Battery, ShieldCheck, ArrowRight, Zap, Info } from 'lucide-react';
import { IntercomMode } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface LobbyScreenProps {
  onJoin: (callsign: string, roomId: string, mode: IntercomMode) => void;
  batteryLevel: number;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({ onJoin, batteryLevel }) => {
  const [callsign, setCallsign] = useState('');
  const [roomId, setRoomId] = useState('GIBAH ON THE ROAD');
  const [mode, setMode] = useState<IntercomMode>('ALWAYS_ON');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callsign.trim()) {
      alert('Silakan masukkan Nama Rider / Callsign Anda!');
      return;
    }
    setIsSubmitting(true);
    onJoin(callsign.trim(), roomId.trim().toUpperCase() || 'GIBAH ON THE ROAD', mode);
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white flex flex-col justify-between p-4 sm:p-6 select-none">
      {/* Top Bar with PWA Install Prompt */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between pt-safe">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-[11px] font-mono tracking-widest text-emerald-400 font-bold uppercase">
            STB NODE.JS READY
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg">
            <Battery className="w-3.5 h-3.5 text-emerald-400" />
            <span>{batteryLevel}%</span>
          </div>
          <PWAInstallButton />
        </div>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md mx-auto my-auto py-6">
        {/* App Logo & Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-3xl bg-zinc-900 border-2 border-emerald-500/80 flex items-center justify-center shadow-2xl shadow-emerald-500/20">
              <img src="/icon.svg" alt="Gibah Berjamaah" className="w-12 h-12" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1.5 rounded-xl bg-emerald-500 text-zinc-950 shadow-lg">
              <Zap className="w-3.5 h-3.5 fill-current" />
            </div>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-1.5">
            GIBAH BERJAMAAH
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-medium tracking-wide">
            Interkom Suara Real-Time & Peta GPS Rombongan Touring
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Callsign Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Callsign / Nama Rider <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={15}
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="Contoh: Bule, Road Captain, Sweeper..."
              className="w-full px-4 py-3.5 rounded-2xl bg-zinc-900 border-2 border-zinc-700 text-white font-bold text-base placeholder-zinc-500 focus:outline-none focus:border-emerald-400 transition"
              autoFocus
            />
          </div>

          {/* Room ID Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Room ID Touring (Sama dengan teman)
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="GIBAH ON THE ROAD"
              className="w-full px-4 py-3.5 rounded-2xl bg-zinc-900 border-2 border-zinc-700 text-white font-mono font-bold text-base focus:outline-none focus:border-emerald-400 transition"
            />
          </div>

          {/* Intercom Mode Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Pilihan Mode Interkom
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('ALWAYS_ON')}
                className={`p-3 rounded-2xl border-2 text-left flex flex-col gap-1 transition-all ${
                  mode === 'ALWAYS_ON'
                    ? 'bg-emerald-950/60 border-emerald-400 text-white shadow-lg shadow-emerald-950/40'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Mic className="w-5 h-5 text-emerald-400" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 font-mono">
                    Bebas
                  </span>
                </div>
                <div className="font-bold text-xs">Always-ON</div>
                <div className="text-[10px] text-zinc-400">Suara aktif otomatis dengan filter angin</div>
              </button>

              <button
                type="button"
                onClick={() => setMode('PTT')}
                className={`p-3 rounded-2xl border-2 text-left flex flex-col gap-1 transition-all ${
                  mode === 'PTT'
                    ? 'bg-amber-950/60 border-amber-400 text-white shadow-lg shadow-amber-950/40'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Radio className="w-5 h-5 text-amber-400" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 font-mono">
                    HT
                  </span>
                </div>
                <div className="font-bold text-xs">Push-to-Talk (PTT)</div>
                <div className="text-[10px] text-zinc-400">Tahan tombol atau headset saat bicara</div>
              </button>
            </div>
          </div>

          {/* Permissions Notice */}
          <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-2.5 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              Saat menekan <strong>MULAI GIBAH</strong>, browser akan meminta izin <strong>Mikrofon</strong> & <strong>GPS (Lokasi Presisi)</strong>. Pilih <strong>"Izinkan saat menggunakan situs"</strong>.
            </div>
          </div>

          {/* Big Start Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-zinc-950 font-black text-lg uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-2xl shadow-emerald-500/30 transition"
          >
            <span>{isSubmitting ? 'MENGHUBUNGKAN...' : 'MULAI GIBAH'}</span>
            <ArrowRight className="w-6 h-6" />
          </button>
        </form>
      </div>

      {/* Footer Features Bar */}
      <div className="w-full max-w-md mx-auto pt-2 pb-safe text-center">
        <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-500 font-medium">
          <span className="flex items-center gap-1">
            <Mic className="w-3 h-3 text-emerald-500" /> WebRTC 16kHz Noise-Filter
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-emerald-500" /> Leaflet GPS Live
          </span>
        </div>
      </div>
    </div>
  );
};
