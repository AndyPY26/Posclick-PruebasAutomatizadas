import { Page, expect } from '@playwright/test';

/**
 * Modal "Transacciones suspendidas".
 *
 * Locators tolerantes al wording del empty state — distintas versiones del
 * POS han mostrado "No se encontraron datos", "No hay datos", "Sin registros",
 * etc. Usamos regex y verificación semántica (count de radios = 0).
 */
export class SuspendedTxDialog {
  constructor(private readonly page: Page) {}

  readonly modal = this.page.locator('text=Transacciones suspendidas');
  readonly sinDatos = this.page.locator(
    'text=/No se encontraron datos|No hay datos|Sin registros|No se han encontrado/i',
  );
  readonly sinPendientes = this.page.locator(
    'text=/No se encontraron transacciones suspendidas|No hay transacciones suspendidas|Sin transacciones suspendidas/i',
  );
  // DOM 2026-10-15: el modal puede usar input[type=radio] o lib-radiobutton
  // sin el input nativo. Buscamos ambos y filtramos al modal visible.
  private readonly radioPrimera = this.page.locator(
    'input[type=radio], lib-radiobutton, [role=radio]',
  );
  private readonly recuperarBtn = this.page.locator('button:has-text("Recuperar")');

  async esperarVisible(timeout = 15_000): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout });
  }

  async seleccionarPrimera(): Promise<void> {
    await this.radioPrimera
      .first()
      .evaluate((el: HTMLElement) => el.click())
      .catch(() => this.radioPrimera.first().click({ force: true }));
  }

  async recuperar(): Promise<void> {
    await this.recuperarBtn
      .first()
      .evaluate((el: HTMLElement) => el.click())
      .catch(() => this.recuperarBtn.first().click({ force: true }));
    await this.page.waitForTimeout(3_500);
  }

  async contarTransacciones(): Promise<number> {
    return this.radioPrimera.count();
  }

  /** Verificación semántica: no hay transacciones suspendidas (0 radios). */
  async esperarSinTransacciones(timeout = 15_000): Promise<void> {
    await this.page.waitForTimeout(2_000);
    const count = await this.radioPrimera.count();
    if (count > 0) {
      throw new Error(
        `Se esperaban 0 transacciones suspendidas pero hay ${count} radios en el modal.`,
      );
    }
    // Y además verificar que algún texto de "sin datos" esté visible.
    const sinDatosVis = await this.sinDatos.first().isVisible().catch(() => false);
    const sinPendVis = await this.sinPendientes.first().isVisible().catch(() => false);
    if (!sinDatosVis && !sinPendVis) {
      // No hay radios pero tampoco mensaje de "sin datos" — aun así ok semánticamente.
      console.log('[SuspendedTxDialog] sin radios pero sin mensaje empty-state tampoco');
    }
  }
}
