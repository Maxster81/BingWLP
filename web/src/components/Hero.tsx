import type { MouseEvent } from 'react';
import type { Theme, ThemeKey } from '../api/types';
import { initials, placeholderGradient } from '../lib/format';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import './Hero.css';

export type HeroProps = {
  theme: Theme;
  href: string;
  onOpen: (themeKey: ThemeKey) => void;
};

function metaLabel(theme: Theme): string {
  const count = theme.imageCount === null ? t.imageCountUnknown : t.imageCount(theme.imageCount);
  return `${count} · ${theme.type === 'ThemePack' ? t.badgePack : t.themeTypeRegular}`;
}

/** Banner di copertina del tema evidenziato, con titolo, badge e CTA. */
export function Hero({ theme, href, onOpen }: HeroProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onOpen(theme.key);
  };

  return (
    <section className="bwp-hero" aria-labelledby="bwp-hero-title">
      <div className="bwp-hero__media">
        {theme.coverUrl ? (
          <img
            className="bwp-hero__image"
            src={theme.coverUrl}
            alt=""
            width={1280}
            height={720}
            decoding="async"
            sizes="100vw"
          />
        ) : (
          <div
            className="bwp-hero__placeholder"
            style={{ backgroundImage: placeholderGradient(theme.key) }}
            aria-hidden="true"
          >
            <span className="bwp-hero__placeholder-mark">{initials(theme.name)}</span>
          </div>
        )}
        <div className="bwp-hero__scrim" aria-hidden="true" />
      </div>

      <div className="bwp-hero__content">
        <span className="bwp-badge bwp-hero__eyebrow">
          <Icon name="sparkles" size={14} />
          <span>{t.featuredBadge}</span>
        </span>

        <h2 className="bwp-hero__title" id="bwp-hero-title">
          {theme.name}
        </h2>

        <p className="bwp-hero__meta">{metaLabel(theme)}</p>

        <div className="bwp-hero__actions">
          <a className="bwp-button bwp-button--primary" href={href} onClick={handleClick}>
            <Icon name="expand" size={18} />
            <span>{t.featuredCta}</span>
          </a>
          {theme.isNew ? <span className="bwp-badge bwp-badge--new">{t.badgeNew}</span> : null}
        </div>
      </div>
    </section>
  );
}
