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
  private readonly buscarTienda = this.page.locator('input[placeholder="Buscar tienda"]');
  private readonly abrirCalendario = this.page.locator('button[aria-label="Elige fecha"]');
  private readonly diaHabilitado = this.page.locator('span.p-datepicker-day:not(.p-disabled)');
  private readonly telefono = this.page.locator('input[placeholder="09xxxxxxxx"]');
  private readonly continuarBtn = this.page.locator('button:has-text("Continuar")');

  readonly persona = new PersonSearchComponent(this.page);

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/pos-ui\/delivery/, { timeout: 60_000 });
  }

  cantidadProductoLocator(sku: string): Locator {
    return this.page.locator(
      `input#mf_sale_delivery_product_list_table_quantity_delivery_input_${sku}`,
    );
  }

  async setTelefono(numero: string): Promise<void> {
    await this.telefono.fill(numero);
  }

  async esperarEnvioAContiene(texto: string): Promise<void> {
    await expect(this.envioA).toContainText(texto);
  }

  /**
   * Configura la entrega mínima (producto por tienda + fecha + teléfono) para
   * los items del carrito. Permite volver al flujo de facturación.
   */
  async configurarEntregaMinima(carrito: ItemCarrito[]): Promise<void> {
    for (const { sku, cantidad } of carrito) {
      await this.page.locator(`text=${sku}`).first().click().catch(() => undefined);
      await this.page.waitForTimeout(1_200);
      await this.cantidadProductoLocator(sku)
        .fill(String(cantidad))
        .catch(() => undefined);
      await this.buscarTienda.fill('');
      await this.page.waitForTimeout(1_500);
      const tienda = this.page.locator('tbody tr input[role=spinbutton]').first();
      await tienda.fill(String(cantidad));
      await tienda.press('Tab');
      await this.page.waitForTimeout(1_500);
    }
    await this.abrirCalendario.click();
    await this.page.waitForTimeout(1_200);
    await this.diaHabilitado.last().click();
    await this.page.keyboard.press('Escape');
    await this.telefono.fill('0991234567');
    await this.page.waitForTimeout(1_000);
  }

  /** Continuar → vuelve al carrito (/pos-ui/invoice). */
  async continuar(): Promise<void> {
    await this.continuarBtn.first().click();
    await this.page.waitForURL(/pos-ui\/invoice/, { timeout: 30_000 });
  }
}
