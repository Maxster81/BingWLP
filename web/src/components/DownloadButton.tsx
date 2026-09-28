import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Resolution, WallpaperImage } from '../api/types';
import { absoluteUrl } from '../lib/urls';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import { groupResolutions } from './ResolutionPicker';
import './DownloadButton.css';

/** Copia negli appunti con fallback per browser senza Clipboard API. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* proviamo il fallback */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export type DownloadButtonProps = {
  image: WallpaperImage;
  resolutions: Resolution[];
  resolutionKey: string;
  onResolutionChange: (key: string) => void;
  onNotify: (message: string) => void;
  variant?: 'primary' | 'default';
  size?: 'md' | 'sm';
  label?: string;
};

/**
 * Download multi-risoluzione: pulsante principale (risoluzione corrente) + menù
 * raggruppato, copia link e video per i temi animati.
 * Il download usa `window.location.assign` (mai `fetch`): nessun file in memoria.
 */
export function DownloadButton({
  image,
  resolutions,
  resolutionKey,
  onResolutionChange,
  onNotify,
  variant = 'default',
  size = 'md',
  label,
}: DownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buckets = groupResolutions(resolutions);
  const selected = resolutions.find((item) => item.key === resolutionKey) ?? null;
  const downloadHref = api.downloadUrl(image.downloadBase, resolutionKey);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const startDownload = (key: string, keyLabel: string): void => {
    const url = api.downloadUrl(image.downloadBase, key);
    onNotify(t.downloadStarted(keyLabel));
    try {
      window.location.assign(url);
    } catch {
      /* ambiente senza navigazione (test/jsdom): la notifica è già stata mostrata */
    }
  };

  const handlePrimary = (): void => {
    startDownload(resolutionKey, selected ? selected.label : resolutionKey);
  };

  const handleCopy = async (): Promise<void> => {
    const ok = await copyText(absoluteUrl(downloadHref));
    onNotify(ok ? t.linkCopied : t.copyFailed);
    if (ok) setOpen(false);
  };

  return (
    <div
      className={`bwp-download bwp-download--${variant} bwp-download--${size}`}
      ref={containerRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <a
        className={
          variant === 'primary' ? 'bwp-button bwp-button--primary bwp-download__main' : 'bwp-button bwp-download__main'
        }
        href={downloadHref}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          handlePrimary();
        }}
      >
        <Icon name="download" size={17} />
        <span>{label ?? t.download}</span>
      </a>

      <button
        type="button"
        className="bwp-download__toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.downloadMenuLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon name="chevron-down" size={16} />
      </button>

      {open ? (
        <div className="bwp-download__menu" role="menu" aria-label={t.downloadMenuLabel}>
          {buckets.map((bucket) => (
            <div className="bwp-download__group" key={bucket.group} role="group" aria-label={bucket.label}>
              <p className="bwp-download__group-title">{bucket.label}</p>
              {bucket.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.key === resolutionKey}
                  className="bwp-download__item"
                  onClick={() => {
                    onResolutionChange(item.key);
                    setOpen(false);
                    startDownload(item.key, item.label);
                  }}
                >
                  <span className="bwp-download__item-label">{item.label}</span>
                  {item.recommended ? (
                    <span className="bwp-badge bwp-badge--pack">{t.resolutionRecommended}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}

          <div className="bwp-download__footer">
            <button type="button" role="menuitem" className="bwp-download__item" onClick={() => void handleCopy()}>
              <Icon name="copy" size={15} />
              <span className="bwp-download__item-label">{t.copyLink}</span>
            </button>
            {image.animated ? (
              <a
                role="menuitem"
                className="bwp-download__item"
                href={image.animated.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="video" size={15} />
                <span className="bwp-download__item-label">{t.downloadVideo}</span>
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

