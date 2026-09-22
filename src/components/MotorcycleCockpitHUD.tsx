import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Gauge,
  RotateCcw,
  Maximize2,
  Minimize2,
  GripHorizontal,
  Crosshair,
  Sliders,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
  Navigation2,
  Settings2,
  X,
} from 'lucide-react';

interface MotorcycleCockpitHUDProps {
  rawSpeedKmh: number | null; // Speed in km/h from GPS
  myCoords: [number, number] | null;
  myHeading: number | null;
}

type HUDSize = 'compact' | 'standard' | 'expanded';

interface CalibrationData {
  rollOffset: number;
  pitchOffset: number;
  calibratedAt: number;
}

export const MotorcycleCockpitHUD: React.FC<MotorcycleCockpitHUDProps> = ({
  rawSpeedKmh,
  myCoords,
  myHeading,
}) => {
  // 1. HUD Size Mode (Compact, Standard, Expanded)
  const [sizeMode, setSizeMode] = useState<HUDSize>(() => {
    const saved = localStorage.getItem('gibah_hud_size');
    return (saved as HUDSize) || 'standard';
  });

  // 2. Draggable Position
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('gibah_hud_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch {}
    return { x: 16, y: 16 };
  });

  const hudRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  // 3. Trip Distance (Persisted & Resettable)
  const [tripDistanceKm, setTripDistanceKm] = useState<number>(() => {
    const saved = localStorage.getItem('gibah_trip_distance_km');
    return saved ? parseFloat(saved) || 0 : 0;
  });
  const [tripStartTime, setTripStartTime] = useState<number>(() => {
    const saved = localStorage.getItem('gibah_trip_start_time');
    return saved ? parseInt(saved, 10) || Date.now() : Date.now();
  });
  const lastCoordsRef = useRef<[number, number] | null>(null);

  // 4. Motorcycle Lean (Kiri/Kanan) & Pitch (Tanjakan/Turunan)
  const [rawRoll, setRawRoll] = useState<number>(0);
  const [rawPitch, setRawPitch] = useState<number>(0);
  const [filteredRoll, setFilteredRoll] = useState<number>(0);
  const [filteredPitch, setFilteredPitch] = useState<number>(0);

  // Calibration Offset (Setang / Holder Motor)
  const [calibration, setCalibration] = useState<CalibrationData>(() => {
    try {
      const saved = localStorage.getItem('gibah_hud_calibration');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { rollOffset: 0, pitchOffset: 0, calibratedAt: 0 };
  });

  // Max Lean Memory (Rekaman Rebah Kiri & Kanan)
  const [maxLeanLeft, setMaxLeanLeft] = useState<number>(() => {
    const saved = localStorage.getItem('gibah_max_lean_left');
    return saved ? parseFloat(saved) || 0 : 0;
  });
  const [maxLeanRight, setMaxLeanRight] = useState<number>(() => {
    const saved = localStorage.getItem('gibah_max_lean_right');
    return saved ? parseFloat(saved) || 0 : 0;
  });

  // 5. Speedometer Calibration Factor (Mendekati Spidometer Bawaan Motor)
  // Standard motorcycle OEM speedos lead by ~5% (+5%) to meet ECE-R39 regulations.
  const [speedCorrectionFactor, setSpeedCorrectionFactor] = useState<number>(() => {
    const saved = localStorage.getItem('gibah_speed_factor');
    return saved ? parseFloat(saved) || 1.05 : 1.05; // default +5%
  });

  // Smoothed Speed for responsive, non-jittery display
  const [displayedSpeed, setDisplayedSpeed] = useState<number>(0);
  const speedFilterRef = useRef<number>(0);

  // Settings modal / flyout inside HUD
  const [showSettings, setShowSettings] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [hasCalibratedRecently, setHasCalibratedRecently] = useState(false);

  // Persist HUD Size
  const handleSetSizeMode = (mode: HUDSize) => {
    setSizeMode(mode);
    localStorage.setItem('gibah_hud_size', mode);
  };

  // --------------------------------------------------------------------------
  // SENSOR GYRO / ORIENTATION WITH VIBRATION DAMPING & CALIBRATION OFFSET
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Check if iOS 13+ permission is required
    if (
      typeof window !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    ) {
      setNeedsPermission(true);
    }

    let lastGamma = 0;
    let lastBeta = 0;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // In portrait:
      // gamma is left/right roll (-90 to +90)
      // beta is front/back pitch (-180 to +180)
      if (e.gamma === null && e.beta === null) return;

      const currentGamma = e.gamma ?? 0;
      const currentBeta = e.beta ?? 0;

      // Exponential Moving Average filter to cancel motorcycle engine vibration
      const alpha = 0.25; // responsive yet filters road bumps
      lastGamma = lastGamma * (1 - alpha) + currentGamma * alpha;
      lastBeta = lastBeta * (1 - alpha) + currentBeta * alpha;

      setRawRoll(lastGamma);
      setRawPitch(lastBeta);

      // Apply calibration offsets
      const adjRoll = lastGamma - calibration.rollOffset;
      const adjPitch = lastBeta - calibration.pitchOffset;

      // Clamp to realistic motorcycle lean angles (-60 to +60)
      const clampedRoll = Math.max(-60, Math.min(60, adjRoll));
      const clampedPitch = Math.max(-50, Math.min(50, adjPitch));

      setFilteredRoll(clampedRoll);
      setFilteredPitch(clampedPitch);

      // Record peak lean angles
      if (clampedRoll < 0) {
        const absLeft = Math.abs(clampedRoll);
        setMaxLeanLeft((prev) => {
          if (absLeft > prev) {
            const rounded = Math.round(absLeft);
            localStorage.setItem('gibah_max_lean_left', rounded.toString());
            return rounded;
          }
          return prev;
        });
      } else if (clampedRoll > 0) {
        setMaxLeanRight((prev) => {
          if (clampedRoll > prev) {
            const rounded = Math.round(clampedRoll);
            localStorage.setItem('gibah_max_lean_right', rounded.toString());
            return rounded;
          }
          return prev;
        });
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [calibration]);

  // Request iOS permission if needed
  const requestSensorPermission = async () => {
    try {
      const anyEvent = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (typeof anyEvent.requestPermission === 'function') {
        const response = await anyEvent.requestPermission();
        if (response === 'granted') {
          setNeedsPermission(false);
        }
      }
    } catch (err) {
      console.warn('Sensor permission error:', err);
    }
  };

  // Kalibrasi Nol (Setang / Holder Motor)
  const handleCalibrateZero = () => {
    const newCalibration: CalibrationData = {
      rollOffset: rawRoll,
      pitchOffset: rawPitch,
      calibratedAt: Date.now(),
    };
    setCalibration(newCalibration);
    localStorage.setItem('gibah_hud_calibration', JSON.stringify(newCalibration));

    setHasCalibratedRecently(true);
    setTimeout(() => setHasCalibratedRecently(false), 2500);
  };

  // Reset Kalibrasi ke Default
  const handleResetCalibration = () => {
    const defaultCal: CalibrationData = {
      rollOffset: 0,
      pitchOffset: 0,
      calibratedAt: 0,
    };
    setCalibration(defaultCal);
    localStorage.removeItem('gibah_hud_calibration');
  };

  // Reset Peak Lean
  const handleResetPeakLean = () => {
    setMaxLeanLeft(0);
    setMaxLeanRight(0);
    localStorage.removeItem('gibah_max_lean_left');
    localStorage.removeItem('gibah_max_lean_right');
  };

  // --------------------------------------------------------------------------
  // SPEEDOMETER SMOOTHING & FACTORY CALIBRATION (+5% to match OEM bike speedo)
  // --------------------------------------------------------------------------
  useEffect(() => {
    let target = 0;
    if (rawSpeedKmh !== null && rawSpeedKmh > 1.8) {
      // Apply factory motorcycle lead factor (e.g. 1.05 = +5%)
      target = rawSpeedKmh * speedCorrectionFactor;
    } else {
      // Under 1.8 km/h -> bike is idling or stopped at traffic lights
      target = 0;
    }

    // Dynamic adaptive filter:
    // When accelerating or braking hard (difference > 4 km/h), respond fast (alpha 0.65)
    // When cruising steady, smooth out GPS jitter (alpha 0.32)
    const current = speedFilterRef.current;
    const diff = Math.abs(target - current);
    const alpha = diff > 4 ? 0.65 : 0.32;

    const nextSpeed = current + alpha * (target - current);
    speedFilterRef.current = nextSpeed;

    const rounded = Math.round(nextSpeed);
    setDisplayedSpeed(rounded);
  }, [rawSpeedKmh, speedCorrectionFactor]);

  // Save speed correction factor
  const handleSetSpeedFactor = (factor: number) => {
    const clamped = Math.max(0.9, Math.min(1.2, factor));
    setSpeedCorrectionFactor(clamped);
    localStorage.setItem('gibah_speed_factor', clamped.toFixed(2));
  };

  // --------------------------------------------------------------------------
  // TRIP DISTANCE CALCULATION (Haversine with anti-drift threshold)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!myCoords) return;

    if (!lastCoordsRef.current) {
      lastCoordsRef.current = myCoords;
      return;
    }

    const [lat1, lon1] = lastCoordsRef.current;
    const [lat2, lon2] = myCoords;

    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const deltaKm = R * c;

    // Movement gating: only add distance if moving at least ~5 meters and less than 500m per update
    // and raw speed indicates actual movement (> 2 km/h)
    const isMoving = rawSpeedKmh !== null ? rawSpeedKmh > 2 : deltaKm > 0.008;

    if (deltaKm >= 0.005 && deltaKm < 0.5 && isMoving) {
      setTripDistanceKm((prev) => {
        const next = Math.round((prev + deltaKm) * 100) / 100;
        localStorage.setItem('gibah_trip_distance_km', next.toString());
        return next;
      });
      lastCoordsRef.current = myCoords;
    }
  }, [myCoords, rawSpeedKmh]);

  // Reset Trip Distance
  const handleResetTrip = () => {
    setTripDistanceKm(0);
    localStorage.setItem('gibah_trip_distance_km', '0');
    const now = Date.now();
    setTripStartTime(now);
    localStorage.setItem('gibah_trip_start_time', now.toString());
    lastCoordsRef.current = myCoords;
  };

  // --------------------------------------------------------------------------
  // DRAGGABLE LOGIC (Touch and Mouse with screen boundary clamping)
  // --------------------------------------------------------------------------
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDraggingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      startX: position.x,
      startY: position.y,
    };
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDraggingRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - dragStartRef.current.mouseX;
    const deltaY = clientY - dragStartRef.current.mouseY;

    const hudWidth = hudRef.current?.offsetWidth || 280;
    const hudHeight = hudRef.current?.offsetHeight || 120;
    const maxPosX = Math.max(0, window.innerWidth - hudWidth - 8);
    const maxPosY = Math.max(0, window.innerHeight - hudHeight - 80); // avoid bottom rider controls

    const newX = Math.max(8, Math.min(maxPosX, dragStartRef.current.startX + deltaX));
    const newY = Math.max(8, Math.min(maxPosY, dragStartRef.current.startY + deltaY));

    setPosition({ x: newX, y: newY });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setPosition((current) => {
        localStorage.setItem('gibah_hud_pos', JSON.stringify(current));
        return current;
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  // Reset HUD Position to Default Top-Left
  const handleResetPosition = () => {
    const defaultPos = { x: 16, y: 16 };
    setPosition(defaultPos);
    localStorage.setItem('gibah_hud_pos', JSON.stringify(defaultPos));
  };

  // --------------------------------------------------------------------------
  // DERIVED VALUES & DISPLAY FORMATTING
  // --------------------------------------------------------------------------
  const roundedRoll = Math.round(filteredRoll);
  const roundedPitch = Math.round(filteredPitch);

  // Lean direction
  const isLeaningLeft = roundedRoll < -1;
  const isLeaningRight = roundedRoll > 1;
  const absLean = Math.abs(roundedRoll);

  // Lean severity color
  const leanColorClass =
    absLean > 32
      ? 'text-rose-400'
      : absLean > 18
      ? 'text-amber-400'
      : 'text-emerald-400';

  const leanBgClass =
    absLean > 32
      ? 'bg-rose-500/20 border-rose-500/60'
      : absLean > 18
      ? 'bg-amber-500/20 border-amber-500/60'
      : 'bg-emerald-500/20 border-emerald-500/50';

  // Pitch grade description
  const isClimbing = roundedPitch > 2;
  const isDescending = roundedPitch < -2;
  const pitchPercent = Math.round(Math.tan((Math.abs(roundedPitch) * Math.PI) / 180) * 100);

  // Trip duration formatted
  const tripDurationMinutes = Math.max(1, Math.round((Date.now() - tripStartTime) / 60000));
  const tripHours = Math.floor(tripDurationMinutes / 60);
  const tripMins = tripDurationMinutes % 60;
  const tripTimeFormatted = tripHours > 0 ? `${tripHours}j ${tripMins}m` : `${tripMins} mnt`;

  return (
    <div
      ref={hudRef}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
      className="absolute top-0 left-0 z-30 select-none pointer-events-auto transition-transform duration-75"
    >
      {/* iOS Permission Banner if needed */}
      {needsPermission && (
        <div className="mb-2 p-2.5 rounded-xl bg-amber-950/95 border border-amber-500 text-amber-200 text-xs shadow-xl flex items-center justify-between gap-2 max-w-xs">
          <span>Izinkan sensor gerak untuk klinometer motor</span>
          <button
            onClick={requestSensorPermission}
            className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] shrink-0"
          >
            Izinkan
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: VERSI KOMPAK (Compact Minimalist Pill)                           */}
      {/* ========================================================================= */}
      {sizeMode === 'compact' && (
        <div className="bg-zinc-950/92 backdrop-blur-md border border-zinc-800/90 rounded-2xl px-3 py-2 shadow-2xl flex items-center gap-2.5 sm:gap-3 text-zinc-100">
          {/* Drag Handle */}
          <div
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="cursor-grab active:cursor-grabbing p-1 text-zinc-500 hover:text-zinc-300"
            title="Tahan & Geser Posisi"
          >
            <GripHorizontal className="w-4 h-4" />
          </div>

          {/* Speed Display */}
          <div className="flex items-baseline gap-1 min-w-[58px]">
            <span className="text-2xl font-black font-mono tracking-tight text-emerald-400 leading-none">
              {displayedSpeed}
            </span>
            <span className="text-[10px] font-bold text-zinc-400">km/h</span>
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          {/* Lean Angle (Kiri / Kanan) */}
          <div className="flex items-center gap-1.5 min-w-[65px]">
            <div
              className="w-2.5 h-2.5 rounded-full border transition-all"
              style={{
                transform: `rotate(${roundedRoll}deg)`,
                backgroundColor: absLean > 30 ? '#f43f5e' : absLean > 16 ? '#f59e0b' : '#10b981',
              }}
            />
            <span className={`text-xs font-mono font-black ${leanColorClass}`}>
              {isLeaningLeft ? `L ${absLean}°` : isLeaningRight ? `R ${absLean}°` : '0°'}
            </span>
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          {/* Tanjakan / Turunan */}
          <div className="flex items-center gap-1 min-w-[55px] text-xs font-mono font-bold">
            {isClimbing ? (
              <span className="text-amber-400 flex items-center">
                <TrendingUp className="w-3.5 h-3.5 mr-0.5" />+{roundedPitch}°
              </span>
            ) : isDescending ? (
              <span className="text-sky-400 flex items-center">
                <TrendingDown className="w-3.5 h-3.5 mr-0.5" />{roundedPitch}°
              </span>
            ) : (
              <span className="text-zinc-400 flex items-center">
                <Minus className="w-3 h-3 mr-0.5" />0°
              </span>
            )}
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          {/* Trip */}
          <div className="flex items-baseline gap-1 text-xs font-mono font-bold text-zinc-200">
            <span>{tripDistanceKm.toFixed(1)}</span>
            <span className="text-[10px] text-zinc-500 font-normal">km</span>
          </div>

          {/* Expand to Standard Mode */}
          <button
            onClick={() => handleSetSizeMode('standard')}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-400 hover:text-white transition active:scale-95"
            title="Perbesar Tampilan"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: VERSI STANDAR (Balanced Motorcycle Tactical Cockpit)              */}
      {/* ========================================================================= */}
      {sizeMode === 'standard' && (
        <div className="bg-zinc-950/94 backdrop-blur-md border border-zinc-800/90 rounded-2xl p-3 shadow-2xl w-[310px] text-zinc-100 flex flex-col gap-2.5">
          {/* Header Bar with Drag & Size Controls */}
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
            <div
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-200"
              title="Tahan & Geser ke mana saja"
            >
              <GripHorizontal className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-black uppercase tracking-wider text-zinc-300">
                Cockpit Telemetri
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleCalibrateZero}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition active:scale-95 flex items-center gap-1 ${
                  hasCalibratedRecently
                    ? 'bg-emerald-900 border-emerald-400 text-emerald-200'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-emerald-300'
                }`}
                title="Kalibrasi Nol posisi holder / setang saat ini"
              >
                <Crosshair className="w-3 h-3 text-emerald-400" />
                <span>{hasCalibratedRecently ? 'Nol Disetel!' : 'Nolkan'}</span>
              </button>

              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-1.5 rounded-lg border transition active:scale-95 ${
                  showSettings
                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
                title="Pengaturan Spidometer & Kalibrasi"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleSetSizeMode('compact')}
                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition active:scale-95"
                title="Perkecil ke Versi Kompak"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleSetSizeMode('expanded')}
                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition active:scale-95"
                title="Perbesar ke Versi Penuh"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Main Grid: Speed (Left) & Klinometer (Right) */}
          <div className="grid grid-cols-2 gap-2.5 items-center">
            {/* Speedometer Card */}
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-2.5 flex flex-col justify-between h-[82px]">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold tracking-wider text-zinc-400 uppercase">
                  Speed (Spido)
                </span>
                <span className="text-[9px] font-mono text-emerald-400/90 font-bold">
                  {speedCorrectionFactor > 1
                    ? `+${Math.round((speedCorrectionFactor - 1) * 100)}%`
                    : 'GPS'}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black font-mono text-emerald-400 tracking-tight leading-none">
                  {displayedSpeed}
                </span>
                <span className="text-xs font-bold text-zinc-400">km/h</span>
              </div>
              <span className="text-[9px] font-mono text-zinc-500 truncate">
                {rawSpeedKmh !== null && rawSpeedKmh > 1
                  ? `GPS: ${Math.round(rawSpeedKmh)} km/h`
                  : 'Motor Diam'}
              </span>
            </div>

            {/* Klinometer Motor (Kemiringan Kiri / Kanan) */}
            <div className={`border rounded-xl p-2.5 flex flex-col justify-between h-[82px] transition-colors ${leanBgClass}`}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-zinc-300">
                  Kemiringan
                </span>
                <span className={`text-[9px] font-mono font-black ${leanColorClass}`}>
                  {isLeaningLeft ? 'KIRI' : isLeaningRight ? 'KANAN' : 'TEGAK'}
                </span>
              </div>

              {/* Dynamic Lean Meter Arc / Needle */}
              <div className="flex items-center justify-between gap-2">
                <div className="relative w-10 h-10 rounded-full bg-zinc-950/80 border border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  {/* Center Crosshairs */}
                  <div className="absolute w-full h-[1px] bg-zinc-700/60" />
                  <div className="absolute h-full w-[1px] bg-zinc-700/60" />

                  {/* Tilting Motorcycle Horizon Bar */}
                  <div
                    className="absolute w-8 h-[2.5px] rounded-full transition-transform duration-100 ease-out"
                    style={{
                      transform: `rotate(${roundedRoll}deg)`,
                      backgroundColor:
                        absLean > 32 ? '#f43f5e' : absLean > 18 ? '#f59e0b' : '#10b981',
                    }}
                  />
                  <div className="w-2 h-2 rounded-full bg-zinc-200 z-10 shadow" />
                </div>

                <div className="flex flex-col items-end">
                  <div className="flex items-baseline">
                    <span className={`text-2xl font-black font-mono leading-none ${leanColorClass}`}>
                      {absLean}
                    </span>
                    <span className="text-xs font-bold font-mono ml-0.5">°</span>
                  </div>
                  <span className="text-[8px] font-mono text-zinc-400">
                    Max: L{maxLeanLeft}° / R{maxLeanRight}°
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Bar: Tanjakan/Turunan + Trip Jarak Tempuh */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Slope (Tanjakan / Turunan) */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase">Elevasi</span>
                <span className="text-[11px] font-mono font-bold text-zinc-200">
                  {isClimbing ? (
                    <span className="text-amber-400 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      Tanjakan +{roundedPitch}°
                    </span>
                  ) : isDescending ? (
                    <span className="text-sky-400 flex items-center">
                      <TrendingDown className="w-3 h-3 mr-1" />
                      Turunan {roundedPitch}°
                    </span>
                  ) : (
                    <span className="text-zinc-400 flex items-center">
                      <Minus className="w-3 h-3 mr-1" />
                      Datar 0°
                    </span>
                  )}
                </span>
              </div>
              {pitchPercent > 3 && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {pitchPercent}%
                </span>
              )}
            </div>

            {/* Trip Jarak Tempuh (Persistent & Resettable) */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] font-mono font-bold text-amber-400/90 uppercase">
                  Trip Meter
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono font-black text-zinc-100 text-sm leading-tight">
                    {tripDistanceKm.toFixed(1)}
                  </span>
                  <span className="text-[9px] text-zinc-400 font-bold">km</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetTrip}
                className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-amber-300 transition active:scale-90"
                title="Reset Jarak Tempuh ke 0"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: VERSI DIPERBESAR / COCKPIT PENUH (Full Telemetry Cockpit)         */}
      {/* ========================================================================= */}
      {sizeMode === 'expanded' && (
        <div className="bg-zinc-950/96 backdrop-blur-lg border border-zinc-700/80 rounded-3xl p-4 shadow-2xl w-[360px] sm:w-[380px] text-zinc-100 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              className="flex items-center gap-2 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-white"
            >
              <GripHorizontal className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Motorcycle Cockpit HUD
                </h3>
                <span className="text-[9px] text-zinc-500 font-mono">
                  Kemiringan Cornering • Tanjakan • Trip
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-1.5 rounded-xl border text-xs font-bold transition active:scale-95 ${
                  showSettings
                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
                title="Pengaturan Kalibrasi"
              >
                <Settings2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleSetSizeMode('standard')}
                className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition active:scale-95"
                title="Kembali ke Ukuran Standar"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Giant Speedometer & Incline Banner */}
          <div className="grid grid-cols-12 gap-3">
            {/* Speed Gauge - 7 cols */}
            <div className="col-span-7 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-wider">
                  Spidometer
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold">
                  Bawaan Motor (+{Math.round((speedCorrectionFactor - 1) * 100)}%)
                </span>
              </div>
              <div className="my-1 flex items-baseline gap-1.5">
                <span className="text-5xl font-black font-mono text-emerald-400 tracking-tight leading-none">
                  {displayedSpeed}
                </span>
                <span className="text-sm font-bold text-zinc-400">km/h</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>GPS Asli: {rawSpeedKmh !== null ? Math.round(rawSpeedKmh) : 0} km/h</span>
                <span>Waktu: {tripTimeFormatted}</span>
              </div>
            </div>

            {/* Tanjakan & Turunan (Slope Grade) - 5 cols */}
            <div className="col-span-5 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-wider">
                Tanjakan/Turun
              </span>
              <div className="my-1">
                <div className="flex items-baseline gap-1">
                  <span
                    className={`text-3xl font-black font-mono leading-none ${
                      isClimbing ? 'text-amber-400' : isDescending ? 'text-sky-400' : 'text-zinc-300'
                    }`}
                  >
                    {isClimbing ? `+${roundedPitch}` : roundedPitch}
                  </span>
                  <span className="text-xs font-bold font-mono">°</span>
                </div>
                <div className="text-[10px] font-mono font-bold mt-1">
                  {isClimbing ? (
                    <span className="text-amber-400">Tanjakan ({pitchPercent}%)</span>
                  ) : isDescending ? (
                    <span className="text-sky-400">Turunan ({pitchPercent}%)</span>
                  ) : (
                    <span className="text-zinc-500">Jalan Datar</span>
                  )}
                </div>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isClimbing ? 'bg-amber-400' : isDescending ? 'bg-sky-400' : 'bg-zinc-600'
                  }`}
                  style={{ width: `${Math.min(100, Math.abs(roundedPitch) * 2.5)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Dedicated Lean Angle Dial & Visualization (Kemiringan Kiri & Kanan) */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-wider">
                Klinometer Rebah Cornering
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-400">
                  Peak: <strong className="text-rose-400">L {maxLeanLeft}°</strong> /{' '}
                  <strong className="text-amber-400">R {maxLeanRight}°</strong>
                </span>
                <button
                  onClick={handleResetPeakLean}
                  className="text-[9px] text-zinc-500 hover:text-zinc-300 font-mono underline"
                >
                  Reset Peak
                </button>
              </div>
            </div>

            {/* Lean Arc Graphic Visualizer */}
            <div className="relative py-2 px-1 flex flex-col items-center">
              {/* Left & Right Labels */}
              <div className="w-full flex items-center justify-between px-2 text-xs font-black font-mono">
                <span className={isLeaningLeft ? 'text-rose-400 animate-pulse' : 'text-zinc-500'}>
                  ◀ KIRI (L)
                </span>
                <span
                  className={`text-lg font-black font-mono ${leanColorClass}`}
                >
                  {isLeaningLeft
                    ? `Kiri ${absLean}°`
                    : isLeaningRight
                    ? `Kanan ${absLean}°`
                    : 'Tegak 0°'}
                </span>
                <span className={isLeaningRight ? 'text-amber-400 animate-pulse' : 'text-zinc-500'}>
                  KANAN (R) ▶
                </span>
              </div>

              {/* Angle Tick Bar Indicator */}
              <div className="w-full mt-2 relative h-5 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex items-center">
                {/* Center marker 0° */}
                <div className="absolute left-1/2 -translate-x-1/2 h-full w-[2px] bg-white z-20" />
                
                {/* 15 deg markers */}
                <div className="absolute left-[33%] h-full w-[1px] bg-zinc-700" />
                <div className="absolute left-[67%] h-full w-[1px] bg-zinc-700" />

                {/* Dynamic Fill Indicator */}
                {roundedRoll < 0 ? (
                  // Leaning Left: fills from center towards left
                  <div
                    className="absolute right-1/2 h-full bg-rose-500 transition-all duration-75"
                    style={{
                      width: `${Math.min(50, (absLean / 50) * 50)}%`,
                    }}
                  />
                ) : (
                  // Leaning Right: fills from center towards right
                  <div
                    className="absolute left-1/2 h-full bg-amber-500 transition-all duration-75"
                    style={{
                      width: `${Math.min(50, (absLean / 50) * 50)}%`,
                    }}
                  />
                )}
              </div>
              <div className="w-full flex justify-between text-[8px] font-mono text-zinc-500 px-1 mt-1">
                <span>-45°</span>
                <span>-15°</span>
                <span className="text-zinc-300">0°</span>
                <span>+15°</span>
                <span>+45°</span>
              </div>
            </div>
          </div>

          {/* Trip Distance & Quick Calibration Controls */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Trip Distance Card */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">
                  Jarak Trip Tempuh
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black font-mono text-zinc-100 leading-none">
                    {tripDistanceKm.toFixed(1)}
                  </span>
                  <span className="text-xs font-bold text-zinc-400">km</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetTrip}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-amber-300 border border-zinc-700 text-xs font-bold font-mono transition active:scale-95 flex items-center gap-1"
                title="Reset Jarak Tempuh ke 0"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Reset</span>
              </button>
            </div>

            {/* Quick Tare / Calibrate Button */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase">
                Kalibrasi Setang/Holder
              </span>
              <button
                onClick={handleCalibrateZero}
                className={`w-full py-1.5 px-2 rounded-xl text-xs font-bold border transition active:scale-95 flex items-center justify-center gap-1.5 ${
                  hasCalibratedRecently
                    ? 'bg-emerald-900 border-emerald-400 text-emerald-200'
                    : 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300 hover:bg-emerald-900'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                <span>{hasCalibratedRecently ? 'Berhasil Dikalibrasi!' : 'Set Posisi Nol'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SETTINGS FLYOUT: Kalibrasi Holder & Koreksi Spidometer Bawaan Motor      */}
      {/* ========================================================================= */}
      {showSettings && (
        <div className="mt-2 bg-zinc-950/98 backdrop-blur-xl border border-zinc-700 rounded-2xl p-4 shadow-2xl w-[320px] text-zinc-100 flex flex-col gap-3.5 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-black uppercase text-zinc-200">
                Pengaturan Kalibrasi
              </span>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="text-zinc-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 1. Spidometer Bawaan Motor Correction */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300">Koreksi Spidometer Motor</span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                +{Math.round((speedCorrectionFactor - 1) * 100)}%
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Spidometer bawaan motor (Honda, Yamaha, Suzuki, Kawasaki) umumnya membaca +5% s/d +7%
              lebih tinggi dari GPS murni.
            </p>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[
                { label: 'GPS (0%)', val: 1.0 },
                { label: '+3%', val: 1.03 },
                { label: '+5%', val: 1.05 },
                { label: '+8%', val: 1.08 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => handleSetSpeedFactor(opt.val)}
                  className={`py-1 rounded-lg text-[10px] font-mono font-bold border transition active:scale-95 ${
                    Math.abs(speedCorrectionFactor - opt.val) < 0.01
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-zinc-800" />

          {/* 2. Kalibrasi Posisi Holder / Setang */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-zinc-300">Kalibrasi Holder / Setang</span>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Tegakkan motor di permukaan datar, lalu tekan tombol di bawah untuk menyamakan posisi
              kemiringan dan sudut holder.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleCalibrateZero}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-950"
              >
                <Crosshair className="w-4 h-4" />
                <span>Nolkan Posisi Holder</span>
              </button>
              {calibration.calibratedAt > 0 && (
                <button
                  onClick={handleResetCalibration}
                  className="py-2 px-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-bold transition active:scale-95"
                  title="Reset offset ke 0"
                >
                  Reset
                </button>
              )}
            </div>
            {calibration.calibratedAt > 0 && (
              <span className="text-[9px] font-mono text-emerald-400/80">
                Terkalibrasi: Roll offset {Math.round(calibration.rollOffset)}°, Pitch offset{' '}
                {Math.round(calibration.pitchOffset)}°
              </span>
            )}
          </div>

          <div className="h-px bg-zinc-800" />

          {/* 3. Posisi HUD */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Posisi Layar HUD:</span>
            <button
              onClick={handleResetPosition}
              className="text-xs text-emerald-400 hover:underline font-mono"
            >
              Reset ke Pojok Kiri Atas
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
