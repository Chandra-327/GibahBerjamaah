import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Rider, ConvoyAlert } from '../types';
import { Locate, Navigation, Users, AlertTriangle, ShieldAlert, Coffee, Fuel, RotateCcw, Compass, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface IntercomMapProps {
  myCoords: [number, number] | null;
  myCallsign: string;
  myBattery: number;
  myHeading: number | null;
  mySpeed: number | null;
  isMySpeaking: boolean;
  riders: Rider[];
  alerts: ConvoyAlert[];
  followMe: boolean;
  onToggleFollowMe: () => void;
  onSelectRider?: (rider: Rider) => void;
}

export const IntercomMap: React.FC<IntercomMapProps> = ({
  myCoords,
  myCallsign,
  myBattery,
  myHeading,
  mySpeed,
  isMySpeaking,
  riders,
  alerts,
  followMe,
  onToggleFollowMe,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const myMarkerRef = useRef<L.Marker | null>(null);
  const remoteMarkersRef = useRef<Record<string, L.Marker>>({});
  const alertMarkersRef = useRef<Record<string, L.Marker>>({});
  const [mapReady, setMapReady] = useState(false);

  // Odometer (Jarak Tempuh yang bisa di-reset)
  const [tripDistanceKm, setTripDistanceKm] = useState<number>(() => {
    const saved = localStorage.getItem('gibah_trip_distance_km');
    return saved ? parseFloat(saved) || 0 : 0;
  });
  const lastCoordsRef = useRef<[number, number] | null>(null);

  // Klinometer (Kemiringan motor saat cornering / tanjakan-turunan)
  const [leanAngle, setLeanAngle] = useState<number>(0); // Roll / Cornering angle (-50° s/d +50°)
  const [pitchAngle, setPitchAngle] = useState<number>(0); // Pitch / Incline-Decline (-45° s/d +45°)
  const [pitchOffset, setPitchOffset] = useState<number>(() => {
    const saved = localStorage.getItem('gibah_pitch_offset');
    return saved !== null ? parseFloat(saved) || 0 : 45; // Default 45 deg mount angle di stang motor
  });
  const [rollOffset, setRollOffset] = useState<number>(() => {
    const saved = localStorage.getItem('gibah_roll_offset');
    return saved !== null ? parseFloat(saved) || 0 : 0;
  });
  const rawOrientationRef = useRef<{ gamma: number; beta: number }>({ gamma: 0, beta: 45 });

  // Haversine formula untuk hitung akumulasi jarak perpindahan GPS (km)
  useEffect(() => {
    if (!myCoords) return;

    if (!lastCoordsRef.current) {
      lastCoordsRef.current = myCoords;
      return;
    }

    const [lat1, lon1] = lastCoordsRef.current;
    const [lat2, lon2] = myCoords;

    const R = 6371; // Radius bumi dalam KM
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

    // Filter drift GPS: hanya tambahkan jika gerak nyata minimal 5 meter (0.005 km) dan wajar di bawah 2 km per update
    if (deltaKm >= 0.005 && deltaKm < 2.0) {
      setTripDistanceKm((prev) => {
        const next = Math.round((prev + deltaKm) * 100) / 100;
        localStorage.setItem('gibah_trip_distance_km', next.toString());
        return next;
      });
      lastCoordsRef.current = myCoords;
    }
  }, [myCoords]);

  // Sensor Gyroscope / DeviceOrientation untuk Klinometer
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        rawOrientationRef.current = { gamma: e.gamma, beta: e.beta };
        // Hitung sudut bersih setelah dikurangi offset kalibrasi stang motor
        const roll = Math.round(e.gamma - rollOffset);
        const pitch = Math.round(e.beta - pitchOffset);
        setLeanAngle(Math.max(-55, Math.min(55, roll)));
        setPitchAngle(Math.max(-50, Math.min(50, pitch)));
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation);
    }
    return () => {
      if (window.DeviceOrientationEvent) {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
    };
  }, [rollOffset, pitchOffset]);

  // Kalibrasi posisi 0° saat HP terpasang di holder stang motor
  const handleCalibrateClinometer = () => {
    const curGamma = Math.round(rawOrientationRef.current.gamma);
    const curBeta = Math.round(rawOrientationRef.current.beta);
    setRollOffset(curGamma);
    setPitchOffset(curBeta);
    localStorage.setItem('gibah_roll_offset', curGamma.toString());
    localStorage.setItem('gibah_pitch_offset', curBeta.toString());
    setLeanAngle(0);
    setPitchAngle(0);
  };

  const handleResetTrip = () => {
    setTripDistanceKm(0);
    localStorage.setItem('gibah_trip_distance_km', '0');
    lastCoordsRef.current = myCoords;
  };

  // Helper for battery badge color
  const getBatteryColor = (level: number) => {
    if (level > 50) return '#22c55e'; // green
    if (level > 20) return '#eab308'; // yellow
    return '#ef4444'; // red
  };

  // Create custom HTML marker for riders
  const createRiderIcon = (
    callsign: string,
    battery: number,
    isSpeaking: boolean,
    isMe: boolean,
    heading: number | null,
    speed: number | null
  ) => {
    const battColor = getBatteryColor(battery);
    const borderColor = isMe ? '#22c55e' : '#38bdf8';
    const bgColor = isMe ? '#052e16' : '#082f49';
    const speedText = speed !== null && speed > 2 ? `${Math.round(speed * 3.6)} km/h` : '';

    const html = `
      <div class="relative flex flex-col items-center pointer-events-auto select-none" style="transform: translate(-50%, -50%);">
        <!-- Label and Battery Tag -->
        <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full border shadow-lg whitespace-nowrap text-[11px] font-black ${
          isSpeaking ? 'bg-emerald-950 border-emerald-400 text-emerald-300 shadow-emerald-500/50' : 'bg-zinc-950/90 border-zinc-700 text-zinc-100'
        }">
          <span>${callsign}</span>
          <span style="color: ${battColor};" class="font-mono text-[10px]">${battery}%</span>
          ${speedText ? `<span class="text-[9px] text-amber-400 font-mono">(${speedText})</span>` : ''}
        </div>

        <!-- Marker Pin & Pulse Dot -->
        <div class="relative mt-1">
          ${
            isSpeaking
              ? `<div class="absolute -inset-2 rounded-full bg-emerald-500/40 animate-ping"></div>`
              : ''
          }
          <div class="w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-2xl transition-all ${
            isSpeaking ? 'ring-4 ring-emerald-400 scale-110' : ''
          }" style="background-color: ${bgColor}; border-color: ${borderColor};">
            ${
              heading !== null
                ? `<div style="transform: rotate(${heading}deg); transition: transform 0.3s ease;">
                    <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="12,2 19,21 12,17 5,21" />
                    </svg>
                   </div>`
                : `<div class="w-3.5 h-3.5 rounded-full" style="background-color: ${isMe ? '#22c55e' : '#38bdf8'};"></div>`
            }
          </div>
        </div>
      </div>
    `;

    return L.divIcon({
      className: 'custom-rider-icon',
      html,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center to Jakarta / Indonesia, or current GPS
    const defaultCenter: [number, number] = myCoords || [-6.2088, 106.8456];

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark Matter tile layer by CartoDB (free & open, no API key required)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    mapInstanceRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update local rider marker
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !myCoords) return;

    const map = mapInstanceRef.current;
    const icon = createRiderIcon(
      myCallsign,
      myBattery,
      isMySpeaking,
      true,
      myHeading,
      mySpeed
    );

    if (!myMarkerRef.current) {
      myMarkerRef.current = L.marker(myCoords, { icon, zIndexOffset: 1000 }).addTo(map);
    } else {
      myMarkerRef.current.setLatLng(myCoords);
      myMarkerRef.current.setIcon(icon);
    }

    if (followMe) {
      map.panTo(myCoords, { animate: true, duration: 0.6 });
    }
  }, [mapReady, myCoords, myCallsign, myBattery, myHeading, mySpeed, isMySpeaking, followMe]);

  // Update remote riders markers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const currentRiderIds = new Set(riders.map((r) => r.userId));

    // Remove disconnected markers
    for (const [userId, marker] of Object.entries(remoteMarkersRef.current)) {
      if (!currentRiderIds.has(userId)) {
        (marker as L.Marker).remove();
        delete remoteMarkersRef.current[userId];
      }
    }

    // Add or update active riders
    for (const rider of riders) {
      if (!rider.coords) continue;

      const icon = createRiderIcon(
        rider.username,
        rider.battery,
        rider.isSpeaking,
        false,
        rider.heading,
        rider.speed
      );

      if (!remoteMarkersRef.current[rider.userId]) {
        const marker = L.marker(rider.coords, { icon, zIndexOffset: 500 }).addTo(map);
        remoteMarkersRef.current[rider.userId] = marker;
      } else {
        remoteMarkersRef.current[rider.userId].setLatLng(rider.coords);
        remoteMarkersRef.current[rider.userId].setIcon(icon);
      }
    }
  }, [mapReady, riders]);

  // Update Convoy Alerts pins with 3-minute (180000ms) Auto-Dismiss & Per-Rider deduplication
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    for (const alert of alerts) {
      if (!alert.coords) continue;
      const riderKey = alert.username || alert.id;

      // Deduplicate: If this rider already has a marker on map, clear it
      if (alertMarkersRef.current[riderKey]) {
        alertMarkersRef.current[riderKey].remove();
        delete alertMarkersRef.current[riderKey];
      }

      let pinColor = '#ef4444';
      let pinSymbol = '⚠️';
      if (alert.type === 'FUEL') {
        pinColor = '#2563eb';
        pinSymbol = '⛽';
      } else if (alert.type === 'REST') {
        pinColor = '#d97706';
        pinSymbol = '☕';
      } else if (alert.type === 'POLICE') {
        pinColor = '#ea580c';
        pinSymbol = '🛡️';
      } else if (alert.type === 'LOST') {
        pinColor = '#9333ea';
        pinSymbol = '👥';
      } else if (alert.type === 'INFO') {
        pinColor = '#0891b2';
        pinSymbol = '🌧️';
      }

      const alertDisplayTitle = alert.title || alert.message || 'Alert';
      const iconHtml = `
        <div class="relative flex flex-col items-center select-none" style="transform: translate(-50%, -50%);">
          <div class="w-8 h-8 rounded-full border-2 border-white text-white flex items-center justify-center shadow-lg animate-bounce" style="background-color: ${pinColor};">
            <span class="text-xs font-black">${pinSymbol}</span>
          </div>
          <div class="mt-1 px-2 py-0.5 bg-zinc-950/95 border text-white text-[10px] font-bold rounded shadow whitespace-nowrap" style="border-color: ${pinColor};">
            <span class="text-amber-300 font-mono">${alert.username}</span>: ${alertDisplayTitle}
          </div>
        </div>
      `;

      const alertIcon = L.divIcon({
        className: 'alert-pin-icon',
        html: iconHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker(alert.coords, { icon: alertIcon, zIndexOffset: 800 }).addTo(map);
      marker.bindPopup(`
        <div class="text-zinc-900 p-1 text-xs">
          <strong>${alert.username}</strong>: ${alert.title ? alert.title + ' - ' : ''}${alert.message}<br/>
          <span class="text-zinc-500">${new Date(alert.timestamp).toLocaleTimeString()} (Hapus otomatis dalam 3 mnt)</span>
        </div>
      `);
      alertMarkersRef.current[riderKey] = marker;

      // Auto-dismiss from map after 3 minutes (180,000 ms)
      setTimeout(() => {
        if (alertMarkersRef.current[riderKey]) {
          alertMarkersRef.current[riderKey].remove();
          delete alertMarkersRef.current[riderKey];
        }
      }, 180000);
    }
  }, [mapReady, alerts]);

  // Recenter to all riders
  const fitAllRiders = () => {
    if (!mapInstanceRef.current) return;
    const points: L.LatLngExpression[] = [];
    if (myCoords) points.push(myCoords);
    riders.forEach((r) => {
      if (r.coords) points.push(r.coords);
    });

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* The Leaflet Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Tactical Overlay Controls (Glove-Friendly) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2.5">
        {/* Follow Me Toggle */}
        <button
          onClick={onToggleFollowMe}
          className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-xl transition-all active:scale-95 ${
            followMe
              ? 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-600/40 ring-2 ring-emerald-400'
              : 'bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:text-white'
          }`}
          title="Auto Center (Follow Me)"
        >
          <Navigation className={`w-6 h-6 ${followMe ? 'fill-current animate-pulse' : ''}`} />
        </button>

        {/* Fit Convoy in View */}
        <button
          onClick={fitAllRiders}
          className="w-12 h-12 rounded-xl flex items-center justify-center bg-zinc-900/90 border border-zinc-700 text-zinc-300 hover:text-white shadow-xl transition-all active:scale-95"
          title="Lihat Seluruh Rombongan (Fit Convoy)"
        >
          <Users className="w-6 h-6" />
        </button>

        {/* Center to My Location */}
        {myCoords && (
          <button
            onClick={() => {
              if (mapInstanceRef.current && myCoords) {
                mapInstanceRef.current.setView(myCoords, 16, { animate: true });
              }
            }}
            className="w-12 h-12 rounded-xl flex items-center justify-center bg-zinc-900/90 border border-zinc-700 text-zinc-300 hover:text-white shadow-xl transition-all active:scale-95"
            title="Lokasi Saya"
          >
            <Locate className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* HUD Telemetry Panel on Left Side (Speed, Trip, & Expanded Dual-Section Klinometer) */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto flex flex-col gap-2 max-w-[275px] select-none">
        {/* 1. Bar Atas: Speed & Trip Distance (Resettable) */}
        <div className="bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-2xl p-2.5 shadow-2xl flex items-center justify-between gap-3">
          {/* Speed */}
          <div className="flex flex-col min-w-[54px]">
            <span className="text-[9px] tracking-wider text-zinc-400 uppercase font-mono font-bold">Speed</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight leading-none">
                {mySpeed !== null && mySpeed > 1 ? Math.round(mySpeed * 3.6) : 0}
              </span>
              <span className="text-[10px] text-zinc-400 font-bold">km/h</span>
            </div>
          </div>

          <div className="h-7 w-px bg-zinc-800" />

          {/* Trip Distance (Rekaman Jarak Tempuh dengan tombol Reset) */}
          <div className="flex flex-col min-w-[70px]">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[9px] tracking-wider text-amber-400 uppercase font-mono font-bold">Trip</span>
              <button
                type="button"
                onClick={handleResetTrip}
                className="p-1 rounded-md bg-zinc-800 hover:bg-zinc-700 active:scale-90 text-zinc-400 hover:text-amber-300 transition-all"
                title="Reset Jarak Tempuh ke 0"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-black text-zinc-100 font-mono tracking-tight leading-none">
                {tripDistanceKm.toFixed(1)}
              </span>
              <span className="text-[10px] text-zinc-400 font-bold">km</span>
            </div>
          </div>
        </div>

        {/* 2. Expanded Dual-Section Klinometer (Kemiringan Kiri/Kanan & Tanjakan/Turunan) */}
        <div className="bg-zinc-950/92 backdrop-blur-md border border-zinc-800 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-2.5 text-zinc-200">
          {/* Header Klinometer + Tombol Kalibrasi Tare 0° */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] tracking-wider text-sky-400 uppercase font-mono font-black">
                Klinometer Motor
              </span>
            </div>
            <button
              type="button"
              onClick={handleCalibrateClinometer}
              className="text-[9px] px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-90 text-sky-300 border border-sky-500/30 font-mono font-bold flex items-center gap-1 transition"
              title="Nol-kan / Kalibrasi posisi HP saat tegak di stang motor"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Kalibrasi 0°</span>
            </button>
          </div>

          {/* BAGIAN 1: KEMIRINGAN TIKUNGAN (KIRI vs KANAN) */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[8px] text-zinc-400 font-mono font-bold">
              <span>KEMIRINGAN MOTOR</span>
              <span
                className={`font-black ${
                  Math.abs(leanAngle) > 28
                    ? 'text-red-400'
                    : Math.abs(leanAngle) > 15
                    ? 'text-yellow-400'
                    : leanAngle !== 0
                    ? 'text-emerald-400'
                    : 'text-zinc-500'
                }`}
              >
                {leanAngle < -2 ? `REBAH KIRI` : leanAngle > 2 ? `REBAH KANAN` : `TEGAK 0°`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {/* Kolom Kiri */}
              <div
                className={`p-2 rounded-xl border flex items-center justify-between transition-all ${
                  leanAngle < -2
                    ? Math.abs(leanAngle) > 28
                      ? 'bg-red-950/50 border-red-500/50 text-red-200'
                      : Math.abs(leanAngle) > 15
                      ? 'bg-amber-950/50 border-amber-500/50 text-amber-200'
                      : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-[8px] font-mono font-bold uppercase tracking-wider">◀ Kiri</span>
                  <span className="text-lg font-black font-mono leading-none mt-0.5">
                    {leanAngle < 0 ? `${Math.abs(leanAngle)}°` : '0°'}
                  </span>
                </div>
                {/* Visual Banking Arc */}
                <div className="relative w-6 h-6 rounded-full bg-zinc-950 border border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
                  <div className="absolute w-full h-[1px] bg-zinc-700" />
                  <div
                    className="absolute w-5 h-[2px] rounded-full transition-transform duration-100 ease-out"
                    style={{
                      transform: `rotate(${leanAngle < 0 ? leanAngle : 0}deg)`,
                      backgroundColor: leanAngle < -2 ? '#34d399' : '#71717a',
                    }}
                  />
                  <div className="w-1 h-1 rounded-full bg-zinc-300 z-10" />
                </div>
              </div>

              {/* Kolom Kanan */}
              <div
                className={`p-2 rounded-xl border flex items-center justify-between transition-all ${
                  leanAngle > 2
                    ? leanAngle > 28
                      ? 'bg-red-950/50 border-red-500/50 text-red-200'
                      : leanAngle > 15
                      ? 'bg-amber-950/50 border-amber-500/50 text-amber-200'
                      : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                }`}
              >
                {/* Visual Banking Arc */}
                <div className="relative w-6 h-6 rounded-full bg-zinc-950 border border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
                  <div className="absolute w-full h-[1px] bg-zinc-700" />
                  <div
                    className="absolute w-5 h-[2px] rounded-full transition-transform duration-100 ease-out"
                    style={{
                      transform: `rotate(${leanAngle > 0 ? leanAngle : 0}deg)`,
                      backgroundColor: leanAngle > 2 ? '#34d399' : '#71717a',
                    }}
                  />
                  <div className="w-1 h-1 rounded-full bg-zinc-300 z-10" />
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[8px] font-mono font-bold uppercase tracking-wider">Kanan ▶</span>
                  <span className="text-lg font-black font-mono leading-none mt-0.5">
                    {leanAngle > 0 ? `${leanAngle}°` : '0°'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-zinc-800/80" />

          {/* BAGIAN 2: KONTUR JALAN (TANJAKAN ▲ NAIK & TURUNAN ▼ TURUN) */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[8px] text-zinc-400 font-mono font-bold">
              <span>KONTUR JALAN</span>
              <span
                className={`font-black ${
                  pitchAngle > 8
                    ? 'text-amber-400'
                    : pitchAngle > 2
                    ? 'text-amber-300'
                    : pitchAngle < -8
                    ? 'text-sky-400'
                    : pitchAngle < -2
                    ? 'text-sky-300'
                    : 'text-zinc-500'
                }`}
              >
                {pitchAngle > 8
                  ? '▲ TANJAKAN CURAM'
                  : pitchAngle > 2
                  ? '▲ MENANJAK'
                  : pitchAngle < -8
                  ? '▼ TURUNAN CURAM'
                  : pitchAngle < -2
                  ? '▼ MENURUN'
                  : 'DATAR 0°'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {/* Kolom Tanjakan Naik */}
              <div
                className={`p-2 rounded-xl border flex items-center justify-between transition-all ${
                  pitchAngle > 2
                    ? 'bg-amber-950/50 border-amber-500/60 text-amber-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                }`}
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase">
                    <span className="text-amber-400 font-black">▲</span>
                    <span>Naik</span>
                  </div>
                  <span className="text-lg font-black font-mono leading-none mt-0.5">
                    {pitchAngle > 0 ? `+${pitchAngle}°` : '0°'}
                  </span>
                </div>
                <div className={`p-1 rounded-md ${pitchAngle > 2 ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-600'}`}>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Kolom Turunan Turun */}
              <div
                className={`p-2 rounded-xl border flex items-center justify-between transition-all ${
                  pitchAngle < -2
                    ? 'bg-sky-950/50 border-sky-500/60 text-sky-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                }`}
              >
                <div className={`p-1 rounded-md ${pitchAngle < -2 ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-800 text-zinc-600'}`}>
                  <ArrowDownRight className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase">
                    <span>Turun</span>
                    <span className="text-sky-400 font-black">▼</span>
                  </div>
                  <span className="text-lg font-black font-mono leading-none mt-0.5">
                    {pitchAngle < 0 ? `${pitchAngle}°` : '0°'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
