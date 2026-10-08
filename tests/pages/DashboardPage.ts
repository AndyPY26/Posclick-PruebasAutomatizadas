import { Page } from '@playwright/test';
import { InvoicePage } from './InvoicePage';
import { BoxDeliveryPage } from './BoxDeliveryPage';
import { PrintHistoryPage } from './PrintHistoryPage';
import { SupervisorAuthDialog } from './SupervisorAuthDialog';
import { cerrarDialogos } from '../fixtures/dataset';

/**
 * Dashboard / landing (/).
 *
 * El orden de las tarjetas corresponde a POSCLICK 1.12.0-rc.1 (15 módulos):
 *   nth=0 → Facturación, nth=3 → Entrega de caja, nth=4 → Historial de impresión.
 */
export class DashboardPage {
  constructor(private readonly page: Page) {}

  private readonly irFacturacion = this.page.locator('text=IR >> nth=0');
  private readonly irEntregaCaja = this.page.locator('text=IR >> nth=3');
  private readonly irHistorialImpresion = this.page.locator('text=IR >> nth=4');
  readonly accesoDenegadoEntregas = this.page.locator('text=/entregas de caja pendientes/i');

  async goto(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'load' });
    await this.page.waitForTimeout(3_000);
  }

  async irAFacturacion(): Promise<InvoicePage> {
    await this.irFacturacion.click();
    const invoice = new InvoicePage(this.page);
    await invoice.esperarCargada();
    return invoice;
  }

  async irAEntregaCaja(): Promise<BoxDeliveryPage> {
    await this.irEntregaCaja.click();
    const box = new BoxDeliveryPage(this.page);
    await box.esperarCargada();
    return box;
  }

  async irAHistorialImpresion(): Promise<PrintHistoryPage> {
    await this.irHistorialImpresion.click();
    const hist = new PrintHistoryPage(this.page);
    await hist.esperarCargada();
    return hist;
  }

  /**
   * PRECONDICIÓN CRÍTICA: con entregas de caja pendientes, Facturación
   * responde "Acceso denegado". Libera la caja antes de cualquier venta.
   * Es idempotente: si no hay nada pendiente, no hace nada.
   */
  async liberarEntregasCajaPendientes(): Promise<void> {
    for (let intento = 0; intento < 5; intento++) {
      await this.goto();
      await this.irFacturacion.click();
      await this.page.waitForTimeout(3_000);

      if (this.page.url().includes('/pos-ui/invoice')) return; // caja limpia

      // Bloqueado → procesar la entrega de caja pendiente.
      await this.goto();
      await this.irEntregaCaja.click();
      await this.page.waitForURL(/box-delivery/, { timeout: 30_000 });
      await this.page.locator('button:has-text("Procesar")').first().click();
      const auth = new SupervisorAuthDialog(this.page);
      await auth.autorizar();
      await this.page.waitForTimeout(5_000);
      await cerrarDialogos(this.page);
    }
    throw new Error('No se pudo liberar la caja tras 5 intentos');
  }
}
