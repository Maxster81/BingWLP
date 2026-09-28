import type { MouseEvent } from 'react';
import type { Theme, ThemeKey } from '../api/types';
import { initials, placeholderGradient } from '../lib/format';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import './ThemeCard.css';

export type ThemeCardProps = {
  theme: Theme;
  /** `href` della route hash (fallback senza JavaScript + link condivisibili). */
  href: string;
  onOpen: (themeKey: ThemeKey) => void;
  /** Indice in griglia: sfalsa le animazioni d'ingresso. */
  position?: number;
};

function countLabel(theme: Theme): string {
  return theme.imageCount === null ? t.imageCountUnknown : t.imageCount(theme.imageCount);
}

export function ThemeCard({ theme, href, onOpen, position = 0 }: ThemeCardProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    // Lasciamo comunque funzionare il link (tasto centrale, "apri in nuova scheda").
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onOpen(theme.key);
  };

  return (
    <a
      className="bwp-theme-card"
      href={href}
      onClick={handleClick}
      aria-label={t.openTheme(theme.name)}
      style={{ animationDelay: `${Math.min(position, 12) * 45}ms` }}
      data-theme-key={theme.key}
    >
      <div className="bwp-theme-card__media">
        {theme.coverUrl ? (
          <img
            className="bwp-theme-card__image"
            src={theme.coverUrl}
            alt=""
            width={800}
            height={450}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="bwp-theme-card__placeholder"
            style={{ backgroundImage: placeholderGradient(theme.key) }}
            aria-hidden="true"
          >
            <span className="bwp-theme-card__placeholder-mark">{initials(theme.name)}</span>
          </div>
        )}

        <div className="bwp-theme-card__badges">
          {theme.isNew ? <span className="bwp-badge bwp-badge--new">{t.badgeNew}</span> : null}
          {theme.type === 'ThemePack' ? (
            <span className="bwp-badge bwp-badge--pack">
              <Icon name="layers" size={13} />
              <span>{t.badgePack}</span>
            </span>
          ) : null}
        </div>

        <div className="bwp-theme-card__overlay" aria-hidden="true">
          <span className="bwp-theme-card__overlay-icon">
            <Icon name="expand" size={20} />
          </span>
          <span className="bwp-theme-card__overlay-text">{t.cardOverlay}</span>
        </div>
      </div>

      <div className="bwp-theme-card__body">
        <h3 className="bwp-theme-card__name">{theme.name}</h3>
        <p className="bwp-theme-card__meta">
          <Icon name="image" size={14} />
          <span>{countLabel(theme)}</span>
        </p>
      </div>
    </a>
  );
}
