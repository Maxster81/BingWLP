import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { api } from '../api/client';
import type { MarketCode, Resolution, ThemeKey, WallpaperImage } from '../api/types';
import { t } from '../lib/i18n';
import { DownloadButton } from './DownloadButton';
import { Icon } from './Icon';
import { ResolutionPicker } from './ResolutionPicker';
import './Lightbox.css';

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus trap minimale: il tab non esce mai dal dialogo. */
function trapFocus(container: HTMLElement | null, event: ReactKeyboardEvent<HTMLElement>): void {
  if (!container) return;
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute('disabled'),
  );
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || active === container) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

export type LightboxProps = {
  images: WallpaperImage[];
  index: number;
  themeKey: ThemeKey;
  market: MarketCode | null;
  resolutions: Resolution[];
  resolutionKey: string;
  onResolutionChange: (key: string) => void;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
};

/**
 * Anteprima a schermo intero: sfondo sfocato, immagine `contain`, prev/next,
 * contatore, crediti, focus trap, tasti ←/→/Esc, click sul backdrop e zoom 1×/2× con pan.
 */
export function Lightbox({
  images,
  index,
  themeKey,
  market,
  resolutions,
  resolutionKey,
  onResolutionChange,
  onIndexChange,
  onClose,
  onNotify,
}: LightboxProps) {
  const total = images.length;
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);

  // Reset dello zoom quando cambia immagine.
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [index]);

  // Focus iniziale + blocco dello scroll di pagina + ripristino del focus.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (zoom === 1) setOffset({ x: 0, y: 0 });
  }, [zoom]);

  const current = images[index] ?? images[0];

  const goNext = (): void => onIndexChange(total === 0 ? 0 : (index + 1) % total);
  const goPrev = (): void => onIndexChange(total === 0 ? 0 : (index - 1 + total) % total);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
      case 'ArrowRight':
        event.preventDefault();
        goNext();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        goPrev();
        break;
      case 'Tab':
        trapFocus(dialogRef.current, event);
        break;
      default:
        break;
    }
  };

  /** Chiude solo se il click cade sullo sfondo (o sull'area vuota attorno all'immagine),
   *  mai sui controlli. */
  const handleBackdropMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (
      target === event.currentTarget ||
      target.classList.contains('bwp-lightbox__backdrop') ||
      target.classList.contains('bwp-lightbox__stage')
    ) {
      onClose();
    }
  };

  const handlePanStart = (event: ReactPointerEvent<HTMLImageElement>): void => {
    if (zoom === 1) return;
    panRef.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePanMove = (event: ReactPointerEvent<HTMLImageElement>): void => {
    const start = panRef.current;
    if (!start) return;
    setOffset({ x: event.clientX - start.x, y: event.clientY - start.y });
  };

  const handlePanEnd = (): void => {
    panRef.current = null;
  };

  if (!current) return null;

  // A 2× chiediamo al backend una variante più grande (crop lato Bing).
  const zoomSrc = api.imageUrl({
    theme: themeKey,
    index: current.index,
    market,
    width: 2560,
    height: 1440,
    version: current.id,
  });
  const imageSrc = zoom > 1 ? zoomSrc : current.urls.full;

  return (
    <div className="bwp-lightbox" onMouseDown={handleBackdropMouseDown}>
      <div className="bwp-lightbox__backdrop" aria-hidden="true" />
      <div
        className="bwp-lightbox__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.lightboxLabel}
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="bwp-lightbox__topbar">
          <div className="bwp-lightbox__topbar-info">
            <h2 className="bwp-lightbox__title">{current.title}</h2>
            <p className="bwp-lightbox__credits">
              <span>{current.copyright}</span>
              {current.copyrightUrl ? (
                <a
                  className="bwp-lightbox__credits-link"
                  href={current.copyrightUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.copyrightLinkLabel(current.copyright)}
                  title={t.externalHint}
                >
                  <Icon name="external-link" size={13} />
                </a>
              ) : null}
            </p>
          </div>

          <div className="bwp-lightbox__topbar-actions">
            <span className="bwp-lightbox__counter">{t.imageCounter(index + 1, total)}</span>
            <button
              type="button"
              className="bwp-icon-button"
              aria-pressed={zoom > 1}
              aria-label={zoom > 1 ? t.zoomOut : t.zoomIn}
              onClick={() => setZoom((prev) => (prev > 1 ? 1 : 2))}
            >
              <Icon name={zoom > 1 ? 'zoom-out' : 'zoom-in'} size={19} />
            </button>
            <button
              type="button"
              className="bwp-icon-button"
              ref={closeRef}
              onClick={onClose}
              aria-label={t.closeLightbox}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        <div className="bwp-lightbox__stage">
          <img
            className="bwp-lightbox__image"
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
              cursor: zoom > 1 ? 'grab' : 'zoom-in',
            }}
            src={imageSrc}
            srcSet={`${current.urls.full} 1920w, ${current.urls.original} 2560w`}
            sizes="100vw"
            alt={current.title}
            draggable={false}
            onPointerDown={handlePanStart}
            onPointerMove={handlePanMove}
            onPointerUp={handlePanEnd}
            onPointerCancel={handlePanEnd}
          />

          {total > 1 ? (
            <>
              <button
                type="button"
                className="bwp-icon-button bwp-lightbox__nav bwp-lightbox__nav--prev"
                onClick={goPrev}
                aria-label={t.previousImage}
              >
                <Icon name="chevron-left" size={24} />
              </button>
              <button
                type="button"
                className="bwp-icon-button bwp-lightbox__nav bwp-lightbox__nav--next"
                onClick={goNext}
                aria-label={t.nextImage}
              >
                <Icon name="chevron-right" size={24} />
              </button>
            </>
          ) : null}
        </div>

        <div className="bwp-lightbox__bottombar">
          <p className="bwp-visually-hidden" aria-live="polite" aria-atomic="true">
            {t.imagePosition(index + 1, total)}
          </p>
          <div className="bwp-lightbox__meta">
            {current.description ? <p className="bwp-lightbox__description">{current.description}</p> : null}
            {current.animated ? (
              <a
                className="bwp-button bwp-button--sm"
                href={current.animated.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="video" size={15} />
                <span>{t.watchVideo}</span>
              </a>
            ) : null}
          </div>
          <div className="bwp-lightbox__controls">
            <ResolutionPicker resolutions={resolutions} value={resolutionKey} onChange={onResolutionChange} />
            <DownloadButton image={current} resolutionKey={resolutionKey} onNotify={onNotify} variant="primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

