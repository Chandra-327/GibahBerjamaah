import { useState, useEffect, useCallback, useRef } from 'react';

// Defines the WakeLockSentinel interface for TypeScript
interface WakeLockSentinelInstance extends EventTarget {
  released: boolean;
  type: 'screen';
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
  removeEventListener: (type: 'release', listener: () => void) => void;
}

export function useWakeLock() {
  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const sentinelRef = useRef<WakeLockSentinelInstance | null>(null);
  const desiredLockedRef = useRef(false);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setIsSupported('wakeLock' in navigator || 'request' in (navigator as unknown as { wakeLock?: unknown }));
  }, []);

  // Video fallback for browsers/OS that restrict WakeLock API in battery saving mode
  const ensureFallbackVideo = useCallback((active: boolean) => {
    try {
      if (active) {
        if (!fallbackVideoRef.current) {
          const video = document.createElement('video');
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          video.loop = true;
          video.style.position = 'fixed';
          video.style.width = '1px';
          video.style.height = '1px';
          video.style.opacity = '0.01';
          video.style.pointerEvents = 'none';

          // 1-frame blank canvas video source
          const canvas = document.createElement('canvas');
          canvas.width = 2;
          canvas.height = 2;
          const stream = canvas.captureStream ? canvas.captureStream(1) : null;
          if (stream) {
            video.srcObject = stream;
            video.play().catch(() => {});
          }
          document.body.appendChild(video);
          fallbackVideoRef.current = video;
        } else if (fallbackVideoRef.current.paused) {
          fallbackVideoRef.current.play().catch(() => {});
        }
      } else if (fallbackVideoRef.current) {
        fallbackVideoRef.current.pause();
        fallbackVideoRef.current.remove();
        fallbackVideoRef.current = null;
      }
    } catch {}
  }, []);

  const requestLock = useCallback(async () => {
    desiredLockedRef.current = true;
    let acquired = false;

    if ('wakeLock' in navigator) {
      try {
        const lock = await (navigator as unknown as {
          wakeLock: { request: (type: string) => Promise<WakeLockSentinelInstance> };
        }).wakeLock.request('screen');

        sentinelRef.current = lock;
        setIsLocked(true);
        acquired = true;

        lock.addEventListener('release', () => {
          sentinelRef.current = null;
          // Notice: We do NOT reset desiredLockedRef here,
          // so when page becomes visible again, it automatically re-acquires!
          setIsLocked(false);
        });
      } catch (err) {
        console.warn('[WakeLock] Native request failed, using video fallback:', err);
      }
    }

    // Always engage video fallback as a dual-layer guarantee for touring
    ensureFallbackVideo(true);
    setIsLocked(true);
    return acquired || true;
  }, [ensureFallbackVideo]);

  const releaseLock = useCallback(async () => {
    desiredLockedRef.current = false;
    ensureFallbackVideo(false);

    if (sentinelRef.current && !sentinelRef.current.released) {
      try {
        await sentinelRef.current.release();
      } catch (err) {
        console.warn('[WakeLock] Release error:', err);
      }
    }
    sentinelRef.current = null;
    setIsLocked(false);
  }, [ensureFallbackVideo]);

  const toggleLock = useCallback(() => {
    if (isLocked || desiredLockedRef.current) {
      releaseLock();
    } else {
      requestLock();
    }
  }, [isLocked, requestLock, releaseLock]);

  // Re-acquire lock whenever app comes back to foreground (e.g. from Google Maps or lock screen)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && desiredLockedRef.current) {
        console.log('[WakeLock] App visible again, re-acquiring screen lock...');
        await requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [requestLock]);

  return { isLocked, isSupported, requestLock, releaseLock, toggleLock };
}
