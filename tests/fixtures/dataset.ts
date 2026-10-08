import { Page } from '@playwright/test';

/* ============================================================================
 * DATASET — datos de prueba y utilidades puras.
 *
 * Capa separada de las Pages: NO contiene selectores ni interacciones con el
 * DOM, solo valores y helpers de propósito general reutilizables en toda la
 * suite.
 * ==========================================================================*/

export const SKU_POOL = [
  'O22652', 'O22654', 'O22655', 'O22657', 'O22955', 'O22976', 'O22977', 'O22978',
  'O22979', 'O23546', 'O23553', 'O24144', 'O28268', 'O48324', 'O48357', 'O60832',
  'O60854', 'O78081', 'D01461', 'D01463', 'D01848', 'D02228', 'D02229', 'D02352',
  'D02411', 'D02427', 'D02429', 'D02431', 'D02656', 'D03247', 'D04736', 'D04827',
] as const;

export const CEDULA_POOL = [
  '0919522151', '2450681438', '0922154976', '0914880208', '0923022339', '0922350863',
  '1200007126', '0925688160', '0928181148', '0923632020', '1205902859', '0916835226',
  '0962366118', '1203874142', '0916381197', '0604473249', '1305717074', '0200875334',
  '0905448874', '0914102827', '1200018669', '0918171810', '1300437223', '1311371452',
] as const;

export const CREDENCIALES = {
  sso: { email: 'desarrollopy@pycca.com', password: 'cdPY2027!*' },
  /** Trama tal como la emite el lector de banda magnética. */
  supervisor: {
    trama: '%21310300;432940;JAIME GABRIEL HURTADO ALVAREZ',
    clave: '1979',
    nombre: 'JAIME GABRIEL HURTADO ALVAREZ',
  },
  codigoVendedor: '41602',
  ofertaEspecial: { cedula: '0914848171', cupon: 'H0867' },
} as const;

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
  return [...CEDULA_POOL].sort(() => Math.random() - 0.5).slice(0, n);
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
