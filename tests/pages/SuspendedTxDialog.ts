import { Page, expect } from '@playwright/test';

/**
 * Modal "Transacciones suspendidas" (FE 1.13.0).
 *
 * Cada fila tiene `input[type=radio][name="selectedTransaction"]` + Cliente,
 * Cantidad de productos y Valor total. Sin suspendidas: "No se encontraron datos".
 * La tabla carga DESPUÉS del título: contar radios apenas aparece el título da 0
 * (y "Recuperar" sin selección no recupera nada).
 */
export class SuspendedTxDialog {
  constructor(private readonly page: Page) {}

  // Acotado al p-dialog: el aviso "No se encontraron transacciones suspendidas
  // para el usuario" también contiene el texto y confundía al locator genérico.
  readonly modal = this.page.locator('.p-dialog').filter({ hasText: 'Transacciones suspendidas' }).first();
  readonly sinDatos = this.page.locator(
    'text=/No se encontraron datos|No hay datos|Sin registros|No se han encontrado/i',
  );
  readonly sinPendientes = this.page.locator(
    'text=/No se encontraron transacciones suspendidas|No hay transacciones suspendidas|Sin transacciones suspendidas/i',
  );
  private readonly radios = this.page.locator('input[type=radio][name="selectedTransaction"]');
  private readonly recuperarBtn = this.page.locator(
    '[id="mf_sale_recover-suspended-sales-transactions_accept_button"] button, button:has-text("Recuperar")',
  );

  /** Espera el título y que la tabla termine de cargar (filas o "sin datos"). */
  async esperarVisible(timeout = 15_000): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout });
    await this.radios
      .first()
      .or(this.sinDatos.first())
      .waitFor({ state: 'visible', timeout })
      .catch(() => undefined);
    await this.page.waitForTimeout(500);
  }

  async seleccionarPrimera(): Promise<void> {
    await this.radios.first().evaluate((el: HTMLElement) => el.click());
  }

  async recuperar(): Promise<void> {
    await this.recuperarBtn.first().evaluate((el: HTMLElement) => el.click());
    await this.page.waitForTimeout(3_500);
  }

  async contarTransacciones(): Promise<number> {
    await this.esperarVisible();
    return this.radios.count();
  }

  /** Verificación semántica: no hay transacciones suspendidas (0 radios). */
  async esperarSinTransacciones(timeout = 15_000): Promise<void> {
    await this.esperarVisible(timeout);
    const count = await this.radios.count();
    if (count > 0) {
      throw new Error(
        `Se esperaban 0 transacciones suspendidas pero hay ${count} radios en el modal.`,
      );
    }
  }
}
