import type { Market, MarketCode } from '../api/types';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import { MarketPicker } from './MarketPicker';
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
  /** Forza il ricaricamento dei contenuti (bypass cache server + locale). */
  onRefresh: () => void;
  /** True mentre un refresh e' in corso (disabilita il bottone). */
  refreshing: boolean;
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
  onRefresh,
  refreshing,
  context,
}: AppHeaderProps) {
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

          <MarketPicker markets={markets} value={market} onChange={onMarketChange} />

          <button
            type="button"
            className="bwp-refresh"
            onClick={onRefresh}
            disabled={refreshing}
            title={t.refreshHint}
            aria-label={t.refreshLabel}
          >
            <span className={refreshing ? 'bwp-refresh__icon is-spinning' : 'bwp-refresh__icon'} aria-hidden="true">
              <Icon name="retry" size={16} />
            </span>
            <span className="bwp-refresh__text">{t.refreshLabel}</span>
          </button>

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
