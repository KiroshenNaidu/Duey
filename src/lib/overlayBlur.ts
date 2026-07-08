// Blur-the-app-behind-an-overlay, done deterministically. backdrop-filter on overlay
// elements sampled page layers inconsistently (big page titles stayed readable while
// smaller text went mushy), so instead every overlay holds a token that puts a real
// CSS filter on #app-root — one blur, applied uniformly to every layer behind the overlay.
//
// Token-based (not a counter): releasing is idempotent per overlay, so a double release
// can never skew the count and strand the blur. The token set lives on globalThis so a
// dev hot-reload can't reset it while the class is still on <body> (the old stuck-blur bug).

type TokenStore = Set<symbol>;
const g = globalThis as typeof globalThis & { __overlayBlurTokens?: TokenStore };
const tokens: TokenStore = g.__overlayBlurTokens ?? (g.__overlayBlurTokens = new Set());

function sync() {
  document.body.classList.toggle('overlay-blur', tokens.size > 0);
}

/** Call on overlay mount; keep the token and pass it back to releaseOverlayBlur on unmount. */
export function acquireOverlayBlur(): symbol {
  const token = Symbol('overlay-blur');
  tokens.add(token);
  sync();
  return token;
}

export function releaseOverlayBlur(token: symbol) {
  tokens.delete(token);
  sync();
}
