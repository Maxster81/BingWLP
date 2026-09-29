import { useEffect, useRef } from 'react';
import type { WallpaperImage } from '../api/types';
import { t } from '../lib/i18n';
import './ThumbnailStrip.css';

export type ThumbnailStripProps = {
  images: WallpaperImage[];
  index: number;
  onSelect: (index: number) => void;
};

/** Miniature con scroll-snap: la selezione resta sempre visibile. */
export function ThumbnailStrip({ images, index, onSelect }: ThumbnailStripProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const node = list.querySelector<HTMLElement>(`[data-thumb-index="${index}"]`);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [index]);

  if (images.length === 0) return null;

  return (
    <div className="bwp-thumbs" role="group" aria-label={t.thumbnailsLabel}>
      <div className="bwp-thumbs__list" ref={listRef}>
        {images.map((image, position) => (
          <button
            key={`${image.id}-${position}`}
            type="button"
            data-thumb-index={position}
            className={position === index ? 'bwp-thumbs__item is-active' : 'bwp-thumbs__item'}
            aria-label={t.goToImage(position + 1)}
            aria-current={position === index ? 'true' : undefined}
            onClick={() => onSelect(position)}
          >
            <img
              className="bwp-thumbs__image"
              src={image.urls.thumb}
              alt=""
              width={480}
              height={270}
              loading="lazy"
              decoding="async"
            />
            <span className="bwp-thumbs__index">{position + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
