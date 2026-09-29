import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Carousel } from './Carousel';
import { t } from '../lib/i18n';
import { makeImage } from '../test/fixtures';

const images = [makeImage(0), makeImage(1), makeImage(2)];

function setup(index: number) {
  const onIndexChange = vi.fn();
  const onOpen = vi.fn();
  const view = render(<Carousel images={images} index={index} onIndexChange={onIndexChange} onOpen={onOpen} />);
  return { onIndexChange, onOpen, view };
}

describe('Carousel', () => {
  it('mostra l’immagine corrente e il contatore accessibile', () => {
    setup(0);
    expect(screen.getByRole('img', { name: 'Panorama 1' })).toBeInTheDocument();
    expect(screen.getByText(t.imagePosition(1, 3))).toBeInTheDocument();
  });

  it('avanti e indietro aggiornano l’indice', async () => {
    const user = userEvent.setup();
    const { onIndexChange } = setup(1);

    await user.click(screen.getByRole('button', { name: t.nextImage }));
    expect(onIndexChange).toHaveBeenLastCalledWith(2);

    await user.click(screen.getByRole('button', { name: t.previousImage }));
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it('fa wrap-around in entrambe le direzioni', async () => {
    const user = userEvent.setup();
    const { onIndexChange, view } = setup(2);

    await user.click(screen.getByRole('button', { name: t.nextImage }));
    expect(onIndexChange).toHaveBeenLastCalledWith(0);

    view.rerender(<Carousel images={images} index={0} onIndexChange={onIndexChange} onOpen={() => {}} />);
    await user.click(screen.getByRole('button', { name: t.previousImage }));
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
  });

  it('i dots portano a un indice preciso', async () => {
    const user = userEvent.setup();
    const { onIndexChange } = setup(0);

    await user.click(screen.getByRole('button', { name: t.goToImage(3) }));
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it('supporta la navigazione da tastiera', async () => {
    const user = userEvent.setup();
    const { onIndexChange } = setup(0);

    const region = screen.getByRole('region', { name: t.carouselLabel });
    region.focus();
    await user.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it('il pulsante apre il lightbox sull’indice corrente', async () => {
    const user = userEvent.setup();
    const { onOpen } = setup(1);

    await user.click(screen.getByRole('button', { name: t.openLightbox }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('con una sola immagine nasconde frecce e dots', () => {
    render(<Carousel images={[makeImage(0)]} index={0} onIndexChange={() => {}} onOpen={() => {}} />);
    expect(screen.queryByRole('button', { name: t.nextImage })).toBeNull();
    expect(screen.queryByRole('button', { name: t.previousImage })).toBeNull();
  });
});
