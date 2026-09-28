import { useCallback, useEffect, useState } from 'react';

function readValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeValue<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage non disponibile (privato/quota): la UI continua a funzionare in memoria */
  }
}

/** Stato persistito in `localStorage` (JSON), con fallback silenzioso se lo storage è bloccato. */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [stored, setStored] = useState<T>(() => readValue(key, initialValue));

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStored((prev) => {
        const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
        writeValue(key, next);
        return next;
      });
    },
    [key],
  );

  // Sincronizza fra schede/sessioni diverse.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== key) return;
      setStored(readValue(key, initialValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // `initialValue` è volutamente escluso: cambierebbe identità a ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [stored, setValue];
}

export const STORAGE_KEYS = {
  market: 'bwp.market',
  resolution: 'bwp.resolution',
} as const;
