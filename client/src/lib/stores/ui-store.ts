import { create } from "zustand";

/** Small cross-tree UI flags. `mapOverlayOpen` lets the fullscreen mobile map
 *  hide the bottom nav (whose global stacking context otherwise paints over
 *  the framer-animated overlay). */
interface UiState {
  mapOverlayOpen: boolean;
  setMapOverlayOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mapOverlayOpen: false,
  setMapOverlayOpen: (open) => set({ mapOverlayOpen: open }),
}));
