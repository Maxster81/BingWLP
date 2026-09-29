import { useEffect, useState } from 'react';
import type { MarketCode, Resolution, Theme, ThemeKey } from '../api/types';
import { useThemeImages } from '../hooks/useThemeImages';
import { clampIndex, formatDate } from '../lib/format';
import { t } from '../lib/i18n';
import { Carousel } from './Carousel';
import { DownloadButton } from './DownloadButton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Icon } from './Icon';
import { ImageSkeleton, Skeleton } from './Skeleton';
import { Lightbox } from './Lightbox';
import { ResolutionPicker } from './ResolutionPicker';
import { ThumbnailStrip } from './ThumbnailStrip';
import './ThemeDetail.css';

export type ThemeDetailProps = {
  themeKey: ThemeKey;
  market: MarketCode | null;
  /** Riga dal listato temi (nome/badge) quando già disponibile. */
  theme: Theme | null;
  resolutions: Resolution[];
  resolutionKey: string;
  onResolutionChange: (key: string) => void;
  onNotify: (message: string) => void;
  /** Indice della lightbox secondo la route (`null` = chiusa). */
  lightboxIndex: number | null;
  onOpenLightbox: (index: number) => void;
  onCloseLightbox: () => void;
  onBack: () => void;
  homeHref: string;
};

/** Dettaglio tema: breadcrumb, hero, carosello, miniature, metadata, download e lightbox. */
export function ThemeDetail({
  themeKey,
  market,
  theme,
  resolutions,
  resolutionKey,
  onResolutionChange,
  onNotify,
  lightboxIndex,
  onOpenLightbox,
  onCloseLightbox,
  onBack,
  homeHref,
}: ThemeDetailProps) {
  const { data, error, loading, reload } = useThemeImages(market, themeKey);
  const images = data?.images ?? [];
  const total = images.length;
  const summary = data?.theme ?? null;
  const name = theme?.name ?? summary?.name ?? themeKey;
  const isNew = theme?.isNew ?? summary?.isNew ?? false;
  const themeType = theme?.type ?? summary?.type ?? 'Regular';

  const [current, setCurrent] = useState(0);

  // Se le immagini diminuiscono (o cambia tema) l'indice non deve uscire dal range.
  useEffect(() => {
    if (total > 0 && current >= total) setCurrent(0);
  }, [current, total]);

  // La route è la fonte di verità quando la lightbox è aperta.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const safe = total > 0 ? Math.min(lightboxIndex, total - 1) : 0;
    setCurrent(safe);
  }, [lightboxIndex, total]);

  const currentImage = images[current] ?? null;
  const openIndex = clampIndex(lightboxIndex, total);
  const errorCode = error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;

  return (
    <article className="bwp-detail">
      <nav className="bwp-detail__breadcrumb" aria-label={t.breadcrumbCurrent}>
        <a className="bwp-detail__crumb-link" href={homeHref} onClick={(event) => { event.preventDefault(); onBack(); }}>
          <Icon name="chevron-left" size={14} />
          <span>{t.breadcrumbHome}</span>
        </a>
        <span className="bwp-detail__crumb-sep" aria-hidden="true">
          <Icon name="chevron-right" size={14} />
        </span>
        <span className="bwp-detail__crumb-current" aria-current="page">
          {name}
        </span>
      </nav>

      <header className="bwp-detail__header">
        <h1 className="bwp-detail__title">{name}</h1>
        <div className="bwp-detail__badges">
          {isNew ? <span className="bwp-badge bwp-badge--new">{t.badgeNew}</span> : null}
          {themeType === 'ThemePack' ? (
            <span className="bwp-badge bwp-badge--pack">
              <Icon name="layers" size={13} />
              <span>{t.badgePack}</span>
            </span>
          ) : null}
          {data?.stale ? (
            <span
              className="bwp-badge bwp-badge--stale"
              title={`${t.staleHint} · ${formatDate(data.fetchedAt)}`}
            >
              {t.staleBadge}
            </span>
          ) : null}
          <span className="bwp-detail__count">
            <Icon name="image" size={14} />
            <span>{loading && total === 0 ? t.loading : t.imageCount(total)}</span>
          </span>
        </div>
        <p className="bwp-detail__subtitle">{t.appTagline}</p>
      </header>

      {loading && total === 0 ? (
        <div className="bwp-detail__loading" aria-busy="true" aria-live="polite">
          <ImageSkeleton aspectRatio="16 / 9" />
          <div className="bwp-detail__loading-strip">
            <Skeleton width="140px" height="79px" />
            <Skeleton width="140px" height="79px" />
            <Skeleton width="140px" height="79px" />
            <Skeleton width="140px" height="79px" />
          </div>
          <span className="bwp-visually-hidden">{t.loadingImages}</span>
        </div>
      ) : null}

      {error !== null && total === 0 ? (
        <ErrorState message={t.errorImages} code={errorCode} onRetry={reload} />
      ) : null}

      {!loading && error === null && total === 0 ? (
        <EmptyState
          title={t.emptyImagesTitle}
          message={t.emptyImagesMessage}
          actionLabel={t.emptyImagesAction}
          onAction={onBack}
        />
      ) : null}

      {total > 0 && currentImage ? (
        <div className="bwp-detail__viewer">
          <Carousel
            images={images}
            index={current}
            onIndexChange={setCurrent}
            onOpen={onOpenLightbox}
            allowAutoplay
          />
          <ThumbnailStrip images={images} index={current} onSelect={setCurrent} />
        </div>
      ) : null}

      {total > 0 && currentImage ? (
        <section className="bwp-detail__info" aria-labelledby="bwp-detail-info-title">
          <div className="bwp-detail__info-main">
            <h2 className="bwp-detail__info-title" id="bwp-detail-info-title">
              {t.themeInfoTitle}
            </h2>
            <h3 className="bwp-detail__info-name">{currentImage.title}</h3>
            {currentImage.description ? (
              <p className="bwp-detail__info-description">{currentImage.description}</p>
            ) : null}

            <dl className="bwp-detail__facts">
              <div className="bwp-detail__fact">
                <dt>{t.credits}</dt>
                <dd>
                  <span>{currentImage.copyright}</span>
                  {currentImage.copyrightUrl ? (
                    <a
                      className="bwp-detail__external"
                      href={currentImage.copyrightUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t.externalHint}
                    >
                      <span>{t.discoverMore}</span>
                      <Icon name="external-link" size={13} />
                    </a>
                  ) : null}
                </dd>
              </div>

              <div className="bwp-detail__fact">
                <dt>{t.photoSource}</dt>
                <dd>
                  <span>{currentImage.sourceType}</span>
                  {currentImage.searchUrl ? (
                    <a
                      className="bwp-detail__external"
                      href={currentImage.searchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t.externalHint}
                    >
                      <span>{t.discoverMore}</span>
                      <Icon name="external-link" size={13} />
                    </a>
                  ) : null}
                </dd>
              </div>

              {currentImage.startDate ? (
                <div className="bwp-detail__fact">
                  <dt>{t.photoDate}</dt>
                  <dd>{currentImage.startDate}</dd>
                </div>
              ) : null}

              {currentImage.themes.length > 0 ? (
                <div className="bwp-detail__fact">
                  <dt>{t.photoTags}</dt>
                  <dd>
                    <span className="bwp-detail__tags">
                      {currentImage.themes.map((tag) => (
                        <span className="bwp-badge" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <aside className="bwp-detail__panel">
            <ResolutionPicker resolutions={resolutions} value={resolutionKey} onChange={onResolutionChange} />
            <DownloadButton
              image={currentImage}
              resolutionKey={resolutionKey}
              onNotify={onNotify}
              variant="primary"
              label={t.downloadNow}
            />
            {currentImage.animated ? (
              <div className="bwp-detail__animated">
                <span className="bwp-badge bwp-badge--animated">
                  <Icon name="sparkles" size={13} />
                  <span>{t.badgeAnimated}</span>
                </span>
                <a
                  className="bwp-button bwp-button--sm"
                  href={currentImage.animated.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="video" size={15} />
                  <span>{t.watchVideo}</span>
                </a>
              </div>
            ) : null}
          </aside>
        </section>
      ) : null}

      {openIndex !== null ? (
        <Lightbox
          images={images}
          index={openIndex}
          themeKey={themeKey}
          market={market}
          resolutions={resolutions}
          resolutionKey={resolutionKey}
          onResolutionChange={onResolutionChange}
          onIndexChange={onOpenLightbox}
          onClose={onCloseLightbox}
          onNotify={onNotify}
        />
      ) : null}
    </article>
  );
}

