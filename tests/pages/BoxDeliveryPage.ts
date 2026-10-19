import { Page } from '@playwright/test';
import { SupervisorAuthDialog } from './SupervisorAuthDialog';

/**
 * Pantalla "Entrega de caja" (/pos-ui/box-delivery).
 *
 * Selectores verificados contra el DOM real (scrape 2026-10-13):
 *  - Form IDs con prefijo `mf_posop_box_delivery_*`
 *  - Modal éxito: `#mf_posop_box_delivery_success_modal`
 */
export class BoxDeliveryPage {
  constructor(private readonly page: Page) {}

  // Form read-only con datos de contexto
  readonly inputLugar = this.page.locator('#mf_posop_box_delivery_place');
  readonly inputCaja = this.page.locator('#mf_posop_box_delivery_box');
  readonly inputFecha = this.page.locator('#mf_posop_box_delivery_date');
  readonly inputCajero = this.page.locator('#mf_posop_box_delivery_cashierName');
  readonly inputCodigoCajero = this.page.locator('#mf_posop_box_delivery_cashier_code');

  private readonly procesarBtn = this.page.locator('button:has-text("Procesar")');
  readonly exitoModal = this.page.locator('#mf_posop_box_delivery_success_modal');
  readonly exito = this.exitoModal; // alias retro-compat

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/box-delivery/, { timeout: 30_000 });
    await this.inputCaja.waitFor({ state: 'attached', timeout: 20_000 });
  }

  /** Procesa la entrega; dispara autorización de supervisor. */
  async procesarYAutorizar(): Promise<void> {
    await this.procesarBtn.first().click();
    const auth = new SupervisorAuthDialog(this.page);
    await auth.autorizar();
    await this.page.waitForTimeout(5_000);
  }
}
