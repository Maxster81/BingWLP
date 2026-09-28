import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeCard } from './ThemeCard';
import { t } from '../lib/i18n';
import { makeTheme } from '../test/fixtures';

describe('ThemeCard', () => {
  it('mostra nome localizzato, badge e conteggio immagini', () => {
    render(
      <ThemeCard
        theme={makeTheme({ name: 'Viaggi', isNew: true, type: 'ThemePack', imageCount: 8 })}
        href="#/tema/travel?mkt=it-IT"
        onOpen={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Viaggi' })).toBeInTheDocument();
    expect(screen.getByText(t.badgeNew)).toBeInTheDocument();
    expect(screen.getByText(t.badgePack)).toBeInTheDocument();
    expect(screen.getByText(t.imageCount(8))).toBeInTheDocument();
  });

  it('il click naviga al tema', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ThemeCard theme={makeTheme({ name: 'Viaggi' })} href="#/tema/travel" onOpen={onOpen} />);

    await user.click(screen.getByRole('link', { name: t.openTheme('Viaggi') }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('travel');
  });

  it('con imageCount null mostra il conteggio non disponibile', () => {
    render(<ThemeCard theme={makeTheme({ imageCount: null })} href="#/tema/travel" onOpen={() => {}} />);
    expect(screen.getByText(t.imageCountUnknown)).toBeInTheDocument();
  });

  it('senza coverUrl usa il placeholder grafico deterministico', () => {
    const { container } = render(<ThemeCard theme={makeTheme({ coverUrl: null })} href="#/tema/travel" onOpen={() => {}} />);
    const placeholder = container.querySelector<HTMLElement>('.bwp-theme-card__placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.style.backgroundImage).toContain('linear-gradient');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('non mostra badge quando il tema non è nuovo né pacchetto', () => {
    render(<ThemeCard theme={makeTheme({ isNew: false, type: 'Regular' })} href="#/tema/travel" onOpen={() => {}} />);
    expect(screen.queryByText(t.badgeNew)).toBeNull();
    expect(screen.queryByText(t.badgePack)).toBeNull();
  });
});
