import { Page } from '@playwright/test';
import { SupervisorAuthDialog } from './SupervisorAuthDialog';

/** Pantalla "Historial de impresión" (/print-history). */
export class PrintHistoryPage {
  constructor(private readonly page: Page) {}

  private readonly filaFactura = this.page.locator('tr:has-text("FACTURA") input[type=radio]');
  private readonly filaVoucher = this.page.locator(
    'tr:has-text("ENTREGA MERCADERIA") input[type=radio]',
  );
  private readonly imprimirBtn = this.page.locator('button:has-text("Imprimir")');

  readonly sinDocumentos = this.page.locator('text=No hay documentos para imprimir');
  readonly impresoraNoEncontrada = this.page.locator('text=Impresora no encontrada');

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/print-history/, { timeout: 30_000 });
  }

  async seleccionarVoucher(): Promise<void> {
    await this.filaVoucher.first().click();
  }

  async seleccionarFactura(): Promise<void> {
    await this.filaFactura.first().click();
  }

  async imprimirConAutorizacion(): Promise<void> {
    await this.imprimirBtn.click();
    const auth = new SupervisorAuthDialog(this.page);
    await auth.autorizar();
    await this.page.waitForTimeout(4_000);
  }
}
