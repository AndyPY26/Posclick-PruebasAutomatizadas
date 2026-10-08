import { Page, expect } from '@playwright/test';

/** Modal "Transacciones suspendidas". */
export class SuspendedTxDialog {
  constructor(private readonly page: Page) {}

  readonly modal = this.page.locator('text=Transacciones suspendidas');
  readonly sinDatos = this.page.locator('text=No se encontraron datos');
  readonly sinPendientes = this.page.locator(
    'text=/No se encontraron transacciones suspendidas/i',
  );
  private readonly radioPrimera = this.page.locator('input[type=radio]');
  private readonly recuperarBtn = this.page.locator('button:has-text("Recuperar")');

  async esperarVisible(timeout = 15_000): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout });
  }

  async seleccionarPrimera(): Promise<void> {
    await this.radioPrimera.first().click();
  }

  async recuperar(): Promise<void> {
    await this.recuperarBtn.first().click();
    await this.page.waitForTimeout(3_500);
  }
}
