import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MarketCode, Theme } from './api/types';
import { AppHeader } from './components/AppHeader';
import { EmptyState } from './components/EmptyState';
import { ErrorState } from './components/ErrorState';
import { Hero } from './components/Hero';
import { ImageSkeleton, TextSkeleton } from './components/Skeleton';
import { ThemeDetail } from './components/ThemeDetail';
import { ThemeGrid } from './components/ThemeGrid';
import { Toast } from './components/Toast';
import { useConfig } from './hooks/useConfig';
import { useHashRoute } from './hooks/useHashRoute';
import { STORAGE_KEYS, useLocalStorage } from './hooks/useLocalStorage';
import { clearThemeImagesCache } from './hooks/useThemeImages';
import { useThemes } from './hooks/useThemes';
import { formatDate, normalizeText } from './lib/format';
import { t } from './lib/i18n';
import { routeHref, themeRoute, withMarket } from './lib/router';
import './App.css';

/** Scheletro di pagina (hero + griglia) mostrato durante il primo caricamento. */
function HomeSkeleton() {
  return (
    <div className="bwp-skeleton-page" aria-busy="true" aria-live="polite">
      <ImageSkeleton aspectRatio="16 / 5" radius="var(--bwp-radius-xl)" />
      <div className="bwp-skeleton-page__grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="bwp-skeleton-card" key={index}>
            <ImageSkeleton aspectRatio="16 / 9" />
            <TextSkeleton lines={2} />
          </div>
        ))}
      </div>
      <span className="bwp-visually-hidden">{t.loading}</span>
    </div>
  );
}

export default function App() {
  const { route, navigate } = useHashRoute();
  const config = useConfig();
  const [storedMarket, setStoredMarket] = useLocalStorage<MarketCode | null>(STORAGE_KEYS.market, null);
  const [storedResolution, setStoredResolution] = useLocalStorage<string>(STORAGE_KEYS.resolution, '');
  const [query, setQuery] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const notify = useCallback((message: string) => setToast(message), []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Market effettivo: route → localStorage → default del server.
  const market = route.market ?? storedMarket ?? config.data?.defaultMarket ?? null;

  useEffect(() => {
    if (market !== null && market !== storedMarket) setStoredMarket(market);
  }, [market, storedMarket, setStoredMarket]);

  const themes = useThemes(market, refreshNonce);

  const resolutions = useMemo(() => config.data?.resolutions ?? [], [config.data]);
  const resolutionKey = useMemo(() => {
    if (storedResolution.length > 0 && resolutions.some((item) => item.key === storedResolution)) {
      return storedResolution;
    }
    return config.data?.defaultResolution ?? '';
  }, [config.data, resolutions, storedResolution]);

  const handleResolutionChange = useCallback(
    (key: string) => {
      setStoredResolution(key);
    },
    [setStoredResolution],
  );

  const visibleThemes = useMemo<Theme[]>(() => {
    const list = themes.data?.themes ?? [];
    const needle = normalizeText(query);
    return list.filter((theme) => {
      if (onlyNew && !theme.isNew) return false;
      if (needle.length === 0) return true;
      return normalizeText(theme.name).includes(needle) || normalizeText(theme.key).includes(needle);
    });
  }, [onlyNew, query, themes.data]);

  const featured = useMemo<Theme | null>(() => {
    if (visibleThemes.length === 0) return null;
    return (
      visibleThemes.find((theme) => theme.isNew && theme.coverUrl !== null) ??
      visibleThemes.find((theme) => theme.coverUrl !== null) ??
      visibleThemes[0] ??
      null
    );
  }, [visibleThemes]);

  const goHome = useCallback(() => navigate({ kind: 'themes', market }), [market, navigate]);

  const openTheme = useCallback(
    (themeKey: string) => {
      navigate(themeRoute(themeKey, market, null));
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        /* jsdom non implementa scrollTo */
      }
    },
    [market, navigate],
  );

  const handleMarketChange = useCallback(
    (code: MarketCode) => {
      setStoredMarket(code);
      navigate(withMarket(route, code));
    },
    [navigate, route, setStoredMarket],
  );

  const resetFilters = useCallback(() => {
    setQuery('');
    setOnlyNew(false);
  }, []);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    // Svuota la cache in-memory del frontend: il refetch passera' davvero in rete.
    clearThemeImagesCache();
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
    notify(t.refreshDone);
    // Lo spinner resta per un breve giro minimo (feedback visivo) poi si ferma da solo:
    // gli hook reagiscono al nonce e ricaricano con refresh=1.
    window.setTimeout(() => setRefreshing(false), 1200);
  }, [refreshing, notify]);

  const homeHref = routeHref({ kind: 'themes', market });
  const themeRow =
    route.kind === 'theme' ? themes.data?.themes.find((item) => item.key === route.themeKey) ?? null : null;

  useEffect(() => {
    const label = route.kind === 'theme' ? route.themeKey : t.galleryTitle;
    document.title = `${label} · ${t.appName} ${t.appNameAccent}`;
  }, [route]);

  const configReady = config.data !== null;
  const themeErrorCode =
    themes.error && 'code' in themes.error && typeof themes.error.code === 'string' ? themes.error.code : undefined;

  let content: ReactNode = null;

  if (!configReady) {
    content = config.loading ? <HomeSkeleton /> : <ErrorState message={t.errorConfig} onRetry={config.reload} />;
  } else if (route.kind === 'theme') {
    content = (
      <ThemeDetail
        themeKey={route.themeKey}
        market={market}
        theme={themeRow}
        resolutions={resolutions}
        resolutionKey={resolutionKey}
        onResolutionChange={handleResolutionChange}
        onNotify={notify}
        lightboxIndex={route.index}
        onOpenLightbox={(index) => navigate(themeRoute(route.themeKey, market, index))}
        onCloseLightbox={() => navigate(themeRoute(route.themeKey, market, null))}
        onBack={goHome}
        homeHref={homeHref}
        refreshNonce={refreshNonce}
      />
    );
  } else if (themes.loading && themes.data === null) {
    content = <HomeSkeleton />;
  } else if (themes.error !== null && themes.data === null) {
    content = <ErrorState message={t.errorThemes} code={themeErrorCode} onRetry={themes.reload} />;
  } else if (themes.data !== null) {
    const catalogEmpty = themes.data.themes.length === 0;
    content = (
      <>
        {themes.data.stale ? (
          <p className="bwp-gallery__stale">
            <span
              className="bwp-badge bwp-badge--stale"
              title={`${t.staleHint} · ${formatDate(themes.data.fetchedAt)}`}
            >
              {t.staleBadge}
            </span>
          </p>
        ) : null}

        {visibleThemes.length === 0 ? (
          <EmptyState
            title={catalogEmpty ? t.emptyThemesTitle : t.emptySearchTitle}
            message={catalogEmpty ? t.emptyThemesMessage : t.emptySearchMessage}
            icon="search"
            actionLabel={catalogEmpty ? undefined : t.emptySearchAction}
            onAction={catalogEmpty ? undefined : resetFilters}
          />
        ) : (
          <>
            {featured ? (
              <Hero theme={featured} href={routeHref(themeRoute(featured.key, market))} onOpen={openTheme} />
            ) : null}

            <section className="bwp-gallery" aria-labelledby="bwp-gallery-title">
              <header className="bwp-gallery__header">
                <h1 className="bwp-gallery__title" id="bwp-gallery-title">
                  {t.galleryTitle}
                </h1>
                <p className="bwp-gallery__subtitle">{t.gallerySubtitle}</p>
                <span className="bwp-gallery__count">{t.themeCount(visibleThemes.length)}</span>
              </header>
              <ThemeGrid
                themes={visibleThemes}
                hrefFor={(themeKey) => routeHref(themeRoute(themeKey, market))}
                onOpen={openTheme}
              />
            </section>
          </>
        )}
      </>
    );
  }

  return (
    <div className="bwp-app">
      <a className="bwp-skip-link" href="#bwp-main">
        {t.skipToContent}
      </a>

      <AppHeader
        markets={config.data?.markets ?? []}
        market={market}
        onMarketChange={handleMarketChange}
        query={query}
        onQueryChange={setQuery}
        onlyNew={onlyNew}
        onOnlyNewChange={setOnlyNew}
        onHome={goHome}
        homeHref={homeHref}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        context={route.kind === 'theme' ? route.themeKey : undefined}
      />

      <main className="bwp-main" id="bwp-main">
        {content}
      </main>

      <footer className="bwp-footer">
        <p className="bwp-footer__note">{t.footerNote}</p>
        <p className="bwp-footer__source">{t.footerSource}</p>
      </footer>

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}

