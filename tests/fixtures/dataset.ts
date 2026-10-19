import { Page } from '@playwright/test';

/* ============================================================================
 * DATASET — datos de prueba y utilidades puras.
 *
 * Capa separada de las Pages: NO contiene selectores ni interacciones con el
 * DOM, solo valores y helpers de propósito general reutilizables en toda la
 * suite.
 * ==========================================================================*/

export const SKU_POOL = [
  // Pool original (familias O / D)
  'O22652', 'O22654', 'O22655', 'O22657', 'O22955', 'O22976', 'O22977', 'O22978',
  'O22979', 'O23546', 'O23553', 'O24144', 'O28268', 'O48324', 'O48357', 'O60832',
  'O60854', 'O78081', 'D01461', 'D01463', 'D01848', 'D02228', 'D02229', 'D02352',
  'D02411', 'D02427', 'D02429', 'D02431', 'D02656', 'D03247', 'D04736', 'D04827',
  // Familia M (muebles)
  'M02754', 'M03024', 'M03128', 'M03159', 'M03146', 'M03176', 'M03219', 'M03187',
  'M03194', 'M03174', 'M03201', 'M03209', 'M03267', 'M03274', 'M03250', 'M03266',
  'M03322', 'M03348', 'M03433', 'M03434', 'M03425', 'M03477', 'M03474', 'M03472',
  'M03473', 'M03478', 'M03480', 'M03476', 'M03493', 'M03492', 'M03507', 'M03526',
  'M03543', 'M03612', 'M03618', 'M03619', 'M03623', 'M03626', 'M03630', 'M03636',
  'M03633', 'M03614', 'M03628', 'M03625', 'M03640', 'M03620', 'M03653', 'M03642',
  'M03654', 'M03670', 'M03647', 'M03659', 'M03661', 'M03674', 'M03662', 'M03652',
  'M03664', 'M03665', 'M03667', 'M03686', 'M03641', 'M03643', 'M03656', 'M03672',
  'M03707', 'M03691', 'M03694', 'M03700', 'M03717', 'M03718', 'M03711', 'M03712',
  'M03713', 'M03710', 'M03763', 'M03758', 'M03779', 'M03760', 'M03762', 'M03781',
  'M03784', 'M03785', 'M03775', 'M03768', 'M03769', 'M03776', 'M03770', 'M03771',
  'M03773', 'M03774', 'M03782', 'M03803', 'M03788', 'M03808', 'M03810', 'M03811',
  'M03812', 'M03813', 'M03815', 'M03787', 'M03821', 'M03805', 'M03807', 'M03824',
  'M03809', 'M03791', 'M03793', 'M03816', 'M03820', 'M03822', 'M03826', 'M03856',
  'M03834', 'M03835', 'M03836', 'M03827', 'M03829', 'M03830', 'M03850', 'M03837',
  'M03838',
  // Familia L (línea blanca)
  'L00217', 'L00441', 'L00442', 'L00507', 'L00669', 'L00672', 'L00676', 'L00680',
  'L00682', 'L00825', 'L00949', 'L00950', 'L00953', 'L01029', 'L01036', 'L01037',
  'L01042', 'L01043', 'L01046', 'L01258', 'L01397', 'L01402', 'L01408', 'L01416',
  'L01418', 'L01421', 'L01422', 'L01429', 'L01431', 'L01450', 'L01477', 'L01487',
  'L01489', 'L01492', 'L01493',
  // Familia A (audio/elec)
  'A00032', 'A00151', 'A00339', 'A00340', 'A00342', 'A00448', 'A00449', 'A00524',
  'A00706', 'A00708', 'A00709', 'A00722', 'A00761', 'A00782', 'A00850', 'A00852',
  'A00862', 'A00982', 'A01108', 'A01147', 'A01210', 'A01332', 'A01372', 'A01373',
  'A01390', 'A01419', 'A01421', 'A01473', 'A01474', 'A01483', 'A01500', 'A01505',
  'A01507', 'A01517', 'A01531', 'A01535', 'A01552', 'A01571', 'A01573', 'A01575',
  'A01597', 'A01599', 'A01630', 'A01631', 'A01632', 'A01633', 'A01636',
  // Familia Y (surtidos)
  'Y01417', 'Y02982', 'Y03047', 'Y03228', 'Y03459', 'Y04813', 'Y05035', 'Y05036',
  'Y05053', 'Y05064', 'Y05195', 'Y05256', 'Y05316', 'Y06069', 'Y07484', 'Y07493',
  'Y08772', 'Y09126', 'Y09222', 'Y09279', 'Y09285', 'Y09472', 'Y09560', 'Y10974',
  'Y10977', 'Y11126', 'Y12553', 'Y12566', 'Y12567', 'Y12570', 'Y12577', 'Y12578',
] as const;

/* ----------------------------------------------------------------------------
 * Datos sensibles: se leen del `.env` (ver `.env.example`), nunca del código.
 * `playwright.config.ts` carga el `.env` con dotenv antes de correr la suite.
 * Las lecturas son perezosas (getters): una variable que falta solo rompe el
 * caso que la usa, con un mensaje que dice exactamente qué agregar.
 * --------------------------------------------------------------------------*/

function envRequerida(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) {
    throw new Error(
      `Falta la variable ${nombre} en el .env. Copia .env.example a .env y complétala.`,
    );
  }
  return valor;
}

function envOpcional(nombre: string, porDefecto: string): string {
  return process.env[nombre]?.trim() || porDefecto;
}

/** Cédulas de clientes de prueba (CLUB PYCCA), separadas por coma en E2E_CEDULA_POOL. */
export function cedulaPool(): string[] {
  const pool = envRequerida('E2E_CEDULA_POOL')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (pool.length === 0) throw new Error('E2E_CEDULA_POOL no tiene cédulas.');
  return pool;
}

/** Centro POS para el que está armado el dataset; globalSetup lo valida. */
export function centroEsperado(): string {
  return envOpcional('E2E_CENTRO_ESPERADO', '004-150');
}

export const CREDENCIALES = {
  sso: {
    get email() {
      return envRequerida('E2E_SSO_EMAIL');
    },
    get password() {
      return envRequerida('E2E_SSO_PASSWORD');
    },
  },
  /** Autorización de supervisor (entrega de caja, entrega futura, reimpresión). */
  supervisor: {
    /** Trama tal como la emite el lector de banda magnética (con el `%` inicial). */
    get trama() {
      return envRequerida('E2E_SUPERVISOR_TRAMA');
    },
    get clave() {
      return envRequerida('E2E_SUPERVISOR_CLAVE');
    },
    /** Por defecto, el tercer campo de la trama (`%tarjeta;id;NOMBRE`). */
    get nombre() {
      return envOpcional('E2E_SUPERVISOR_NOMBRE', this.trama.split(';')[2] ?? '');
    },
  },
  get codigoVendedor() {
    return envRequerida('E2E_CODIGO_VENDEDOR');
  },
  /** Solo la usa el Caso 2; si la oferta vence, basta actualizar el .env. */
  ofertaEspecial: {
    get cedula() {
      return envRequerida('E2E_OFERTA_CEDULA');
    },
    get cupon() {
      return envRequerida('E2E_OFERTA_CUPON');
    },
  },
};

export type ItemCarrito = { sku: string; cantidad: number };

/** Entre 10 y 12 SKUs distintos, cantidad aleatoria > 1 (2..5). */
export function generarCarrito(min = 10, max = 12): ItemCarrito[] {
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  return [...SKU_POOL]
    .sort(() => Math.random() - 0.5)
    .slice(0, n)
    .map((sku) => ({ sku, cantidad: Math.floor(Math.random() * 4) + 2 }));
}

export function tomarCedulas(n: number): string[] {
  return cedulaPool().sort(() => Math.random() - 0.5).slice(0, n);
}

export function generarImei(): string {
  return `3597475${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

export const montoDe = (texto: string): number =>
  Number((/([\d]+[\d.,]*)/.exec(texto)?.[1] ?? '0').replace(/,/g, ''));

export const numeroDeCuotas = (texto: string): number =>
  Number(/\((\d+)\s*CUOTAS?\)/i.exec(texto)?.[1] ?? 0);

export async function evidencia(page: Page, nombre: string): Promise<void> {
  await page.screenshot({ path: `./evidencias/${nombre}.png`, fullPage: true });
}

/**
 * Selecciona una opción de un dropdown PrimeNG.
 *
 * El click directo sobre el texto lo intercepta `<p-selectitem>`; el teclado sí
 * funciona, pero la secuencia NO puede interrumpirse (un screenshot o un dump
 * intermedio cierran el overlay).
 */
export async function seleccionarEnDropdown(
  page: Page,
  trigger: string,
  posicion = 1,
): Promise<void> {
  await page.locator(trigger).first().click();
  await page.waitForTimeout(1_500);
  for (let i = 0; i < posicion; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2_000);
}

/** Cierra diálogos de hardware ausente (impresora / cajón) y confirmaciones. */
export async function cerrarDialogos(page: Page, veces = 3): Promise<void> {
  for (let i = 0; i < veces; i++) {
    const aceptar = page.locator('p-dialog button:has-text("Aceptar")').first();
    if (await aceptar.isVisible().catch(() => false)) {
      await aceptar.click().catch(() => undefined);
      await page.waitForTimeout(1_500);
    }
  }
}

/** Mock de impresión: evita el error "Impresora no encontrada". */
export async function mockImpresion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.print = () => console.log('[MOCK_PRINT] Impresión interceptada con éxito');
  });
}
