import { defineConfig, devices } from '@playwright/test';
import { APP_URL, RELAY_URL } from './test/e2e/fixtures';

export default defineConfig({
  testDir: './test/e2e',
  // Uploads and relay round trips dominate; one browser keeps the ephemeral
  // stack's state unambiguous.
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  globalSetup: './test/e2e/global-setup.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: APP_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${new URL(APP_URL).port} --strictPort`,
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    // Without this the app would talk to the public relays instead of the
    // ephemeral one in compose.yaml.
    env: { VITE_RELAYS: RELAY_URL },
  },
});
