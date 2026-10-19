import { Page, expect } from '@playwright/test';
import { CREDENCIALES } from '../fixtures/dataset';

/**
 * Modal "Autorización de Administrador".
 *
 * Detalles descubiertos en reconocimiento:
 *  - El input visible es `readonly`; hay que escribir en el input REAL oculto.
 *  - La trama necesita el prefijo `%` y un salto de línea final, más Enter.
 *    Sin el `%` la app responde "Formulario incompleto: cardNumber, frameData".
 */
export class SupervisorAuthDialog {
  constructor(private readonly page: Page) {}

  readonly modal = this.page.locator('text=Autorización de Administrador');
  private readonly inputTarjeta = this.page.locator('#admin_authorization_card_scan_input');
  private readonly inputClave = this.page.locator('#admin_authorization_pass_input');
  readonly confirmar = this.page.locator('button:has-text("Confirmar")');

  async esperarVisible(timeout = 20_000): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout });
  }

  /** Inyecta trama + clave y confirma. */
  async autorizar(): Promise<void> {
    await this.inputTarjeta.waitFor({ state: 'attached', timeout: 25_000 });
    await this.inputTarjeta.fill(`${CREDENCIALES.supervisor.trama}\n`);
    await this.inputTarjeta.press('Enter');
    await this.page.waitForTimeout(1_000);
    await this.inputClave.fill(CREDENCIALES.supervisor.clave);
    await this.page.waitForTimeout(300);
    // Si un lib-custom-modal (ej. "Entregas de caja pendientes") quedó encima,
    // ciérralo primero: su único botón de acción reinyecta la vista y lo cierra.
    const avisoBtn = this.page.locator('lib-custom-modal button').first();
    if (await avisoBtn.isVisible().catch(() => false)) {
      await avisoBtn.click().catch(() => undefined);
      await this.page.waitForTimeout(1_000);
    }
    // force: fallback por si la overlay de PrimeNG aún intercepta pointer events.
    await this.confirmar.first().click({ force: true });
    await this.page.waitForTimeout(3_000);
  }
}
