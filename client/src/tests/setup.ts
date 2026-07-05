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
