import { Page, expect } from '@playwright/test';

/**
 * Diálogo "Cargar factura" (lupa junto al buscador de SKU).
 *
 * Tiene dos pestañas: *Post Venta* y *Oferta Especial*. Ofertas Especiales NO
 * es un módulo del dashboard: se accede desde aquí.
 */
export class CargarFacturaDialog {
  constructor(private readonly page: Page) {}

  readonly dialogo = this.page.locator('text=Cargar factura');
  private readonly tabOfertaEspecial = this.page.locator('text=Oferta Especial');
  private readonly tabPostVenta = this.page.locator('text=Post Venta');
  private readonly numeroAutorizacion = this.page.locator('input[placeholder="Ej: 123456"]');
  private readonly numeroDocumento = this.page.locator('input[placeholder="Ej: 1234567890"]');
  private readonly buscarBtn = this.page.locator('button:has-text("Buscar")');

  async esperarVisible(timeout = 15_000): Promise<void> {
    await expect(this.dialogo).toBeVisible({ timeout });
  }

  async cargarOfertaEspecial(cupon: string, documento: string): Promise<void> {
    await this.tabOfertaEspecial.first().click();
    await this.page.waitForTimeout(1_500);
    await this.numeroAutorizacion.fill(cupon);
    await this.numeroDocumento.fill(documento);
    await this.buscarBtn.first().click();
    await this.page.waitForTimeout(4_000);
  }

  /** Título que confirma que la proforma se cargó al carrito. */
  tituloProforma(autorizacion: string) {
    return this.page.locator(`text=Factura Proforma (Oferta Especial) ${autorizacion}`);
  }
}
