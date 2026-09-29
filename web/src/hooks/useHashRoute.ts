import { useCallback, useEffect, useRef, useState } from 'react';
import { parseHash, serializeRoute } from '../lib/router';
import type { Route } from '../lib/router';

export type HashRouteState = {
  route: Route;
  /** Naviga verso una route; `replace` non aggiunge una voce di cronologia. */
  navigate: (next: Route, options?: { replace?: boolean }) => void;
};

function currentHash(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash;
}

/**
 * Router hash minimale: legge `window.location.hash`, ascolta `hashchange`/`popstate`
 * e serializza le route in modo canonico. Deep-link e tasto "indietro" funzionano nativamente.
 */
export function useHashRoute(): HashRouteState {
  const [route, setRoute] = useState<Route>(() => parseHash(currentHash()));

  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    // Evita aggiornamenti ridondanti quando l'evento non cambia davvero la route
    // (es. dopo `navigate`, che ha già aggiornato lo stato).
    const sync = (): void => {
      const next = parseHash(currentHash());
      if (serializeRoute(next) === serializeRoute(routeRef.current)) return;
      setRoute(next);
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const navigate = useCallback((next: Route, options?: { replace?: boolean }) => {
    const hash = serializeRoute(next);
    setRoute(parseHash(hash));
    if (typeof window === 'undefined') return;
    if (options?.replace) {
      window.history.replaceState(null, '', hash);
      return;
    }
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  return { route, navigate };
}
