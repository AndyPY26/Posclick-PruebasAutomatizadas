import { Page } from '@playwright/test';
import { SupervisorAuthDialog } from './SupervisorAuthDialog';

/**
 * Pantalla "Apertura de Caja" (/pos-ui/box-opening).
 *
 * Flujo completo (verificado contra el DOM real):
 *  1. Si hay pagos huérfanos de una transacción anterior: aparece modal
 *     "Pagos pendientes sin facturar" → clickear "Reversar" + auth supervisor.
 *  2. Si la caja de un día previo no fue entregada: aparece modal "Entregas
 *     de caja pendientes" con botón "Ir a entrega de caja" — navegar a
 *     /box-delivery y procesar la entrega con auth supervisor.
 *  3. Botón "Aperturar caja" → `POST /api/pos/v1/open` → 204 → caja abierta.
 */
export class BoxOpeningPage {
  constructor(private readonly page: Page) {}

  private readonly aperturarBtn = this.page.locator('button:has-text("Aperturar caja")');
  private readonly reversarBtn = this.page.locator('button:has-text("Reversar")');
  private readonly irEntregaBtn = this.page.locator('button:has-text("Ir a entrega de caja")');
  private readonly procesarBtn = this.page.locator('button:has-text("Procesar")');

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/box-opening/, { timeout: 30_000 });
    await this.aperturarBtn.waitFor({ state: 'visible', timeout: 20_000 });
  }

  /** Neutraliza visualmente máscaras y wrappers que capturen pointer events. */
  private async neutralizarOverlays(): Promise<void> {
    await this.page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>(
          '.p-dialog-mask, .p-overlay-mask, lib-pending-orphan-payments, #loader-custom-overlay',
        )
        .forEach((el) => (el.style.pointerEvents = 'none'));
    });
  }

  /**
   * Si hay modal "Pagos pendientes sin facturar", reversa los pagos huérfanos.
   * Sin esto, el backend rechaza /pos/v1/open con 400 "Caja tiene transacciones
   * en la fecha X y no ha sido entregada".
   */
  private async autorizarSupervisorSiAplica(): Promise<void> {
    const auth = new SupervisorAuthDialog(this.page);
    if (await auth.modal.isVisible().catch(() => false)) {
      await auth.autorizar();
    }
  }

  private async reversarPagosHuerfanosSiAplica(): Promise<void> {
    const modal = this.page.locator('text=Pagos pendientes sin facturar');
    if (!(await modal.isVisible().catch(() => false))) return;
    await this.reversarBtn
      .first()
      .evaluate((el: HTMLElement) => el.click())
      .catch(async () => this.reversarBtn.first().click({ force: true }));
    await this.page.waitForTimeout(3_000);
    await this.autorizarSupervisorSiAplica();
    await this.page.waitForTimeout(5_000);
  }

  /**
   * Si el backend reporta entregas pendientes de un día anterior, procesarlas
   * ahora. Se dispara desde el modal "Entregas de caja pendientes" que
   * aparece en /box-opening cuando la caja no fue cerrada el día anterior.
   */
  private async procesarEntregaPendienteSiAplica(): Promise<void> {
    if (!(await this.irEntregaBtn.isVisible().catch(() => false))) return;
    await this.irEntregaBtn
      .evaluate((el: HTMLElement) => el.click())
      .catch(async () => this.irEntregaBtn.click({ force: true }));
    await this.page.waitForURL(/box-delivery/, { timeout: 30_000 });
    await this.page.waitForTimeout(5_000);
    // Neutralizar overlays residuales en /box-delivery (modal Sincronización,
    // avisos, loaders) antes de clickear Procesar.
    await this.page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>(
          '.p-dialog-mask, .p-overlay-mask, lib-pending-orphan-payments, #loader-custom-overlay',
        )
        .forEach((el) => (el.style.pointerEvents = 'none'));
    });
    await this.procesarBtn
      .first()
      .evaluate((el: HTMLElement) => el.click())
      .catch(async () => this.procesarBtn.first().click({ force: true }));
    await this.page.waitForTimeout(3_000);
    await this.autorizarSupervisorSiAplica();
    await this.page.waitForTimeout(10_000);
    // Volver a /box-opening para intentar la apertura.
    await this.page.goto('/pos-ui/box-opening', { waitUntil: 'networkidle' });
    await this.aperturarBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await this.neutralizarOverlays();
  }

  /**
   * Click "Aperturar caja" y espera que el backend confirme con 204.
   *
   * El primer click después de llegar a /box-opening a veces no dispara la
   * petición HTTP (Angular aún binde-ando handlers). Reintentamos hasta ver
   * la respuesta real del backend o acabar los intentos.
   */
  async aperturarCaja(): Promise<boolean> {
    await this.neutralizarOverlays();
    await this.reversarPagosHuerfanosSiAplica();
    await this.procesarEntregaPendienteSiAplica();
    // Esperar a que el botón esté estable (Angular bindeado).
    await this.page.waitForTimeout(2_000);

    for (let i = 0; i < 3; i++) {
      const respPromise = this.page
        .waitForResponse(
          (r) =>
            /\/api\/pos\/v1\/open$/.test(r.url()) && r.request().method() === 'POST',
          { timeout: 10_000 },
        )
        .catch(() => null);

      await this.aperturarBtn
        .evaluate((el: HTMLElement) => el.click())
        .catch(async () => this.aperturarBtn.click({ force: true }));

      const resp = await respPromise;
      if (resp && resp.status() === 204) {
        await this.page.waitForTimeout(5_000);
        return true;
      }
      await this.page.waitForTimeout(2_500);
    }
    return false;
  }
}
