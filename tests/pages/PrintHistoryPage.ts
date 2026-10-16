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
  /**
   * FE 1.13.0: "No hay documentos para imprimir" es un aviso efímero (dura
   * pocos segundos tras la autorización). Se escucha mientras se autoriza y se
   * guarda aquí si llegó a aparecer.
   */
  sinDocumentosVisto = false;

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
    const aviso = this.sinDocumentos
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const auth = new SupervisorAuthDialog(this.page);
    await auth.autorizar();
    this.sinDocumentosVisto = await aviso;
  }
}
