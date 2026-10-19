import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Carga credenciales y datos de prueba desde .env (ver .env.example). Se hace
// aquí para que globalSetup y los workers los hereden en process.env.
// quiet: dotenv >= 17 imprime un aviso en cada proceso (config + workers).
dotenv.config({ quiet: true });

/**
 * Configuración para la suite E2E de POSCLICK.
 *
 * Requisitos cubiertos:
 *  - Ejecución estrictamente secuencial (fullyParallel: false, workers: 1)
 *  - Evidencias en ./evidencias/: video de cada prueba (pase o falle);
 *    trace y screenshot automático solo cuando falla.
 *  - Sin reintentos: cada caso toca datos reales del POS, un reintento
 *    automático generaría transacciones duplicadas.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  outputDir: './evidencias/test-results',

  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15 * 60 * 1000,
  expect: { timeout: 20_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: './evidencias/html-report', open: 'never' }],
    ['json', { outputFile: './evidencias/resultados.json' }],
  ],

  use: {
    baseURL: 'http://localhost:4200',
    video: 'on',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  },

  projects: [
    {
      name: 'chromium-pos',
      use: {
        ...devices['Desktop Chrome'],
        // El SSO de Azure AD redirige a http://localhost:4200: el navegador
        // DEBE correr en la misma máquina que la app (ver README de la suite).
        launchOptions: { args: ['--no-sandbox'] },
      },
    },
  ],
});
