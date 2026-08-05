package com.duey.app;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FolderAccessPlugin.class);
        super.onCreate(savedInstanceState);

        applyHighestRefreshRate();
        polishWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-apply in case the system reset the preferred mode while backgrounded.
        applyHighestRefreshRate();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // onResume can run before the window is actually attached and focused, and the
        // platform drops a non-focused window's preferred mode. Returning from the app
        // switcher, the notification shade or a permission dialog therefore lands here —
        // often WITHOUT another onResume — so this is the hook that reliably restores
        // 120 Hz after every interruption, not just after a cold start.
        if (hasFocus) {
            applyHighestRefreshRate();
        }
    }

    /**
     * Opt the window into the panel's highest refresh-rate display mode (e.g. 90/120 Hz)
     * at the current resolution. Without this the WebView is left on the default 60 Hz mode.
     *
     * Two signals are set, because either one alone gets ignored on some devices:
     *
     *   preferredDisplayModeId — names an exact supported mode. Authoritative when the
     *       platform honours it, but on Android 11+ a request whose mode switch is not
     *       "seamless" can be silently dropped (and OEM skins drop it more often still).
     *   preferredRefreshRate  — a plain "run this window this fast" hint with no mode
     *       switch attached. Weaker, but it survives exactly the cases above.
     *
     * Setting both is safe: the platform documents preferredDisplayModeId as taking
     * precedence, so the rate is only consulted when the mode request didn't land.
     */
    private void applyHighestRefreshRate() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }
        try {
            Window window = getWindow();
            if (window == null) {
                return;
            }
            Display display = getActiveDisplay();
            if (display == null) {
                return;
            }
            Display.Mode current = display.getMode();
            Display.Mode best = current;
            for (Display.Mode mode : display.getSupportedModes()) {
                boolean sameResolution =
                        mode.getPhysicalWidth() == current.getPhysicalWidth()
                                && mode.getPhysicalHeight() == current.getPhysicalHeight();
                if (sameResolution && mode.getRefreshRate() > best.getRefreshRate()) {
                    best = mode;
                }
            }
            WindowManager.LayoutParams params = window.getAttributes();
            boolean changed = false;
            if (params.preferredDisplayModeId != best.getModeId()) {
                params.preferredDisplayModeId = best.getModeId();
                changed = true;
            }
            // Float compare against the exact value we'd write — the window's params are
            // reset by the platform across some backgrounding paths, so "already correct"
            // has to be re-checked rather than assumed.
            if (params.preferredRefreshRate != best.getRefreshRate()) {
                params.preferredRefreshRate = best.getRefreshRate();
                changed = true;
            }
            // Only touch the window when something actually differs: setAttributes forces a
            // relayout, and running one on every focus gain would cost a frame each time.
            if (changed) {
                window.setAttributes(params);
            }
        } catch (Exception ignored) {
            // Never let a display-mode tweak crash startup.
        }
    }

    /**
     * Return the display this activity is on, using the non-deprecated
     * Context.getDisplay() on Android 11+ and falling back on older devices.
     */
    @SuppressWarnings("deprecation")
    private Display getActiveDisplay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return getDisplay();
        }
        return getWindowManager().getDefaultDisplay();
    }

    /**
     * Paint the WebView with the app's dark background so there is no flash before the
     * web content's first paint. Matches the native splash and the web loading screen
     * (#111113) so the whole cold start is a single uninterrupted dark. Does not change
     * rendered content.
     */
    private void polishWebView() {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().setBackgroundColor(0xFF111113);
            }
        } catch (Exception ignored) {
            // Cosmetic only.
        }
    }
}
