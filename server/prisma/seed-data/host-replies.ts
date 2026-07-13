import type { HostReplyTemplate } from "./types.js";

export const hostReplies: HostReplyTemplate[] = [
  { text: "Thank you so much for staying with us, hope to host you again soon!", tone: "thanks" },
  { text: "Really appreciate the kind words, means a lot to us.", tone: "thanks" },
  { text: "So glad you enjoyed it! Come back anytime.", tone: "thanks" },
  { text: "Thanks for the lovely review, safe travels wherever you go next.", tone: "thanks" },
  { text: "Appreciate you taking the time to write this, glad it worked out well.", tone: "thanks" },
  { text: "Thank you! Always great to host guests who leave the place as tidy as they found it.", tone: "thanks" },
  // Generic acknowledgements — kept deliberately non-specific because reviews
  // are drawn from a shared pool, so a reply can't safely reference a concrete
  // issue (noise, AC, wifi…) the review text never actually raised.
  { text: "Thanks for the honest, balanced feedback — genuinely useful, and we've smoothed out a few things since your stay.", tone: "nitpick" },
  { text: "Sorry it wasn't quite perfect. Appreciate you taking the time to share, and we've taken your notes on board.", tone: "nitpick" },
  { text: "Grateful for the candid review — we've followed up on the points you raised to make the next stay better.", tone: "nitpick" },
  { text: "Thank you for the fair write-up. We're always improving, and comments like yours are exactly what help.", tone: "nitpick" },
  { text: "Appreciate you flagging what fell short; we've already made a couple of small changes since you checked out.", tone: "nitpick" },
  { text: "Thanks for the constructive notes. Sorry we didn't fully hit the mark — we'll do better next time.", tone: "nitpick" },
];
