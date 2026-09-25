import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// macOS uses WKWebView. Check pointer/focus behavior and modal viewport layout.
export default defineConfig(config, {
  testMatch: ['terminal-menu.spec.ts', 'dialog-layout.spec.ts'],
  outputDir: 'test-results/webkit',
  use: { ...config.use, browserName: 'webkit', launchOptions: {} },
});
