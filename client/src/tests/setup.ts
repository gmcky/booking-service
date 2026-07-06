import "@testing-library/jest-dom";

// jsdom ships neither IntersectionObserver nor ResizeObserver; components
// (section-nav, photo-gallery, search-pill's PanelResize) use them for
// scroll-spy and size animations that are irrelevant under jsdom.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

globalThis.IntersectionObserver ??= ObserverStub as unknown as typeof IntersectionObserver;
globalThis.ResizeObserver ??= ObserverStub as unknown as typeof ResizeObserver;

// jsdom has no matchMedia either (search-pill uses it to pick the popover
// anchor per layout). Never-matching is fine: tests don't assert positioning.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
