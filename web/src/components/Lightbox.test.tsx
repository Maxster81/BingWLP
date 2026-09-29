import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lightbox } from './Lightbox';
import { t } from '../lib/i18n';
import { makeImage, makeResolutions } from '../test/fixtures';

const images = Array.from({ length: 8 }, (_, index) => makeImage(index));

function setup(index: number) {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  const onNotify = vi.fn();
  const view = render(
    <Lightbox
      images={images}
      index={index}
      themeKey="travel"
      market="it-IT"
      resolutions={makeResolutions()}
      resolutionKey="1920x1080"
      onResolutionChange={() => {}}
      onIndexChange={onIndexChange}
      onClose={onClose}
      onNotify={onNotify}
    />,
  );
  return { onIndexChange, onClose, onNotify, view };
}

describe('Lightbox', () => {
  it('si apre come dialogo modale con titolo, crediti e contatore', () => {
    setup(2);

    const dialog = screen.getByRole('dialog', { name: t.lightboxLabel });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Panorama 3')).toBeInTheDocument();
    expect(screen.getByText(/Shutterstock/)).toBeInTheDocument();
    expect(screen.getByText(t.imageCounter(3, 8))).toBeInTheDocument();
    expect(screen.getByText(t.imagePosition(3, 8))).toBeInTheDocument();
  });

  it('sposta il focus sul pulsante di chiusura all’apertura', () => {
    setup(0);
    expect(screen.getByRole('button', { name: t.closeLightbox })).toHaveFocus();
  });

  it('le frecce avanti/indietro cambiano immagine (con wrap-around)', async () => {
    const user = userEvent.setup();
    const { onIndexChange, view } = setup(7);

    await user.click(screen.getByRole('button', { name: t.nextImage }));
    expect(onIndexChange).toHaveBeenLastCalledWith(0);

    view.rerender(
      <Lightbox
        images={images}
        index={0}
        themeKey="travel"
        market="it-IT"
        resolutions={makeResolutions()}
        resolutionKey="1920x1080"
        onResolutionChange={() => {}}
        onIndexChange={onIndexChange}
        onClose={() => {}}
        onNotify={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: t.previousImage }));
    expect(onIndexChange).toHaveBeenLastCalledWith(7);
  });

  it('i tasti freccia navigano e Esc chiude', async () => {
    const user = userEvent.setup();
    const { onIndexChange, onClose } = setup(2);

    await user.keyboard('{ArrowRight}');
    expect(onIndexChange).toHaveBeenLastCalledWith(3);

    await user.keyboard('{ArrowLeft}');
    expect(onIndexChange).toHaveBeenLastCalledWith(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('il click sul backdrop chiude anteprima', async () => {
    const user = userEvent.setup();
    const { onClose, view } = setup(0);

    const stage = view.container.querySelector('.bwp-lightbox__stage');
    expect(stage).not.toBeNull();
    if (stage) await user.click(stage);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('anche il click sullo sfondo sfocato chiude anteprima', async () => {
    const user = userEvent.setup();
    const { onClose, view } = setup(0);

    const backdrop = view.container.querySelector('.bwp-lightbox__backdrop');
    expect(backdrop).not.toBeNull();
    if (backdrop) await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('il pulsante zoom alterna 1× e 2×', async () => {
    const user = userEvent.setup();
    setup(0);

    await user.click(screen.getByRole('button', { name: t.zoomIn }));
    expect(screen.getByRole('button', { name: t.zoomOut })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: t.zoomOut }));
    expect(screen.getByRole('button', { name: t.zoomIn })).toHaveAttribute('aria-pressed', 'false');
  });

  it('blocca lo scroll della pagina finché è aperto', () => {
    const { view } = setup(0);
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
