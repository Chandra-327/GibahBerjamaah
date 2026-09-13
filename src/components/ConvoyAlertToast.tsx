import React, { useEffect, useState, useRef } from 'react';
import { ConvoyAlert } from '../types';
import { AlertTriangle, Coffee, Fuel, ShieldAlert, Users, Bell, X, Clock } from 'lucide-react';

interface ConvoyAlertToastProps {
  alert: ConvoyAlert | null;
  onDismiss: () => void;
}

const ALERT_DURATION_SECONDS = 40; // 40 detik

export const ConvoyAlertToast: React.FC<ConvoyAlertToastProps> = ({ alert, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(ALERT_DURATION_SECONDS);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!alert) {
      setVisible(false);
      return;
    }

    setVisible(true);

    // Trigger vibration pattern if supported on rider's mobile phone
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([250, 100, 250, 100, 400]);
      } catch {}
    }

    const alertTime = alert.timestamp || Date.now();
    const updateCountdown = () => {
      const elapsedSeconds = Math.floor((Date.now() - alertTime) / 1000);
      const remaining = Math.max(0, ALERT_DURATION_SECONDS - elapsedSeconds);
      setSecondsRemaining(remaining);
      return remaining;
    };

    const initialRemaining = updateCountdown();
    if (initialRemaining <= 0) {
      setVisible(false);
      onDismissRef.current();
      return;
    }

    const interval = setInterval(() => {
      const remaining = updateCountdown();
      if (remaining <= 0) {
        clearInterval(interval);
        setVisible(false);
        setTimeout(() => {
          onDismissRef.current();
        }, 350);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [alert?.id, alert?.timestamp]);

  if (!alert) return null;

  const handleManualDismiss = () => {
    setVisible(false);
    setTimeout(() => {
      onDismissRef.current();
    }, 200);
  };

  const getAlertIcon = () => {
    switch (alert.type) {
      case 'DANGER':
        return <AlertTriangle className="w-7 h-7 text-red-400 animate-bounce" />;
      case 'REST':
        return <Coffee className="w-7 h-7 text-amber-400" />;
      case 'FUEL':
        return <Fuel className="w-7 h-7 text-sky-400 animate-pulse" />;
      case 'POLICE':
        return <ShieldAlert className="w-7 h-7 text-orange-400 animate-pulse" />;
      case 'LOST':
        return <Users className="w-7 h-7 text-purple-400 animate-bounce" />;
      default:
        return <Bell className="w-7 h-7 text-emerald-400" />;
    }
  };

  const getBgColor = () => {
    switch (alert.type) {
      case 'DANGER':
        return 'bg-red-950/95 border-red-500 shadow-red-950/80 text-red-100';
      case 'REST':
        return 'bg-amber-950/95 border-amber-500 shadow-amber-950/80 text-amber-100';
      case 'FUEL':
        return 'bg-sky-950/95 border-sky-500 shadow-sky-950/80 text-sky-100';
      case 'POLICE':
        return 'bg-orange-950/95 border-orange-500 shadow-orange-950/80 text-orange-100';
      case 'LOST':
        return 'bg-purple-950/95 border-purple-500 shadow-purple-950/80 text-purple-100';
      default:
        return 'bg-zinc-900/95 border-emerald-500 shadow-emerald-950/80 text-emerald-100';
    }
  };

  const getProgressColor = () => {
    switch (alert.type) {
      case 'DANGER':
        return 'bg-red-500';
      case 'REST':
        return 'bg-amber-500';
      case 'FUEL':
        return 'bg-sky-500';
      case 'POLICE':
        return 'bg-orange-500';
      case 'LOST':
        return 'bg-purple-500';
      default:
        return 'bg-emerald-500';
    }
  };

  const getCategoryFallback = (type: string) => {
    switch (type) {
      case 'FUEL':
        return 'Isi Bensin / SPBU';
      case 'DANGER':
        return 'Jalan Rusak / Lubang';
      case 'POLICE':
        return 'Polisi / Razia';
      case 'REST':
        return 'Berhenti / Rest Area';
      case 'LOST':
        return 'Ketinggalan / Tunggu!';
      case 'INFO':
        return 'Hujan / Jas Hujan';
      default:
        return 'Peringatan Konvoi';
    }
  };

  const alertTitle = alert.title || getCategoryFallback(alert.type);
  const alertDesc = alert.message && alert.message !== alertTitle ? alert.message : null;
  const progressPercent = Math.max(0, Math.min(100, (secondsRemaining / ALERT_DURATION_SECONDS) * 100));

  const formatTime = (totalSeconds: number) => {
    return `${totalSeconds}s`;
  };

  return (
    <div
      className={`fixed top-16 left-4 right-4 z-50 max-w-lg mx-auto transition-all duration-400 ease-out ${
        visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'
      }`}
    >
      <div className={`p-4 rounded-2xl border-2 shadow-2xl backdrop-blur-md relative overflow-hidden flex flex-col gap-3 ${getBgColor()}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 shrink-0 mt-0.5">
              {getAlertIcon()}
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Header Bar: Sender Name + Live Countdown */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold tracking-wider">
                <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-0.5 rounded-full border border-white/20">
                  <span className="text-zinc-400 font-semibold uppercase text-[10px]">DARI:</span>
                  <span className="text-white font-mono font-black text-xs tracking-wide">
                    {alert.username || 'RIDER'}
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full border border-white/10 text-zinc-300 font-mono text-[10px]">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span className="text-white font-bold">{formatTime(secondsRemaining)}</span>
                  <span className="text-zinc-400 text-[9px]">(hilang dlm 40 dtk)</span>
                </div>
              </div>

              {/* Main Alert Category & Title */}
              <div className="text-base font-black text-white leading-tight mt-1.5 break-words">
                {alertTitle}
              </div>

              {/* Detail Keterangan yang disentuh */}
              {alertDesc && (
                <div className="text-xs text-white/90 font-medium leading-relaxed mt-1 break-words">
                  {alertDesc}
                </div>
              )}
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={handleManualDismiss}
            className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 border border-white/20 flex items-center justify-center text-zinc-300 hover:text-white shrink-0 active:scale-90 transition-transform"
            title="Tutup Peringatan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Minute Auto-Dismiss Countdown Progress Bar */}
        <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${getProgressColor()}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};

