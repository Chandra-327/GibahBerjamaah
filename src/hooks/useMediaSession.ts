import { useEffect } from 'react';

interface UseMediaSessionOptions {
  callsign: string;
  roomId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  onToggleMute: () => void;
  onPttPress?: () => void;
  onPttRelease?: () => void;
}

export function useMediaSession({
  callsign,
  roomId,
  isMuted,
  isSpeaking,
  onToggleMute,
}: UseMediaSessionOptions) {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Intercom: ${callsign} [${isMuted ? 'MUTED' : isSpeaking ? 'SPEAKING' : 'LISTENING'}]`,
        artist: `Room: ${roomId}`,
        album: 'Gibah Berjamaah STB Touring',
        artwork: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });

      // Map Bluetooth headset buttons (Play, Pause, Stop, Next, Previous)
      navigator.mediaSession.setActionHandler('play', () => {
        // Unmute on Bluetooth Play button
        if (isMuted) onToggleMute();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        // Mute on Bluetooth Pause button
        if (!isMuted) onToggleMute();
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        if (!isMuted) onToggleMute();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        onToggleMute();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        onToggleMute();
      });
    } catch (err) {
      console.warn('MediaSession handler registration failed:', err);
    }

    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('stop', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
        } catch {}
      }
    };
  }, [callsign, roomId, isMuted, isSpeaking, onToggleMute]);
}
