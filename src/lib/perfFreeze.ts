// Pause continuous *decorative* CSS animations (gauge glows, flowing gradients, the
// calendar water) for the brief windows where they can't be perceived anyway: an active
// page swipe / settle and a list scroll/fling. On desktop Chrome these ambient loops are
// free, but in the Android WebView they repaint on the main thread every frame and steal
// the frames the gesture itself needs — so a swipe/scroll that should stick to the finger
// stutters. Freezing a 1.6–3s loop for the ~300ms of a gesture is invisible (nobody tracks
// a slow shimmer mid-swipe) yet hands the whole main thread back to the interaction.
//
// Token-based like overlayBlur.ts: releasing is idempotent per caller, so overlapping
// sources (a scroll that starts mid-settle) compose correctly and the body class only
// lifts once every source has released. The token set lives on globalThis so a dev
// hot-reload can't strand the class on <body>.

type TokenStore = Set<symbol>;
const g = globalThis as typeof globalThis & { __perfFreezeTokens?: TokenStore };
const tokens: TokenStore = g.__perfFreezeTokens ?? (g.__perfFreezeTokens = new Set());

function sync() {
  document.body.classList.toggle('perf-freeze', tokens.size > 0);
}

/** Call at gesture start; keep the token and pass it back to releasePerfFreeze at the end. */
export function acquirePerfFreeze(): symbol {
  const token = Symbol('perf-freeze');
  tokens.add(token);
  sync();
  return token;
}

export function releasePerfFreeze(token: symbol) {
  tokens.delete(token);
  sync();
}
