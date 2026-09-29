import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WallpaperImage } from '../api/types';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import './Carousel.css';

export type CarouselProps = {
  images: WallpaperImage[];
  /** Indice corrente (controllato dal chiamante: la route ha l'ultima parola). */
  index: number;
  onIndexChange: (index: number) => void;
  /** Apre il lightbox sull'indice corrente. */
  onOpen: (index: number) => void;
  /** Mostra il controllo di presentazione automatica. */
  allowAutoplay?: boolean;
  className?: string;
};

const AUTOPLAY_MS = 5200;
const SWIPE_THRESHOLD = 45;

/** Immagine grande + frecce, dots, tastiera, swipe touch e presentazione opzionale. */
export function Carousel({ images, index, onIndexChange, onOpen, allowAutoplay = true, className }: CarouselProps) {
  const total = images.length;
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [playing, setPlaying] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const indexRef = useRef(index);
  indexRef.current = index;
  const changeRef = useRef(onIndexChange);
  changeRef.current = onIndexChange;
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  // Ogni cambio immagine riporta lo spinner finché il nuovo file non è pronto.
  useEffect(() => {
    setImageLoaded(false);
  }, [index]);

  useEffect(() => {
    if (!playing || total <= 1) return undefined;
    const timer = window.setInterval(() => {
      changeRef.current((indexRef.current + 1) % total);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [playing, total]);

  // Precarica le immagini adiacenti per transizioni senza scatti.
  useEffect(() => {
    if (total <= 1) return;
    for (const neighbour of [(index + 1) % total, (index - 1 + total) % total]) {
      const image = images[neighbour];
      if (!image) continue;
      const preload = new Image();
      preload.src = image.urls.preview;
    }
  }, [images, index, total]);

  const current = images[index] ?? images[0];

  const goTo = (next: number): void => {
    if (total === 0) return;
    const normalized = ((next % total) + total) % total;
    if (normalized !== index) setDirection(normalized === (index + 1) % total ? 'next' : 'prev');
    onIndexChange(normalized);
  };

  const goNext = (): void => {
    setDirection('next');
    onIndexChange(total === 0 ? 0 : (index + 1) % total);
  };

  const goPrev = (): void => {
    setDirection('prev');
    onIndexChange(total === 0 ? 0 : (index - 1 + total) % total);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        goNext();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        goPrev();
        break;
      case 'Home':
        event.preventDefault();
        goTo(0);
        break;
      case 'End':
        event.preventDefault();
        goTo(total - 1);
        break;
      case 'Enter':
        if (event.target === event.currentTarget) {
          event.preventDefault();
          onOpen(index);
        }
        break;
      default:
        break;
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipeRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  if (!current || total === 0) return null;


  return (
    <section
      className={className ? `bwp-carousel ${className}` : 'bwp-carousel'}
      role="region"
      aria-roledescription={t.carouselRole}
      aria-label={t.carouselLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bwp-carousel__stage"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeRef.current = null;
        }}
      >
        <img
          key={`${current.id}-${index}`}
          className={`bwp-carousel__image bwp-carousel__image--${direction}`}
          src={current.urls.preview}
          srcSet={`${current.urls.preview} 1280w, ${current.urls.full} 1920w`}
          sizes="(max-width: 900px) 100vw, 1100px"
          alt={current.title}
          width={1280}
          height={720}
          decoding="async"
          draggable={false}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(true)}
        />
        {!imageLoaded ? (
          <div className="bwp-carousel__loader">
            <Spinner label={t.loadingImage} />
          </div>
        ) : null}
        <div className="bwp-carousel__scrim" aria-hidden="true" />

        <div className="bwp-carousel__caption">
          <p className="bwp-carousel__caption-title">{current.title}</p>
          <p className="bwp-carousel__caption-credits">{current.copyright}</p>
        </div>

        {total > 1 ? (
          <>
            <button
              type="button"
              className="bwp-icon-button bwp-carousel__nav bwp-carousel__nav--prev"
              onClick={goPrev}
              aria-label={t.previousImage}
            >
              <Icon name="chevron-left" size={22} />
            </button>
            <button
              type="button"
              className="bwp-icon-button bwp-carousel__nav bwp-carousel__nav--next"
              onClick={goNext}
              aria-label={t.nextImage}
            >
              <Icon name="chevron-right" size={22} />
            </button>
          </>
        ) : null}
      </div>

      <div className="bwp-carousel__toolbar">
        <p className="bwp-carousel__counter" aria-live="polite" aria-atomic="true">
          {t.imagePosition(index + 1, total)}
          {current.animated ? <span className="bwp-badge bwp-badge--animated">{t.badgeAnimated}</span> : null}
        </p>
        <div className="bwp-carousel__actions">
          {allowAutoplay && total > 1 ? (
            <button
              type="button"
              className="bwp-button bwp-button--ghost bwp-button--sm"
              aria-pressed={playing}
              onClick={() => setPlaying((prev) => !prev)}
            >
              <Icon name={playing ? 'pause' : 'play'} size={15} />
              <span>{playing ? t.autoplayStop : t.autoplayStart}</span>
            </button>
          ) : null}
          <button type="button" className="bwp-button bwp-button--sm" onClick={() => onOpen(index)}>
            <Icon name="expand" size={16} />
            <span>{t.openLightbox}</span>
          </button>
        </div>
      </div>

      {total > 1 ? (
        <div className="bwp-carousel__dots">
          {images.map((image, position) => (
            <button
              key={`${image.id}-${position}`}
              type="button"
              className={position === index ? 'bwp-carousel__dot is-active' : 'bwp-carousel__dot'}
              aria-label={t.goToImage(position + 1)}
              aria-current={position === index ? 'true' : undefined}
              onClick={() => goTo(position)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
