import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { InvoicePage } from '../pages/InvoicePage';
import { mockImpresion } from './dataset';

/**
 * Fixtures de Playwright para la suite POSCLICK.
 *
 * - `loginPage` / `dashboardPage` → instancias sueltas para flujos puntuales
 *   (p.ej. global-setup o tests que arrancan en una pantalla específica).
 * - `pos` → fixture compuesto para los flujos de negocio: hace
 *   mock de impresión + login SSO + liberar entregas de caja pendientes +
 *   abrir Facturación, y entrega las Pages ya listas.
 *
 * Uso típico:
 *
 *   import { test, expect } from '../fixtures/pos.fixture';
 *
 *   test('Caso X', async ({ pos }) => {
 *     const { invoice, page } = pos;
 *     await invoice.cargarCarrito(...);
 *   });
 */
export type PosContext = {
  page: Page;
  dashboard: DashboardPage;
  invoice: InvoicePage;
};

type Fixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  pos: PosContext;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  pos: async ({ page }, use) => {
    await mockImpresion(page);
    const login = new LoginPage(page);
    await login.loginSSO();
    const dashboard = new DashboardPage(page);
    // Sin esto, Facturación responde "Acceso denegado: tiene entregas de caja pendientes".
    await dashboard.liberarEntregasCajaPendientes();
    const invoice = await dashboard.irAFacturacion();
    await use({ page, dashboard, invoice });
  },
});

export { expect } from '@playwright/test';
