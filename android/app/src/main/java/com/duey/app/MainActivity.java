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

    /**
     * Opt the window into the panel's highest refresh-rate display mode (e.g. 90/120 Hz)
     * at the current resolution. Without this the WebView is left on the default 60 Hz mode.
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
            if (best.getModeId() != current.getModeId()) {
                WindowManager.LayoutParams params = window.getAttributes();
                params.preferredDisplayModeId = best.getModeId();
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
     * Paint the WebView with the brand color so there is no white flash before the
     * web content's first paint. Does not change rendered content.
     */
    private void polishWebView() {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().setBackgroundColor(0xFF4062BF);
            }
        } catch (Exception ignored) {
            // Cosmetic only.
        }
    }
}
