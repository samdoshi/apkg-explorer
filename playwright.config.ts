import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:4173/apkg-explorer/'

export default defineConfig({
  testDir: 'e2e',
  // Kept separate from test-results/screens/ so screenshots survive between runs.
  outputDir: 'test-results/artifacts',
  reporter: 'line',
  maxFailures: 1,
  forbidOnly: true,
  fullyParallel: true,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: baseURL,
    reuseExistingServer: false,
  },
})
