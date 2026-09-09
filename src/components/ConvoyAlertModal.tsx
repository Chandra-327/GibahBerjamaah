import React, { useState } from 'react';
import { AlertTriangle, Coffee, Fuel, ShieldAlert, Users, CloudRain, X, Send } from 'lucide-react';

interface ConvoyAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendAlert: (type: 'DANGER' | 'REST' | 'POLICE' | 'FUEL' | 'LOST' | 'INFO', message: string) => void;
}

const PRESET_ALERTS = [
  {
    type: 'DANGER' as const,
    label: 'Jalan Rusak / Lubang',
    icon: AlertTriangle,
    color: 'bg-red-600 border-red-500 text-white',
    desc: 'Hati-hati aspal rusak / lubang depan',
  },
  {
    type: 'REST' as const,
    label: 'Berhenti / Rest Area',
    icon: Coffee,
    color: 'bg-amber-600 border-amber-500 text-white',
    desc: 'Istirahat / cari minimarket / ngopi',
  },
  {
    type: 'FUEL' as const,
    label: 'Isi Bensin / SPBU',
    icon: Fuel,
    color: 'bg-blue-600 border-blue-500 text-white',
    desc: 'Indikator bensin menipis / butuh POM',
  },
  {
    type: 'POLICE' as const,
    label: 'Polisi / Razia',
    icon: ShieldAlert,
    color: 'bg-orange-600 border-orange-500 text-white',
    desc: 'Perlambat laju, ada pemeriksaan/operasi',
  },
  {
    type: 'LOST' as const,
    label: 'Ketinggalan / Tunggu!',
    icon: Users,
    color: 'bg-purple-600 border-purple-500 text-white',
    desc: 'Terpisah dari rombongan, mohon pelan',
  },
  {
    type: 'INFO' as const,
    label: 'Hujan / Jas Hujan',
    icon: CloudRain,
    color: 'bg-cyan-600 border-cyan-500 text-white',
    desc: 'Mulai gerimis, bersiap menepi pakai jas hujan',
  },
];

export const ConvoyAlertModal: React.FC<ConvoyAlertModalProps> = ({ isOpen, onClose, onSendAlert }) => {
  const [customText, setCustomText] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-5 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-950 border border-red-500/50">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">BROADCAST CONVOY ALERT</h2>
              <p className="text-xs text-zinc-400">Kirim peringatan cepat 1-sentuhan ke seluruh rider</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1-Tap Preset Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {PRESET_ALERTS.map((alert) => {
            const Icon = alert.icon;
            return (
              <button
                key={alert.label}
                onClick={() => {
                  onSendAlert(alert.type, alert.label);
                  onClose();
                }}
                className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition-transform active:scale-95 shadow-lg ${alert.color}`}
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-6 h-6" />
                  <span className="text-[10px] font-black uppercase tracking-wider bg-black/30 px-1.5 py-0.5 rounded">
                    BROADCAST
                  </span>
                </div>
                <div>
                  <div className="font-black text-sm leading-tight">{alert.label}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{alert.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom Quick Message */}
        <div className="mt-2">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
            Pesan Khusus Tambahan (Opsional)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Contoh: Belok kiri di lampu merah depan..."
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-700 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
              maxLength={60}
            />
            <button
              onClick={() => {
                if (customText.trim()) {
                  onSendAlert('INFO', customText.trim());
                  setCustomText('');
                  onClose();
                }
              }}
              disabled={!customText.trim()}
              className="px-4 py-3 rounded-xl bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-black flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
