import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e', outputDir:'/tmp/peerloop-e2e', fullyParallel:false, workers:1,
  timeout:60000, expect:{timeout:15000}, reporter:'list',
  use:{baseURL:'http://127.0.0.1:8082',...devices['iPhone 13'],defaultBrowserType:'chromium',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm -w apps/mobile exec -- expo start --web --port 8082',url:'http://127.0.0.1:8082',timeout:180000,reuseExistingServer:!process.env.CI,env:{CI:'1'}},
});
