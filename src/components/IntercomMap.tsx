import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Rider, ConvoyAlert } from '../types';
import { Locate, Navigation, Users, AlertTriangle, ShieldAlert, Coffee, Fuel } from 'lucide-react';

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

  // Update Convoy Alerts pins with 5-minute (300000ms) Auto-Dismiss & Per-Rider deduplication
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
      let pinSymbol = '!';
      if (alert.type === 'FUEL') {
        pinColor = '#eab308';
        pinSymbol = '⛽';
      } else if (alert.type === 'REST') {
        pinColor = '#3b82f6';
        pinSymbol = '☕';
      } else if (alert.type === 'STOP') {
        pinColor = '#b91c1c';
        pinSymbol = '🛑';
      }

      const iconHtml = `
        <div class="relative flex flex-col items-center select-none" style="transform: translate(-50%, -50%);">
          <div class="w-8 h-8 rounded-full border-2 border-white text-white flex items-center justify-center shadow-lg animate-bounce" style="background-color: ${pinColor};">
            <span class="text-xs font-black">${pinSymbol}</span>
          </div>
          <div class="mt-1 px-2 py-0.5 bg-zinc-950/95 border text-white text-[10px] font-bold rounded shadow whitespace-nowrap" style="border-color: ${pinColor};">
            ${alert.message}
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
          <strong>${alert.username}</strong>: ${alert.message}<br/>
          <span class="text-zinc-500">${new Date(alert.timestamp).toLocaleTimeString()} (Hapus otomatis dalam 5 mnt)</span>
        </div>
      `);
      alertMarkersRef.current[riderKey] = marker;

      // Auto-dismiss from map after 5 minutes (300,000 ms)
      setTimeout(() => {
        if (alertMarkersRef.current[riderKey]) {
          alertMarkersRef.current[riderKey].remove();
          delete alertMarkersRef.current[riderKey];
        }
      }, 300000);
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

      {/* Speed & Heading HUD Overlay (Top-Left) */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800 rounded-xl px-3 py-2 shadow-2xl flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] tracking-wider text-zinc-400 uppercase font-mono font-bold">Speed</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-400 font-mono">
                {mySpeed !== null && mySpeed > 1 ? Math.round(mySpeed * 3.6) : 0}
              </span>
              <span className="text-[10px] text-zinc-400 font-bold">km/h</span>
            </div>
          </div>
          <div className="h-7 w-px bg-zinc-800" />
          <div className="flex flex-col">
            <span className="text-[10px] tracking-wider text-zinc-400 uppercase font-mono font-bold">Heading</span>
            <span className="text-sm font-bold text-zinc-200 font-mono">
              {myHeading !== null ? `${Math.round(myHeading)}°` : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
