import '@testing-library/jest-dom/vitest';

// jsdom non implementa matchMedia: usato dal tema chiaro/scuro.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom non implementa lo scroll: polyfill no-op per non sporcare l'output dei test.
window.scrollTo = ((): void => {}) as typeof window.scrollTo;
Element.prototype.scrollIntoView = function scrollIntoView(): void {};
