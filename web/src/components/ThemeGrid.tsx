import type { Theme, ThemeKey } from '../api/types';
import { ThemeCard } from './ThemeCard';
import './ThemeGrid.css';

export type ThemeGridProps = {
  themes: Theme[];
  hrefFor: (themeKey: ThemeKey) => string;
  onOpen: (themeKey: ThemeKey) => void;
};

/** Griglia responsive 1 / 2 / 3 / 4 colonne. */
export function ThemeGrid({ themes, hrefFor, onOpen }: ThemeGridProps) {
  return (
    <ul className="bwp-theme-grid" role="list">
      {themes.map((theme, position) => (
        <li key={theme.key} className="bwp-theme-grid__item">
          <ThemeCard theme={theme} href={hrefFor(theme.key)} onOpen={onOpen} position={position} />
        </li>
      ))}
    </ul>
  );
}
