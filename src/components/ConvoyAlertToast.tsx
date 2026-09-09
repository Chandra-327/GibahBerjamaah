import React, { useEffect, useState, useRef } from 'react';
import { ConvoyAlert } from '../types';
import { AlertTriangle, Coffee, Fuel, ShieldAlert, Users, Bell, X, Clock } from 'lucide-react';

interface ConvoyAlertToastProps {
  alert: ConvoyAlert | null;
  onDismiss: () => void;
}

const ALERT_DURATION_MS = 7000;

export const ConvoyAlertToast: React.FC<ConvoyAlertToastProps> = ({ alert, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [progressWidth, setProgressWidth] = useState(100);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const timerRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!alert) {
      setVisible(false);
      return;
    }

    setVisible(true);
    setProgressWidth(100);

    // Trigger vibration pattern if supported on rider's mobile phone
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 300]);
      } catch {}
    }

    // Small delay to trigger CSS transition for progress bar countdown
    animFrameRef.current = window.setTimeout(() => {
      setProgressWidth(0);
    }, 60);

    // Auto-dismiss after ALERT_DURATION_MS
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(() => {
        onDismissRef.current();
      }, 350);
    }, ALERT_DURATION_MS);

    return () => {
      if (animFrameRef.current) window.clearTimeout(animFrameRef.current);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [alert?.id, alert?.timestamp, alert?.message]);

  if (!alert) return null;

  const handleManualDismiss = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (animFrameRef.current) window.clearTimeout(animFrameRef.current);
    setVisible(false);
    window.setTimeout(() => {
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
        return <Fuel className="w-7 h-7 text-blue-400" />;
      case 'POLICE':
        return <ShieldAlert className="w-7 h-7 text-orange-400" />;
      case 'LOST':
        return <Users className="w-7 h-7 text-purple-400" />;
      default:
        return <Bell className="w-7 h-7 text-emerald-400" />;
    }
  };

  const getBgColor = () => {
    switch (alert.type) {
      case 'DANGER':
        return 'bg-red-950/95 border-red-500 shadow-red-900/60 text-red-100';
      case 'REST':
        return 'bg-amber-950/95 border-amber-500 shadow-amber-900/60 text-amber-100';
      case 'FUEL':
        return 'bg-blue-950/95 border-blue-500 shadow-blue-900/60 text-blue-100';
      case 'POLICE':
        return 'bg-orange-950/95 border-orange-500 shadow-orange-900/60 text-orange-100';
      default:
        return 'bg-zinc-900/95 border-emerald-500 shadow-emerald-950/60 text-emerald-100';
    }
  };

  const getProgressColor = () => {
    switch (alert.type) {
      case 'DANGER':
        return 'bg-red-500';
      case 'REST':
        return 'bg-amber-500';
      case 'FUEL':
        return 'bg-blue-500';
      case 'POLICE':
        return 'bg-orange-500';
      default:
        return 'bg-emerald-500';
    }
  };

  return (
    <div
      className={`fixed top-16 left-4 right-4 z-50 max-w-md mx-auto transition-all duration-400 ease-out ${
        visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'
      }`}
    >
      <div className={`p-4 rounded-2xl border-2 shadow-2xl backdrop-blur-md relative overflow-hidden flex flex-col gap-2.5 ${getBgColor()}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 shrink-0">
              {getAlertIcon()}
            </div>
            <div>
              <div className="text-[10px] uppercase font-black tracking-wider text-zinc-300 flex items-center gap-1.5">
                <span>ALERT DARI:</span>
                <span className="text-white font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                  {alert.username}
                </span>
                <span className="flex items-center gap-0.5 text-zinc-400 text-[9px] font-mono">
                  <Clock className="w-3 h-3" /> 7s
                </span>
              </div>
              <div className="text-sm font-black text-white leading-tight mt-1">
                {alert.message}
              </div>
            </div>
          </div>

          <button
            onClick={handleManualDismiss}
            className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-white shrink-0 active:scale-95"
            title="Tutup Peringatan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 7-Second Auto-Dismiss Countdown Progress Bar */}
        <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-[7000ms] ease-linear ${getProgressColor()}`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>
    </div>
  );
};

