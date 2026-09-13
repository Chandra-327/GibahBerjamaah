import React, { useState, useEffect } from 'react';
import {
  Headphones,
  Smartphone,
  Radio,
  RefreshCw,
  Volume2,
  Mic,
  ShieldCheck,
  CheckCircle2,
  X,
  AlertCircle,
  Sparkles,
  Bluetooth,
} from 'lucide-react';

export interface DeviceInfoItem {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
  isBluetooth: boolean;
}

interface AudioDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDeviceLabel: string;
  inputDevices: DeviceInfoItem[];
  outputDevices: DeviceInfoItem[];
  selectedInputId: string;
  selectedOutputId: string;
  onSelectInputDevice: (deviceId: string) => void;
  onSelectOutputDevice: (deviceId: string) => void;
  onForceFixAudio: () => Promise<void>;
  isFixingAudio: boolean;
  audioStatus: string;
}

export const AudioDeviceModal: React.FC<AudioDeviceModalProps> = ({
  isOpen,
  onClose,
  activeDeviceLabel,
  inputDevices,
  outputDevices,
  selectedInputId,
  selectedOutputId,
  onSelectInputDevice,
  onSelectOutputDevice,
  onForceFixAudio,
  isFixingAudio,
  audioStatus,
}) => {
  const [testChimePlaying, setTestChimePlaying] = useState(false);

  if (!isOpen) return null;

  const isBluetoothActive =
    activeDeviceLabel.toLowerCase().includes('bluetooth') ||
    activeDeviceLabel.toLowerCase().includes('headset') ||
    activeDeviceLabel.toLowerCase().includes('wireless') ||
    activeDeviceLabel.toLowerCase().includes('cardo') ||
    activeDeviceLabel.toLowerCase().includes('sena') ||
    activeDeviceLabel.toLowerCase().includes('ejeas') ||
    activeDeviceLabel.toLowerCase().includes('freedconn');

  const handleFixAndTest = async () => {
    setTestChimePlaying(true);
    try {
      await onForceFixAudio();
    } finally {
      setTimeout(() => setTestChimePlaying(false), 1500);
    }
  };

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
            <div
              className={`p-2 rounded-2xl border ${
                isBluetoothActive
                  ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {isBluetoothActive ? (
                <Bluetooth className="w-5 h-5 animate-pulse" />
              ) : (
                <Headphones className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wider text-white">
                Rute & Perangkat Audio
              </h2>
              <p className="text-[11px] text-zinc-400">
                Transisi mulus Bluetooth Helm, Headset Kabel & HP
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

        {/* Current Active Routing Badge */}
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between ${
            isBluetoothActive
              ? 'bg-purple-950/40 border-purple-800/80 text-purple-200'
              : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                isBluetoothActive
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {isBluetoothActive ? (
                <Bluetooth className="w-5 h-5" />
              ) : (
                <Smartphone className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider opacity-75">
                Jalur Audio Aktif
              </div>
              <div className="text-sm font-black flex items-center gap-1.5">
                <span>{activeDeviceLabel || 'Otomatis (Sistem HP)'}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
          </div>

          <span className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-zinc-900/80 border border-zinc-700/60">
            {audioStatus.toUpperCase()}
          </span>
        </div>

        {/* Emergency Force-Fix / Re-sync Button (Solusi Hp Senyap saat Pindah Audio) */}
        <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Suara Hilang Saat Cabut/Pasang Headset?</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 leading-snug">
            Tekan tombol ini untuk merestart driver audio, memulihkan mic & speaker helm yang senyap, dan mengunci ulang jalur WebRTC.
          </p>
          <button
            onClick={handleFixAndTest}
            disabled={isFixingAudio || testChimePlaying}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFixingAudio ? 'animate-spin' : ''}`} />
            <span>
              {isFixingAudio
                ? 'Memulihkan Driver Audio...'
                : testChimePlaying
                ? '✅ Audio Berhasil Dipulihkan!'
                : '⚡ Perbaiki & Segarkan Audio Sekarang'}
            </span>
          </button>
        </div>

        {/* Input Microphone Selection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pilih Mikrofon (Input)</span>
          </label>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => onSelectInputDevice('')}
              className={`p-2.5 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                selectedInputId === ''
                  ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Otomatis (Prioritas Bluetooth Helm / Headset)</span>
              </div>
              {selectedInputId === '' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </button>

            {inputDevices.map((dev) => {
              const isSelected = selectedInputId === dev.deviceId;
              return (
                <button
                  key={dev.deviceId}
                  onClick={() => onSelectInputDevice(dev.deviceId)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {dev.isBluetooth ? (
                      <Bluetooth className="w-4 h-4 text-purple-400 shrink-0" />
                    ) : (
                      <Mic className="w-4 h-4 text-zinc-400 shrink-0" />
                    )}
                    <span className="truncate">{dev.label || `Mikrofon (${dev.deviceId.slice(0, 8)})`}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Output Speaker Selection */}
        {outputDevices.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Pilih Speaker / Output</span>
            </label>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => onSelectOutputDevice('')}
                className={`p-2.5 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                  selectedOutputId === ''
                    ? 'bg-purple-950/60 border-purple-500 text-purple-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-purple-400" />
                  <span>Otomatis (Sesuai Rute Sistem HP)</span>
                </div>
                {selectedOutputId === '' && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
              </button>

              {outputDevices.map((dev) => {
                const isSelected = selectedOutputId === dev.deviceId;
                return (
                  <button
                    key={dev.deviceId}
                    onClick={() => onSelectOutputDevice(dev.deviceId)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-purple-950/60 border-purple-500 text-purple-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {dev.isBluetooth ? (
                        <Bluetooth className="w-4 h-4 text-purple-400 shrink-0" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="truncate">{dev.label || `Speaker (${dev.deviceId.slice(0, 8)})`}</span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* System & Hardware Health Badges */}
        <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col gap-2 text-[11px]">
          <div className="font-bold text-zinc-300 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Fitur Kompatibilitas Antar Merek HP</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
            <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
              <strong className="text-zinc-200 block">Auto Re-attach</strong>
              <span>Ganti Bluetooth tanpa refresh web</span>
            </div>
            <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
              <strong className="text-zinc-200 block">Self-Healing Loop</strong>
              <span>AudioContext otomatis bangun</span>
            </div>
            <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
              <strong className="text-zinc-200 block">Opus 48kHz HD</strong>
              <span>Transmisi vokal interkom jernih</span>
            </div>
            <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
              <strong className="text-zinc-200 block">SCO / Handsfree</strong>
              <span>Dukungan intercom Sena, Cardo, dll</span>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider transition-all"
        >
          Selesai
        </button>
      </div>
    </div>
  );
};
