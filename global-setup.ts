import { chromium, FullConfig } from '@playwright/test';
import { LoginPage } from './tests/pages/LoginPage';
import { DashboardPage } from './tests/pages/DashboardPage';
import { centroEsperado, mockImpresion } from './tests/fixtures/dataset';
import { CENTROS_DATA, CENTROS_SOPORTADOS } from './tests/fixtures/centros';

/**
 * Deja el POS en estado ejecutable antes de la suite: caja abierta y lista.
 *
 * Flujo correcto (verificado 2026-10-13):
 *  1. Login SSO y detección del centro (ver resolverCentro). El centro
 *     detectado se publica en process.env.CAJA_ACTUAL para los workers.
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
    const caja = resolverCentro(await dashboard.leerCentro());
    process.env.CAJA_ACTUAL = caja;
    await dashboard.asegurarCajaAbierta();
    console.log(`[globalSetup] CENTRO ${caja} con caja abierta, POS listo para la suite.`);
  } finally {
    await browser.close();
  }
}

/**
 * Modo estricto (E2E_CENTRO_ESPERADO con valor): el POS debe estar en ese centro.
 * Modo automático (vacío): vale cualquier centro que tenga datos en centros.ts.
 */
function resolverCentro(detectado: string | null): string {
  const esperado = centroEsperado();
  const modo = esperado ? `estricto, espera ${esperado}` : 'automático';
  console.log(`[globalSetup] POS detectado: CENTRO ${detectado ?? '(no detectado)'} · modo ${modo}`);
  if (!detectado) {
    throw new Error('No se pudo leer el centro ("CENTRO xxx-xxx") en el encabezado del POS.');
  }
  if (esperado && detectado !== esperado) {
    throw new Error(
      `El POS está en CENTRO ${detectado} y la suite espera ${esperado}. ` +
        'Revisa la caja asignada a esta IP o deja E2E_CENTRO_ESPERADO vacío (modo automático).',
    );
  }
  const datos = CENTROS_DATA[detectado];
  if (!datos) {
    throw new Error(
      `El POS está en CENTRO ${detectado} y no hay datos de prueba para ese centro. ` +
        `Centros soportados: ${CENTROS_SOPORTADOS.join(', ')}. ` +
        'Agrégalo en tests/fixtures/centros.ts o pide que reasignen la caja.',
    );
  }
  console.log(
    `[globalSetup] Usando datos de ${detectado}: ${datos.skus.length} SKUs · ` +
      `oferta ${datos.oferta?.vigente ? 'vigente' : 'no vigente'} · ` +
      `${datos.credito.length} cédulas con crédito`,
  );
  return detectado;
}
