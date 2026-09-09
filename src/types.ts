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
  message: string;
  coords?: [number, number] | null;
  timestamp: number;
}

export interface DJMusicState {
  userId: string;
  djName: string;
  isPlaying: boolean;
  trackTitle: string;
}

export interface DJCaptainState {
  userId: string;
  djName: string;
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
