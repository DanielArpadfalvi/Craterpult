import type { CapacitorConfig } from '@capacitor/cli';

/** Matches PALETTE.skyTop (src/render/palette.ts) and the Pixi background. */
const BACKGROUND = '#05040f';

const config: CapacitorConfig = {
  appId: 'com.arpadfalvi.craterpult',
  appName: 'Craterpult',
  webDir: 'dist',
  backgroundColor: BACKGROUND,
  android: {
    backgroundColor: BACKGROUND,
    // Over-scroll glow is disabled natively in MainActivity (no config key for it).
  },
  ios: {
    backgroundColor: BACKGROUND,
    contentInset: 'never',
    // No rubber-band bounce: the game owns every touch (aim, pan, pinch).
    scrollEnabled: false,
    // Hide the WKWebView link preview / long-press callouts.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      // Hidden right away (the dark window background matches); the web app also calls
      // systemUi.hideSplash() after boot as a safety net.
      launchShowDuration: 0,
      backgroundColor: BACKGROUND,
    },
    SystemBars: {
      // Edge-to-edge webview; safe areas come from env(safe-area-inset-*) in styles.css.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Light system-bar icons on the dark backdrop.
      style: 'DARK',
    },
  },
};

export default config;
