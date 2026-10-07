import { chromium, FullConfig } from '@playwright/test';
import { login, liberarEntregasCajaPendientes, mockImpresion } from './tests/pos.fixtures';

/**
 * Deja el POS en estado ejecutable antes de la suite:
 * con entregas de caja pendientes, Facturación responde "Acceso denegado".
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:4200';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ baseURL } as never);
  try {
    await mockImpresion(page);
    await login(page);
    await liberarEntregasCajaPendientes(page);
    console.log('[globalSetup] Caja liberada, POS listo para la suite.');
  } finally {
    await browser.close();
  }
}
