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
  private readonly buscarSku = this.page.locator('input[placeholder="Buscar producto por SKU"]');
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
  private readonly cancelarBtn = this.page.locator('button:has-text("Cancelar")');
  private readonly confirmarEliminarBtn = this.page.locator('button:has-text("Sí, eliminar")');
  private readonly continuarBtn = this.page.locator('button:has-text("Continuar")');

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
    await this.continuarBtn.first().click();
    const pay = new PaymentPage(this.page);
    await pay.esperarCargada();
    return pay;
  }

  /** Entrega futura: selecciona todo + autoriza supervisor + navega a /delivery. */
  async irAEntregaFuturaConAutorizacion(): Promise<DeliveryPage> {
    await this.checkboxTodos.first().click();
    await this.entregaFuturaBtn.click();
    const auth = new SupervisorAuthDialog(this.page);
    await auth.autorizar();
    const delivery = new DeliveryPage(this.page);
    await delivery.esperarCargada();
    return delivery;
  }

  /** Variante que NO autoriza: útil para validar que el modal aparece (Caso 4). */
  async abrirEntregaFutura(): Promise<SupervisorAuthDialog> {
    await this.checkboxTodos.first().click();
    await this.entregaFuturaBtn.click();
    return new SupervisorAuthDialog(this.page);
  }

  /* ============================================================================
   * Carrito
   * ==========================================================================*/

  cantidadInputLocator(sku: string): Locator {
    return this.page.locator(`#mf_sale_product_list_table_quantity_${sku} input`);
  }

  /** Carga items resolviendo la "Info adicional" (IMEI) cuando el SKU la exige. */
  async cargarCarrito(items: ItemCarrito[]): Promise<void> {
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

      if (cantidad > 1) {
        const input = this.cantidadInputLocator(sku);
        await input.fill(String(cantidad));
        await input.press('Tab');
        await this.page.waitForTimeout(600);
      }
    }
  }

  /** Vacía el carrito en curso (Cancelar → "Sí, eliminar"). Idempotente. */
  async vaciar(): Promise<void> {
    const cancelar = this.cancelarBtn.last();
    if (!(await cancelar.isVisible().catch(() => false))) return;
    await cancelar.click();
    await this.page.waitForTimeout(1_200);
    await this.confirmarEliminarBtn.first().click().catch(() => undefined);
    await this.page.waitForTimeout(2_500);
  }

  /* ============================================================================
   * Suspensión / recuperación
   * ==========================================================================*/

  /** Lanza el diálogo de suspensión. NO pide supervisor. */
  async suspender(): Promise<void> {
    await this.suspenderBtn.click();
    await expect(this.dialogoSuspender).toBeVisible();
    await this.confirmarSuspension.first().click();
    await this.page.waitForTimeout(3_000);
    await expect(this.carritoVacio).toBeVisible();
  }

  /** El botón de suspender está deshabilitado cuando ya hay una suspendida. */
  async esperarSuspenderDeshabilitado(): Promise<void> {
    await expect(this.page.locator('#mf_sale_product_list_table_suspended_sales_transaction button')).toBeDisabled();
  }

  async abrirRecuperarSuspendida(): Promise<SuspendedTxDialog> {
    await this.recuperarSuspendidaBtn.click();
    const dialog = new SuspendedTxDialog(this.page);
    await dialog.esperarVisible();
    return dialog;
  }

  async abrirRecuperarSuspendidaRaw(): Promise<SuspendedTxDialog> {
    await this.recuperarSuspendidaBtn.click();
    await this.page.waitForTimeout(2_500);
    return new SuspendedTxDialog(this.page);
  }

  /* ============================================================================
   * Diálogo "Cargar factura" (lupa)
   * ==========================================================================*/

  async abrirCargarFactura(): Promise<CargarFacturaDialog> {
    await this.abrirCargarFacturaBtn.click();
    const dialog = new CargarFacturaDialog(this.page);
    await dialog.esperarVisible();
    return dialog;
  }

  async cancelar(): Promise<void> {
    await this.cancelarBtn.first().click();
  }
}
