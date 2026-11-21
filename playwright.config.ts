import { defineConfig, devices } from '@playwright/test';

/** End-to-end tests run against the production build, so they cover what ships. */
const PORT = 4318;
/** The embedding server: the build under a sub-path, the library, and a host page. */
const EMBED_PORT = 4320;
/** Tests start as a returning visitor, so the first-run welcome doesn't cover the screen. */
const returning = { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'mc:onboarded:v1', value: '1' }] }] };

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'desktop', testIgnore: /embed\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 900 }, storageState: returning } },
    { name: 'mobile', testIgnore: /embed\.spec/, use: { ...devices['Pixel 7'], storageState: returning } },
    { name: 'embed', testMatch: /embed\.spec/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${EMBED_PORT}` } },
  ],
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      port: PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Waits for the main build (dist/) before serving it under /morse/.
      command: `npm run build:lib && node scripts/wait-for.mjs dist/index.html && node scripts/serve-embed.mjs ${EMBED_PORT}`,
      port: EMBED_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
