import './Skeleton.css';

export type SkeletonProps = {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
};

/** Blocco shimmer generico (mai salti di layout: usare insieme ad `aspect-ratio`). */
export function Skeleton({ width = '100%', height = '1rem', radius, className }: SkeletonProps) {
  return (
    <span
      className={className ? `bwp-skeleton bwp-shimmer ${className}` : 'bwp-skeleton bwp-shimmer'}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export type ImageSkeletonProps = {
  /** Es. `"16 / 9"` per le card, `"4 / 3"` per il carosello. */
  aspectRatio?: string;
  radius?: string;
  className?: string;
};

/** Placeholder 16:9 (o altro ratio) che riserva lo spazio dell'immagine in caricamento. */
export function ImageSkeleton({ aspectRatio = '16 / 9', radius, className }: ImageSkeletonProps) {
  return (
    <span
      className={className ? `bwp-skeleton bwp-skeleton--image bwp-shimmer ${className}` : 'bwp-skeleton bwp-skeleton--image bwp-shimmer'}
      style={{ aspectRatio, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export type TextSkeletonProps = {
  lines?: number;
  width?: string;
  className?: string;
};

/** Paragrafo di righe shimmer. */
export function TextSkeleton({ lines = 2, width = '100%', className }: TextSkeletonProps) {
  return (
    <span className={className ? `bwp-text-skeleton ${className}` : 'bwp-text-skeleton'} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="bwp-skeleton bwp-shimmer"
          style={{ width: index === lines - 1 ? `${Math.max(45, 100 - lines * 9)}%` : width, height: '0.85rem' }}
        />
      ))}
    </span>
  );
}
