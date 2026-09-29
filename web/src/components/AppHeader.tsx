import type { ChangeEvent } from 'react';
import type { Market, MarketCode } from '../api/types';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import './AppHeader.css';

export type AppHeaderProps = {
  markets: Market[];
  market: MarketCode | null;
  onMarketChange: (code: MarketCode) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onlyNew: boolean;
  onOnlyNewChange: (value: boolean) => void;
  onHome: () => void;
  homeHref: string;
  /** Mostrato come sottotitolo/contesto (es. nome del tema aperto). */
  context?: string;
};

/** Header sticky in glassmorphism: brand, mercato, ricerca e filtro "solo novità". */
export function AppHeader({
  markets,
  market,
  onMarketChange,
  query,
  onQueryChange,
  onlyNew,
  onOnlyNewChange,
  onHome,
  homeHref,
  context,
}: AppHeaderProps) {
  const handleMarket = (event: ChangeEvent<HTMLSelectElement>): void => {
    onMarketChange(event.currentTarget.value);
  };

  return (
    <header className="bwp-header">
      <div className="bwp-header__inner">
        <a className="bwp-header__brand" href={homeHref} onClick={onHome} aria-label={t.headerHome}>
          <span className="bwp-header__logo" aria-hidden="true">
            <Icon name="sparkles" size={20} />
          </span>
          <span className="bwp-header__titles">
            <span className="bwp-header__title">
              {t.appName}
              <span className="bwp-header__title-accent"> {t.appNameAccent}</span>
            </span>
            <span className="bwp-header__context">{context ?? t.appTagline}</span>
          </span>
        </a>

        <div className="bwp-header__tools">
          <div className="bwp-search">
            <label className="bwp-search__label" htmlFor="bwp-search-input">
              {t.searchLabel}
            </label>
            <span className="bwp-search__icon" aria-hidden="true">
              <Icon name="search" size={17} />
            </span>
            <input
              id="bwp-search-input"
              className="bwp-search__input"
              type="search"
              value={query}
              placeholder={t.searchPlaceholder}
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              autoComplete="off"
            />
            {query.length > 0 ? (
              <button
                type="button"
                className="bwp-search__clear"
                onClick={() => onQueryChange('')}
                aria-label={t.searchClear}
              >
                <Icon name="close" size={15} />
              </button>
            ) : null}
          </div>

          <div className="bwp-market">
            <label className="bwp-market__label" htmlFor="bwp-market-select">
              {t.marketLabel}
            </label>
            <select
              id="bwp-market-select"
              className="bwp-market__select"
              value={market ?? ''}
              onChange={handleMarket}
              title={t.marketHint}
            >
              {market === null || markets.some((item) => item.code === market) ? null : (
                <option value={market}>{market}</option>
              )}
              {markets.map((item) => (
                <option key={item.code} value={item.code}>
                  {`${item.flag} ${item.name}`}
                </option>
              ))}
            </select>
            <span className="bwp-market__chevron" aria-hidden="true">
              <Icon name="chevron-down" size={16} />
            </span>
          </div>

          <label className="bwp-switch" title={t.onlyNewHint}>
            <input
              type="checkbox"
              className="bwp-switch__input"
              role="switch"
              checked={onlyNew}
              onChange={(event) => onOnlyNewChange(event.currentTarget.checked)}
              aria-label={t.onlyNewLabel}
            />
            <span className="bwp-switch__track" aria-hidden="true">
              <span className="bwp-switch__thumb" />
            </span>
            <span className="bwp-switch__text">{t.onlyNewLabel}</span>
          </label>
        </div>
      </div>
    </header>
  );
}
