import "@testing-library/jest-dom";
import { vi } from "vitest";

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
// jsdom has no layout engine, so it never implements scroll methods on
// elements (carousel.tsx calls trackRef.current.scrollBy). Stub it as a
// no-op — tests only assert on rendered content, never on scroll position.
window.HTMLElement.prototype.scrollBy ??= function scrollBy() {};

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

// jsdom has no WebGL/canvas/worker support, so maplibre-gl can never run for
// real under Vitest. Map components (client/src/components/map/*) are
// stubbed here with the minimal subset of the API they call — event
// registration, fitBounds, marker add/remove — so tests exercise the
// surrounding React code without touching the real map engine.
type Listener = (...args: unknown[]) => void;

class MockScrollZoom {
  disable = vi.fn();
  enable = vi.fn();
}

class MockMap {
  scrollZoom = new MockScrollZoom();
  // Gesture handlers the map switches off at construction (rotation is
  // disabled app-wide — pan and zoom only).
  touchZoomRotate = { disableRotation: vi.fn(), enable: vi.fn(), disable: vi.fn() };
  keyboard = { disableRotation: vi.fn(), enable: vi.fn(), disable: vi.fn() };
  private listeners = new Map<string, Set<Listener>>();

  constructor(_options: unknown) {}

  addControl = vi.fn();
  fitBounds = vi.fn();
  remove = vi.fn();
  getBounds = vi.fn(() => ({
    getSouth: () => -1,
    getNorth: () => 1,
    getWest: () => -1,
    getEast: () => 1,
  }));

  on(event: string, cb: Listener) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    // The real map fires "load" once the style/tiles resolve; nothing in
    // jsdom will ever do that, so simulate it a tick later so onMapReady
    // (and anything gated behind it) still runs in tests.
    if (event === "load") queueMicrotask(() => cb());
    return this;
  }

  once(event: string, cb: Listener) {
    const wrapped: Listener = (...args) => {
      cb(...args);
      this.listeners.get(event)?.delete(wrapped);
    };
    return this.on(event, wrapped);
  }

  off(event: string, cb: Listener) {
    this.listeners.get(event)?.delete(cb);
    return this;
  }
}

class MockMarker {
  #element: HTMLElement;
  constructor(opts: { element: HTMLElement }) {
    this.#element = opts.element;
  }
  setLngLat() {
    return this;
  }
  addTo() {
    return this;
  }
  remove = vi.fn();
  getElement() {
    return this.#element;
  }
  on() {
    return this;
  }
  getLngLat() {
    return { lng: 0, lat: 0 };
  }
}

class MockPopup {
  setLngLat() {
    return this;
  }
  setDOMContent() {
    return this;
  }
  addTo() {
    return this;
  }
  remove = vi.fn();
}

class MockLngLatBounds {
  #west = Infinity;
  #east = -Infinity;
  #south = Infinity;
  #north = -Infinity;
  extend([lng, lat]: [number, number]) {
    this.#west = Math.min(this.#west, lng);
    this.#east = Math.max(this.#east, lng);
    this.#south = Math.min(this.#south, lat);
    this.#north = Math.max(this.#north, lat);
    return this;
  }
  getWest() {
    return this.#west;
  }
  getEast() {
    return this.#east;
  }
  getSouth() {
    return this.#south;
  }
  getNorth() {
    return this.#north;
  }
}

const maplibreMock = {
  Map: MockMap,
  Marker: MockMarker,
  Popup: MockPopup,
  NavigationControl: vi.fn(),
  FullscreenControl: vi.fn(),
  LngLatBounds: MockLngLatBounds,
};

vi.mock("maplibre-gl", () => ({ default: maplibreMock, ...maplibreMock }));
