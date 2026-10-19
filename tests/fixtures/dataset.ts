import { Page } from '@playwright/test';
import { CENTROS_DATA, type DatosCentro } from './centros';

/* ============================================================================
 * DATASET — datos de prueba y utilidades puras.
 *
 * Capa separada de las Pages: NO contiene selectores ni interacciones con el
 * DOM, solo valores y helpers de propósito general reutilizables en toda la
 * suite.
 * ==========================================================================*/

/* ----------------------------------------------------------------------------
 * Datos por centro: globalSetup detecta el centro del POS y lo publica en
 * process.env.CAJA_ACTUAL; aquí se resuelven los datos de ese centro.
 *
 * Son funciones y no constantes: este módulo también lo importa globalSetup
 * ANTES de que exista CAJA_ACTUAL, y `playwright test --list` no corre
 * globalSetup. Una constante evaluada al importar rompería ambos.
 * --------------------------------------------------------------------------*/

/** Centro detectado por globalSetup (ej. "004-150"). */
export function cajaActual(): string {
  const caja = process.env.CAJA_ACTUAL?.trim();
  if (!caja) {
    throw new Error('CAJA_ACTUAL no está definida: la suite debe arrancar con globalSetup.');
  }
  return caja;
}

/** Datos de prueba del centro actual (SKUs, oferta, cédulas con crédito). */
export function datosCaja(): DatosCentro {
  const datos = CENTROS_DATA[cajaActual()];
  if (!datos) throw new Error(`No hay datos de prueba para el CENTRO ${cajaActual()} en centros.ts.`);
  return datos;
}

/** SKUs que existen y tienen stock en el centro actual. */
export function skuPool(): readonly string[] {
  return datosCaja().skus;
}

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

/**
 * Centro exigido por E2E_CENTRO_ESPERADO. Vacío → modo automático: la suite
 * corre en cualquier centro que tenga datos en centros.ts.
 */
export function centroEsperado(): string {
  return envOpcional('E2E_CENTRO_ESPERADO', '');
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
};

export type ItemCarrito = { sku: string; cantidad: number };

/** Entre 10 y 12 SKUs distintos, cantidad aleatoria > 1 (2..5). */
export function generarCarrito(min = 10, max = 12): ItemCarrito[] {
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  return [...skuPool()]
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
