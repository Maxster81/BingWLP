import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

/** Stato uniforme di una richiesta asincrona. */
export type AsyncState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Ripete la richiesta (usato da `ErrorState`). */
  reload: () => void;
};

export type UseFetchOptions<T> = {
  /** Se `false` la richiesta non parte (es. parametri non ancora disponibili). */
  enabled?: boolean;
  /** Mantiene i dati precedenti durante un refetch (evita layout jump). */
  keepPreviousData?: boolean;
  /** Dati già disponibili (es. cache in-memory): mostrati subito. */
  initialData?: T | null;
};

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new ApiError('UNKNOWN', value, 0);
  return new ApiError('UNKNOWN', 'Errore inatteso.', 0);
}

/**
 * Hook generico di fetch con stato `{ data, error, loading, reload }`.
 * Annulla la richiesta al cambio di dipendenze/smontaggio tramite `AbortController`
 * e ignora gli errori di abort.
 */
export function useFetch<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options: UseFetchOptions<T> = {},
): AsyncState<T> {
  const { enabled = true, keepPreviousData = false, initialData = null } = options;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const initialRef = useRef<T | null>(initialData);
  initialRef.current = initialData;
  const keepPreviousRef = useRef(keepPreviousData);
  keepPreviousRef.current = keepPreviousData;

  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>(() => ({
    data: initialData,
    error: null,
    loading: enabled,
  }));

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    const controller = new AbortController();
    let active = true;

    setState((prev) => ({
      data: keepPreviousRef.current ? prev.data : initialRef.current,
      error: null,
      loading: true,
    }));

    fetcherRef.current(controller.signal).then(
      (data) => {
        if (!active || controller.signal.aborted) return;
        setState({ data, error: null, loading: false });
      },
      (cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState({ data: null, error: toError(cause), loading: false });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
    // Le dipendenze sono dichiarate dal chiamante; `enabled` e `version` sono interne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { data: state.data, error: state.error, loading: state.loading, reload };
}
