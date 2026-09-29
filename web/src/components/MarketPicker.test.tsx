import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketPicker } from './MarketPicker';
import { makeMarkets } from '../test/fixtures';

function setup(value: string | null = 'it-IT', onChange = vi.fn()) {
  const utils = render(<MarketPicker markets={makeMarkets()} value={value} onChange={onChange} />);
  return { onChange, ...utils };
}

describe('MarketPicker', () => {
  it('mostra il mercato selezionato nel trigger, panel chiuso di default', () => {
    setup();
    expect(screen.getByRole('button', { name: /Italiano \(Italia\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('apre il panel con tutti i mercati e ne seleziona uno', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole('button', { name: /Italiano/ }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);

    await user.click(screen.getByRole('option', { name: /English/ }));
    expect(onChange).toHaveBeenCalledWith('en-US');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('aria-expanded e aria-selected riflettono lo stato', async () => {
    const user = userEvent.setup();
    setup();

    const trigger = screen.getByRole('button', { name: /Italiano/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: /Italiano/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /English/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('si chiude con Escape e riporta il focus sul trigger', async () => {
    const user = userEvent.setup();
    setup();

    const trigger = screen.getByRole('button', { name: /Italiano/ });
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('si chiude su click fuori dal componente', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MarketPicker markets={makeMarkets()} value="it-IT" onChange={() => {}} />
        <button type="button">fuori</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /Italiano/ }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'fuori' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('le freccette muovono il focus tra le opzioni', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /Italiano/ }));
    const italiano = screen.getByRole('option', { name: /Italiano/ });
    const english = screen.getByRole('option', { name: /English/ });

    // all'apertura il focus e' sull'opzione selezionata
    expect(italiano).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(english).toHaveFocus();

    // wrap-around: da ultimo torna a primo
    await user.keyboard('{ArrowDown}');
    expect(italiano).toHaveFocus();
  });
});
