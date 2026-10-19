import { chromium, FullConfig } from '@playwright/test';
import { LoginPage } from './tests/pages/LoginPage';
import { DashboardPage } from './tests/pages/DashboardPage';
import { centroEsperado, mockImpresion } from './tests/fixtures/dataset';

/**
 * Deja el POS en estado ejecutable antes de la suite: caja abierta y lista.
 *
 * Flujo correcto (verificado 2026-10-13):
 *  1. Login SSO y validar que el POS está en el centro esperado (E2E_CENTRO_ESPERADO).
 *  2. Si Facturación responde con "Acceso denegado — realice apertura de caja",
 *     entrar a Apertura de Caja y clickear "Aperturar caja".
 *  3. Reintentar Facturación hasta que /pos-ui/invoice sea navegable.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:4200';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await mockImpresion(page);
    const login = new LoginPage(page);
    await login.loginSSO();
    const dashboard = new DashboardPage(page);
    await dashboard.asegurarCentroEsperado(centroEsperado());
    await dashboard.asegurarCajaAbierta();
    console.log(`[globalSetup] CENTRO ${centroEsperado()} con caja abierta, POS listo para la suite.`);
  } finally {
    await browser.close();
  }
}
