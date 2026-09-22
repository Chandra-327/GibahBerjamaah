export interface Rider {
  userId: string;
  username: string;
  battery: number;
  coords: [number, number] | null;
  heading: number | null;
  speed: number | null;
  isMuted: boolean;
  isSpeaking: boolean;
  audioLevel?: number;
  lastSeen?: number;
  isDj?: boolean;
}

export type IntercomMode = 'ALWAYS_ON' | 'PTT';

export type AudioConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'muted' | 'error';

export type AudioOutputMode = 'speaker' | 'headset';

export interface ConvoyAlert {
  id: string;
  userId: string;
  username: string;
  type: 'DANGER' | 'REST' | 'POLICE' | 'FUEL' | 'LOST' | 'INFO';
  title?: string;
  message: string;
  coords?: [number, number] | null;
  timestamp: number;
}

export interface DJMusicState {
  activeDjId: string | null;
  activeDjName: string | null;
  isDjActive: boolean;
  isPlaying: boolean;
  trackTitle: string;
}

export interface RoomMetadata {
  roomId: string;
  username: string;
  battery: number;
  coords?: [number, number] | null;
}

export interface MusicTrack {
  file?: File;
  url?: string;
  title: string;
  name: string;
  lastModified: number;
}

export type NetworkConnectionMode = 'CLOUD' | 'HOTSPOT_LOCAL';

export interface HotspotConfig {
  mode: NetworkConnectionMode;
  hotspotIp: string; // e.g. '192.168.43.1' (Android default) or custom IP
  port: number; // default 3000
}

