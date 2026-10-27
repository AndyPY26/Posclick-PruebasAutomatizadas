import { Page, expect, Locator } from '@playwright/test';
import type { ItemCarrito } from '../fixtures/dataset';
import { PersonSearchComponent } from './components/PersonSearchComponent';

/**
 * Pantalla "Entrega futura / Envío a" (/pos-ui/delivery).
 *
 * Usa el mismo componente `PersonSearchComponent` que `InvoicePage` pero aquí
 * representa a la persona de retiro ("Envío a"), no al cliente de facturación.
 */
export class DeliveryPage {
  constructor(private readonly page: Page) {}

  readonly envioA = this.page.locator('text=Envío a').locator('..');
  readonly tituloEntregaFutura = this.page.locator('text=Entrega futura');
  private readonly abrirCalendario = this.page.locator('button[aria-label="Elige fecha"]');
  private readonly diaHabilitado = this.page.locator('span.p-datepicker-day:not(.p-disabled)');
  private readonly telefono = this.page.locator('input[placeholder="09xxxxxxxx"]');
  private readonly continuarBtn = this.page.locator('button:has-text("Continuar")');

  readonly persona = new PersonSearchComponent(this.page);

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/pos-ui\/delivery/, { timeout: 60_000 });
  }

  async setTelefono(numero: string): Promise<void> {
    await this.telefono.fill(numero);
  }

  async esperarEnvioAContiene(texto: string): Promise<void> {
    await expect(this.envioA).toContainText(texto);
  }

  /** Lee el total "Movimiento de unidades" del panel derecho. */
  private async totalUnidades(): Promise<number> {
    // La etiqueta "Total Unidades:" y el número son nodos hermanos: se sube
    // desde el título del panel hasta un contenedor que tenga ambos.
    return this.page
      .evaluate(() => {
        let el: HTMLElement | null = Array.from(document.querySelectorAll('h2')).find((h) =>
          /Movimiento de unidades/.test(h.textContent || ''),
        ) as HTMLElement | null;
        for (let i = 0; i < 6 && el; i++) {
          const m = /Total Unidades:\s*(\d+)/.exec((el.innerText || '').replace(/\s+/g, ' '));
          if (m) return Number(m[1]);
          el = el.parentElement;
        }
        return 0;
      })
      .catch(() => 0);
  }

  /** Tabla central de tiendas con inventario ("Productos disponibles"). */
  private readonly tablaTiendas = this.page.locator('table:has-text("Tienda Destino")');

  /**
   * Sube en 1 un `p-inputnumber` con su botón "+" y confirma con Tab.
   * `fill()` NO sirve en estos contadores: cambia el texto pero no el model de
   * Angular, así que nunca se dispara `POST /api/product/v1/check-inventory`
   * ni se suma a "Movimiento de unidades". Esa era la causa del falso D-06.
   */
  private async incrementar(contenedor: Locator): Promise<void> {
    await contenedor.locator('.p-inputnumber-increment-button').first().click();
    await this.page.keyboard.press('Tab');
  }

  /**
   * Configura la entrega mínima: deja 1 unidad del primer SKU del carrito que
   * tenga inventario en alguna tienda, más fecha y teléfono.
   *
   * Flujo FE 1.13.0 (verificado 2026-10-16 en 004-150):
   *  1. Panel izquierdo: subir "Entrega" del SKU con "+" → check-inventory.
   *  2. Tabla "Productos disponibles": Tienda · Ciudad · Inventario · Cantidad ·
   *     Tienda Destino. Subir "Cantidad" de la primera tienda con "+".
   *  3. "Movimiento de unidades → Total Unidades" debe subir.
   * Si un SKU no tiene tiendas ("No se encontraron tiendas."), se vuelve su
   * Entrega a 0 y se prueba el siguiente.
   */
  async configurarEntregaMinima(carrito: ItemCarrito[]): Promise<void> {
    const sinStock: string[] = [];
    let configurado: string | null = null;

    for (const { sku } of carrito) {
      const entrega = this.page.locator(
        `p-inputnumber#mf_sale_delivery_product_list_table_quantity_delivery_input_${sku}, ` +
          `#mf_sale_delivery_product_list_table_quantity_delivery_input_${sku}:not(input)`,
      ).first();
      if (!(await entrega.isVisible().catch(() => false))) {
        console.log(`[DeliveryPage] SKU=${sku} no está en el panel de entrega → skip`);
        continue;
      }
      const totalAntes = await this.totalUnidades();

      const inventario = this.page
        .waitForResponse((r) => /\/product\/v1\/check-inventory/.test(r.url()), { timeout: 15_000 })
        .catch(() => null);
      await this.incrementar(entrega);
      await inventario;
      await this.page.waitForTimeout(1_500);

      const primeraFila = this.tablaTiendas.locator('tbody tr').first();
      const sinTiendas = /No se encontraron tiendas/i.test(
        (await primeraFila.innerText().catch(() => '')) || '',
      );
      if (sinTiendas) {
        console.log(`[DeliveryPage] ⚠️  SKU=${sku} sin tiendas con inventario → skip`);
        sinStock.push(sku);
        await entrega.locator('.p-inputnumber-decrement-button').first().click().catch(() => undefined);
        await this.page.keyboard.press('Tab');
        await this.page.waitForTimeout(1_000);
        continue;
      }

      const tienda = (await primeraFila.innerText()).split('\n')[0]?.trim();
      await this.incrementar(primeraFila);
      await this.page.waitForTimeout(1_500);
      const totalDespues = await this.totalUnidades();
      if (totalDespues > totalAntes) {
        console.log(
          `[DeliveryPage] ✅ SKU=${sku} → 1 u. desde "${tienda}" (total ${totalAntes}→${totalDespues})`,
        );
        configurado = sku;
        break;
      }
      console.log(`[DeliveryPage] ⚠️  SKU=${sku}: Total Unidades no subió (${totalAntes}) → skip`);
      sinStock.push(sku);
    }

    console.log(
      `[DeliveryPage] Resumen: configurado=${configurado ?? '-'} sinStock=${sinStock.length} ` +
        `total=${await this.totalUnidades()}`,
    );
    if (!configurado) {
      throw new Error(
        'Ningún SKU del carrito tiene inventario para entrega futura. SKUs probados: ' +
          carrito.map((c) => c.sku).join(', ') +
          ' | Sin tiendas: ' +
          sinStock.join(', '),
      );
    }

    await this.elegirFechaEntrega();
    await this.telefono.fill('0991234567');
    await this.page.waitForTimeout(1_000);
  }

  /**
   * Abre el calendario de "Fecha de entrega" y elige el último día habilitado.
   *
   * El click en "Elige fecha" a veces no despliega el panel (corrida del
   * 2026-10-26 en 004-112: el panel nunca llegó al DOM), así que se reintenta
   * hasta ver los días. Si el mes visible no tiene días habilitados (plazo de
   * entrega que cae en el mes siguiente), avanza un mes.
   */
  private async elegirFechaEntrega(): Promise<void> {
    const dias = this.page.locator('span.p-datepicker-day');
    for (let intento = 1; intento <= 3; intento++) {
      await this.abrirCalendario.click();
      const abierto = await dias
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!abierto) {
        console.log(`[DeliveryPage] intento ${intento}: el calendario no se abrió → reintentar`);
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(1_500);
        continue;
      }
      if ((await this.diaHabilitado.count()) === 0) {
        console.log('[DeliveryPage] sin días habilitados en el mes visible → mes siguiente');
        await this.page.locator('.p-datepicker-next-button').first().click();
        await this.page.waitForTimeout(800);
      }
      await this.diaHabilitado.last().click();
      await this.page.keyboard.press('Escape');
      return;
    }
    throw new Error('El calendario de "Fecha de entrega" no se abrió tras 3 intentos.');
  }

  /** Continuar → vuelve al carrito (/pos-ui/invoice). */
  async continuar(): Promise<void> {
    await this.continuarBtn.first().click();
    await this.page.waitForURL(/pos-ui\/invoice/, { timeout: 30_000 });
  }
}
