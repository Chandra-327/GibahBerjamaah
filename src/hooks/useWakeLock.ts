import { useState, useEffect, useCallback } from 'react';

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
  const [sentinel, setSentinel] = useState<WakeLockSentinelInstance | null>(null);

  useEffect(() => {
    setIsSupported('wakeLock' in navigator);
  }, []);

  const requestLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return false;
    try {
      const lock = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<WakeLockSentinelInstance> } }).wakeLock.request('screen');
      setSentinel(lock);
      setIsLocked(true);

      lock.addEventListener('release', () => {
        setIsLocked(false);
        setSentinel(null);
      });
      return true;
    } catch (err) {
      console.warn('[WakeLock] Request failed:', err);
      setIsLocked(false);
      return false;
    }
  }, []);

  const releaseLock = useCallback(async () => {
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch (err) {
        console.warn('[WakeLock] Release error:', err);
      }
    }
    setSentinel(null);
    setIsLocked(false);
  }, [sentinel]);

  const toggleLock = useCallback(() => {
    if (isLocked) {
      releaseLock();
    } else {
      requestLock();
    }
  }, [isLocked, requestLock, releaseLock]);

  // Re-acquire lock when app comes back to foreground if it was previously locked
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isLocked && (!sentinel || sentinel.released)) {
        await requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLocked, sentinel, requestLock]);

  return { isLocked, isSupported, requestLock, releaseLock, toggleLock };
}
