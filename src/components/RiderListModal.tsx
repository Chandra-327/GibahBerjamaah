import React from 'react';
import { Rider } from '../types';
import { Users, X, Mic, MicOff, Volume2, Battery, Share2, Copy, Check } from 'lucide-react';

interface RiderListModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  myCallsign: string;
  myBattery: number;
  isMyMuted: boolean;
  isMySpeaking: boolean;
  riders: Rider[];
}

export const RiderListModal: React.FC<RiderListModalProps> = ({
  isOpen,
  onClose,
  roomId,
  myCallsign,
  myBattery,
  isMyMuted,
  isMySpeaking,
  riders,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const totalCount = riders.length + 1;

  const copyInvite = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(`Gabung Interkom Gibah Berjamaah!\nRoom: ${roomId}\nURL: ${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-950 border border-emerald-500/50">
              <Users className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-wide">ROMBONGAN RIDER</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-400 font-mono text-xs font-bold">
                  {totalCount} Rider
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono">Room: {roomId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Room Button */}
        <button
          onClick={copyInvite}
          className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-750 text-zinc-200 flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-98"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-emerald-400" />}
          <span>{copied ? 'Tautan Room Disalin!' : 'Bagikan Link Room ke Teman Rider'}</span>
        </button>

        {/* Rider List */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
          {/* You */}
          <div className="p-3 rounded-2xl bg-zinc-950 border border-emerald-500/60 flex items-center justify-between shadow">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${
                isMySpeaking ? 'bg-emerald-500 text-zinc-950 ring-4 ring-emerald-400 animate-speaking' : 'bg-emerald-950 text-emerald-400 border border-emerald-600'
              }`}>
                {myCallsign.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-white">{myCallsign}</span>
                  <span className="text-[10px] uppercase font-bold bg-emerald-950 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-700/50">
                    Anda (Saya)
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                  <span className="flex items-center gap-1 font-mono">
                    <Battery className="w-3.5 h-3.5 text-emerald-400" />
                    {myBattery}%
                  </span>
                  <span>•</span>
                  <span className={isMyMuted ? 'text-red-400 font-bold' : isMySpeaking ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                    {isMyMuted ? 'Muted' : isMySpeaking ? 'Sedang Bicara' : 'Standby'}
                  </span>
                </div>
              </div>
            </div>
            <div>
              {isMyMuted ? <MicOff className="w-5 h-5 text-red-400" /> : <Mic className="w-5 h-5 text-emerald-400" />}
            </div>
          </div>

          {/* Remote Riders */}
          {riders.map((rider) => (
            <div
              key={rider.userId}
              className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${
                  rider.isSpeaking
                    ? 'bg-emerald-500 text-zinc-950 ring-4 ring-emerald-400 animate-speaking'
                    : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {rider.username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-white">{rider.username}</span>
                    {rider.isSpeaking && (
                      <span className="text-[9px] uppercase font-bold bg-emerald-950 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-600 animate-pulse">
                        Gibah
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Battery className="w-3.5 h-3.5 text-zinc-400" />
                      {rider.battery}%
                    </span>
                    <span>•</span>
                    <span className="font-mono">
                      {rider.speed ? `${Math.round(rider.speed * 3.6)} km/h` : 'Diam'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                {rider.isMuted ? (
                  <MicOff className="w-5 h-5 text-zinc-600" />
                ) : rider.isSpeaking ? (
                  <Volume2 className="w-5 h-5 text-emerald-400 animate-bounce" />
                ) : (
                  <Mic className="w-5 h-5 text-zinc-500" />
                )}
              </div>
            </div>
          ))}

          {riders.length === 0 && (
            <div className="text-center py-6 text-zinc-500 text-xs">
              Belum ada rider lain di room ini.<br />
              Bagikan link room atau gunakan nama room yang sama dengan rekan touring Anda.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
