import { Page } from '@playwright/test';
import { SupervisorAuthDialog } from './SupervisorAuthDialog';

/** Pantalla "Entrega de caja" (/box-delivery). */
export class BoxDeliveryPage {
  constructor(private readonly page: Page) {}

  private readonly procesarBtn = this.page.locator('button:has-text("Procesar")');
  readonly exito = this.page.locator('text=/fue entregada con éxito/i');

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/box-delivery/, { timeout: 30_000 });
  }

  /** Procesa la entrega; dispara autorización de supervisor. */
  async procesarYAutorizar(): Promise<void> {
    await this.procesarBtn.first().click();
    const auth = new SupervisorAuthDialog(this.page);
    await auth.autorizar();
    await this.page.waitForTimeout(5_000);
  }
}
