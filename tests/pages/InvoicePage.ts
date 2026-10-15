import { Page, expect, Locator } from '@playwright/test';
import type { ItemCarrito } from '../fixtures/dataset';
import { generarImei } from '../fixtures/dataset';
import { PersonSearchComponent } from './components/PersonSearchComponent';
import { CargarFacturaDialog } from './CargarFacturaDialog';
import { SuspendedTxDialog } from './SuspendedTxDialog';
import { SupervisorAuthDialog } from './SupervisorAuthDialog';
import { DeliveryPage } from './DeliveryPage';
import { PaymentPage } from './PaymentPage';

/**
 * Pantalla principal del POS: carrito de facturación (/pos-ui/invoice).
 *
 * Expone el flujo central: cargar productos, aplicar descuentos/ofertas,
 * suspender, recuperar, asignar cliente y pasar a entrega o pago.
 */
export class InvoicePage {
  constructor(private readonly page: Page) {}

  /* ---------- locators privados ---------- */
  // DOM scrape 2026-10-15 (FE 1.12.0-rc.5): id estable para el buscador.
  private readonly buscarSku = this.page.locator(
    '#mf_product_search_product_input, input[placeholder="Buscar producto por SKU"]',
  ).first();
  private readonly infoPendiente = this.page.locator('text=Pendiente');
  private readonly suspenderBtn = this.page.locator(
    '#mf_sale_product_list_table_suspended_sales_transaction',
  );
  private readonly entregaFuturaBtn = this.page.locator(
    '#mf_sale_product_list_table_future_delivery',
  );
  private readonly recuperarSuspendidaBtn = this.page.locator(
    '#mf_prod_search_product_list_table_recover_suspended_sales_transactions',
  );
  private readonly abrirCargarFacturaBtn = this.page.locator(
    '#mf_prod_search_product_list_table_find_invoice',
  );
  private readonly checkboxTodos = this.page.locator('table input[type=checkbox]');
  // Footer /invoice (DOM 2026-10-15):
  //   #mf_sale_button_cancel  → texto "Regresar" (antes "Cancelar")
  //   #mf_sale_button_accept  → texto "Continuar"
  // Hay un segundo par "Regresar"/"Continuar" arriba, el 'Continuar' superior
  // queda disabled y rompía el `.first()` genérico anterior.
  private readonly cancelarBtn = this.page.locator('#mf_sale_button_cancel');
  private readonly confirmarEliminarBtn = this.page.locator('button:has-text("Sí, eliminar")');
  private readonly continuarBtn = this.page.locator('#mf_sale_button_accept');

  /** Botón "Confirmar" del diálogo propio de suspensión (NO es el de supervisor). */
  private readonly confirmarSuspension = this.page.locator('button:has-text("Confirmar")');

  /* ---------- locators públicos (asserts) ---------- */
  readonly valorDescuento = this.page.locator('#mf_sale_discount_value');
  readonly totalValor = this.page.locator('#mf_sale_total_value');
  readonly dialogoSuspender = this.page.locator('text=Suspender transacción');
  readonly carritoVacio = this.page.locator('text=$0.00').first();

  readonly persona = new PersonSearchComponent(this.page);

  /* ---------- info adicional (modal intermedio al agregar SKU que lo exige) ---------- */
  private readonly ia = {
    homologacion: this.page.locator('#homologacion_0'),
    imei: this.page.locator('#imei_0 input'),
    marca: this.page.locator('#marca_0'),
    modelo: this.page.locator('#modelo_0'),
    continuar: this.page.locator('button:has-text("Continuar")'),
  };

  /* ============================================================================
   * Navegación
   * ==========================================================================*/

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/pos-ui\/invoice/, { timeout: 30_000 });
    await this.page.waitForTimeout(2_000);
  }

  /** Pasa a /pos-ui/pay. Devuelve la Page de pago. */
  async continuar(): Promise<PaymentPage> {
    // Varios paneles (cliente, resumen) dejan p-dialog-mask residuales que
    // interceptan el click incluso con force → JS click directo.
    await this.continuarBtn.first().evaluate((el: HTMLElement) => el.click());
    // Si hay stock insuficiente, aparece modal "Validación de saldo" con botones
    // Cancelar/Continuar. Aceptamos para que la app ajuste cantidades y proceda.
    const titulo = this.page.locator('text=Validación de saldo');
    await titulo.waitFor({ state: 'visible', timeout: 7_000 }).catch(() => undefined);
    if (await titulo.isVisible().catch(() => false)) {
      const modalRoot = titulo
        .locator(
          'xpath=ancestor::lib-modal | ancestor::p-dialog | ancestor::div[contains(@class,"p-dialog")]',
        )
        .first();
      await modalRoot
        .locator('button:has-text("Continuar")')
        .first()
        .evaluate((el: HTMLElement) => el.click());
      await this.page.waitForTimeout(3_000);
      // Tras aceptar la validación de saldo, el ajuste de inventario requiere
      // autorización de supervisor.
      const auth = new SupervisorAuthDialog(this.page);
      if (await auth.modal.isVisible().catch(() => false)) {
        await auth.autorizar();
        await this.page.waitForTimeout(3_000);
      }
    }
    const pay = new PaymentPage(this.page);
    await pay.esperarCargada();
    return pay;
  }

  /**
   * Helper: click que atraviesa wrappers lib-button/p-button y dispara el
   * handler Angular del <button> interno. Un simple `evaluate(el=>el.click())`
   * sobre el custom element no bubble el handler en PrimeNG v18.
   */
  private async clickCustom(locator: Locator): Promise<void> {
    await locator
      .evaluate((el: HTMLElement) => {
        const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') as HTMLElement | null);
        btn?.click();
      })
      .catch(async () => locator.click({ force: true }));
  }

  /** Entrega futura: selecciona todo + autoriza supervisor + navega a /delivery. */
  async irAEntregaFuturaConAutorizacion(): Promise<DeliveryPage> {
    await this.checkboxTodos.first().evaluate((el: HTMLElement) => el.click());
    await this.clickCustom(this.entregaFuturaBtn);
    const auth = new SupervisorAuthDialog(this.page);
    await auth.autorizar();
    const delivery = new DeliveryPage(this.page);
    await delivery.esperarCargada();
    return delivery;
  }

  /** Variante que NO autoriza: útil para validar que el modal aparece (Caso 4). */
  async abrirEntregaFutura(): Promise<SupervisorAuthDialog> {
    await this.checkboxTodos.first().evaluate((el: HTMLElement) => el.click());
    await this.clickCustom(this.entregaFuturaBtn);
    return new SupervisorAuthDialog(this.page);
  }

  /* ============================================================================
   * Carrito
   * ==========================================================================*/

  cantidadInputLocator(sku: string): Locator {
    return this.page.locator(`#mf_sale_product_list_table_quantity_${sku} input`);
  }

  /**
   * Carga items resolviendo la "Info adicional" (IMEI) cuando el SKU la exige.
   *
   * Tolerante a SKUs del pool que no existen o no tienen stock en el centro:
   * si tras presionar Enter la fila del SKU no aparece en 3s, logea y salta
   * al siguiente item.
   */
  async cargarCarrito(items: ItemCarrito[]): Promise<void> {
    const cargados: string[] = [];
    const saltados: string[] = [];
    for (const { sku, cantidad } of items) {
      await this.buscarSku.fill(sku);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(2_000);

      const pendiente = this.infoPendiente.first();
      if (await pendiente.isVisible().catch(() => false)) {
        await pendiente.click();
        await this.ia.homologacion.fill('HOM-2026-001');
        await this.ia.imei.fill(generarImei());
        await this.ia.marca.fill('GENERICA');
        await this.ia.modelo.fill('MODELO-TEST');
        await this.ia.continuar.first().click();
        await this.page.waitForTimeout(1_000);
      }

      // Verificar que la fila del SKU apareció en la tabla
      const filaOk = await this.page
        .locator(`#mf_sale_product_list_table_row_${sku}`)
        .waitFor({ state: 'attached', timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (!filaOk) {
        console.log(`[InvoicePage.cargarCarrito] ⚠️ SKU=${sku} no se agregó al carrito (producto inexistente o sin stock) → skip`);
        saltados.push(sku);
        continue;
      }

      if (cantidad > 1) {
        const input = this.cantidadInputLocator(sku);
        await input.fill(String(cantidad)).catch(() => undefined);
        await input.press('Tab').catch(() => undefined);
        await this.page.waitForTimeout(600);
      }
      cargados.push(sku);
    }
    console.log(
      `[InvoicePage.cargarCarrito] Resumen: cargados=${cargados.length} ` +
        `saltados=${saltados.length} (${saltados.join(', ')})`,
    );
    if (cargados.length === 0) {
      throw new Error(
        'Ningún SKU del carrito pudo agregarse. Verifica que el pool tenga ' +
          'SKUs válidos para el centro 004-112. SKUs probados: ' +
          items.map((i) => i.sku).join(', '),
      );
    }
  }

  /** Vacía el carrito en curso (Cancelar → "Sí, eliminar"). Idempotente. */
  async vaciar(): Promise<void> {
    const cancelar = this.cancelarBtn.last();
    if (!(await cancelar.isVisible().catch(() => false))) return;
    // JS click: la máscara residual del panel de productos puede interceptar.
    await cancelar.evaluate((el: HTMLElement) => el.click());
    await this.page.waitForTimeout(1_200);
    await this.confirmarEliminarBtn
      .first()
      .evaluate((el: HTMLElement) => el.click())
      .catch(() => undefined);
    await this.page.waitForTimeout(2_500);
  }

  /* ============================================================================
   * Suspensión / recuperación
   * ==========================================================================*/

  /** Lanza el diálogo de suspensión. NO pide supervisor. */
  async suspender(): Promise<void> {
    // suspenderBtn es un lib-button; clickCustom asegura disparar ngClick del
    // <button> interno aunque haya máscaras p-dialog-mask residuales.
    await this.clickCustom(this.suspenderBtn);
    await expect(this.dialogoSuspender).toBeVisible();
    await this.clickCustom(this.confirmarSuspension.first());
    await this.page.waitForTimeout(3_000);
    await expect(this.carritoVacio).toBeVisible();
  }

  /** El botón de suspender está deshabilitado cuando ya hay una suspendida. */
  async esperarSuspenderDeshabilitado(): Promise<void> {
    await expect(this.page.locator('#mf_sale_product_list_table_suspended_sales_transaction button')).toBeDisabled();
  }

  async abrirRecuperarSuspendida(): Promise<SuspendedTxDialog> {
    await this.clickCustom(this.recuperarSuspendidaBtn);
    const dialog = new SuspendedTxDialog(this.page);
    await dialog.esperarVisible();
    return dialog;
  }

  async abrirRecuperarSuspendidaRaw(): Promise<SuspendedTxDialog> {
    await this.clickCustom(this.recuperarSuspendidaBtn);
    await this.page.waitForTimeout(2_500);
    return new SuspendedTxDialog(this.page);
  }

  /* ============================================================================
   * Diálogo "Cargar factura" (lupa)
   * ==========================================================================*/

  async abrirCargarFactura(): Promise<CargarFacturaDialog> {
    await this.clickCustom(this.abrirCargarFacturaBtn);
    const dialog = new CargarFacturaDialog(this.page);
    await dialog.esperarVisible();
    return dialog;
  }

  async cancelar(): Promise<void> {
    // Las máscaras residuales (modal "Recuperar..." o panel de productos)
    // interceptan incluso con force. JS click bypasa el pointer system.
    await this.cancelarBtn.first().evaluate((el: HTMLElement) => el.click());
  }
}
