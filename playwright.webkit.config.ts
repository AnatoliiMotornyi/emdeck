import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// macOS uses WKWebView. Chromium alone cannot catch its pointer/focus behavior.
export default defineConfig(config, {
  testMatch: 'terminal-menu.spec.ts',
  outputDir: 'test-results/webkit',
  use: { ...config.use, browserName: 'webkit', launchOptions: {} },
});
