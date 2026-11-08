import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor shell for the App Store / Play Store builds.
// webDir is the STORE_EXPORT=1 static build (no base path — the
// WebView serves the bundle from its root, unlike the GitHub Pages
// export which lives under /forgotten-game/).
const config: CapacitorConfig = {
  appId: 'com.ahmedmelgammal.forgottengame',
  appName: 'The Game That Forgot You',
  webDir: 'next-store',
  server: {
    // serve the bundle over https-scheme so WebAudio, canvas and
    // localStorage behave exactly like the deployed site
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
  },
}

export default config
