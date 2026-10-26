import { Page, Locator } from '@playwright/test';
import { InvoicePage } from './InvoicePage';
import { BoxDeliveryPage } from './BoxDeliveryPage';
import { BoxOpeningPage } from './BoxOpeningPage';
import { PrintHistoryPage } from './PrintHistoryPage';

/**
 * Dashboard / landing (/).
 *
 * El orden de las tarjetas corresponde a POSCLICK 1.12.0-rc.1 (15 módulos).
 * Mapeado contra el DOM real (scrape 2026-10-13):
 *   nth=0 → Facturación
 *   nth=3 → Entrega de Caja
 *   nth=4 → Historial de impresión
 *   nth=8 → Apertura de Caja
 */
export class DashboardPage {
  constructor(private readonly page: Page) {}

  private readonly irFacturacion = this.page.locator('button:has-text("IR")').nth(0);
  private readonly irEntregaCaja = this.page.locator('button:has-text("IR")').nth(3);
  private readonly irHistorialImpresion = this.page.locator('button:has-text("IR")').nth(4);
  private readonly irAperturaCaja = this.page.locator('button:has-text("IR")').nth(8);

  async goto(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(3_000);
    await this.irFacturacion.waitFor({ state: 'visible', timeout: 30_000 });
    // Modales accesorios (p.ej. lib-pending-orphan-payments) pueden quedar
    // sobre el dashboard y interceptar los clicks a las tarjetas IR.
    await this.page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>(
          '.p-dialog-mask, .p-overlay-mask, lib-pending-orphan-payments, #loader-custom-overlay',
        )
        .forEach((el) => (el.style.pointerEvents = 'none'));
    });
  }

  async irAFacturacion(): Promise<InvoicePage> {
    await this.jsClick(this.irFacturacion);
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

  async irAAperturaCaja(): Promise<BoxOpeningPage> {
    await this.irAperturaCaja.click();
    const bo = new BoxOpeningPage(this.page);
    await bo.esperarCargada();
    return bo;
  }

  /** Verifica rápido si Facturación navega — señal de caja abierta. */
  private async puedeFacturar(): Promise<boolean> {
    await this.irFacturacion.click();
    await this.page.waitForTimeout(4_000);
    return this.page.url().includes('/pos-ui/invoice');
  }

  /**
   * PRECONDICIÓN: deja la caja abierta y lista para facturar.
   *
   * Flujo:
   *  1. Si Facturación ya navega a `/pos-ui/invoice`, no hace nada.
   *  2. Si no, va a Apertura de Caja y clickea "Aperturar caja"
   *     (POST /pos/v1/open → 204).
   *  3. Reintenta hasta 3 veces porque la caja puede quedar en
   *     estados intermedios (Angular guard tarda en refrescar).
   */
  /** Click directo vía JS evaluate — evita cualquier overlay interceptor. */
  private async jsClick(locator: Locator): Promise<void> {
    await locator.evaluate((el: HTMLElement) => el.click());
  }

  /**
   * Click DOM en el primer <button> visible cuyo texto matchee. Necesario porque
   * `goto()` pone pointer-events:none en las máscaras de dialog (y eso se hereda
   * a los botones del modal), así que un click de mouse no llega.
   */
  private async clickPorTexto(patron: RegExp): Promise<boolean> {
    return this.page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => re.test((b.textContent || '').trim()) && b.getBoundingClientRect().width > 0,
      );
      btn?.click();
      return !!btn;
    }, patron.source);
  }

  /**
   * Resuelve los modales que bloquean Facturación/Apertura y que deja una
   * corrida abortada:
   *  - "Entregas de caja pendientes" → procesar la entrega con auth supervisor.
   *  - "Factura en curso" → ir al carrito y vaciarlo.
   */
  private async resolverBloqueos(): Promise<void> {
    await this.page.waitForTimeout(1_500);

    if (await this.clickPorTexto(/Ir a entrega de caja/)) {
      console.log('[Dashboard] modal "Entregas de caja pendientes" → procesando entrega');
      const box = new BoxDeliveryPage(this.page);
      await box.esperarCargada();
      await box.procesarYAutorizar();
      await this.goto();
    }

    if (await this.clickPorTexto(/Ir a Facturaci[oó]n/)) {
      console.log('[Dashboard] modal "Factura en curso" → vaciando carrito abandonado');
      await this.page.waitForURL(/pos-ui\/(invoice|pay)/, { timeout: 30_000 });
      await this.page.waitForTimeout(3_000);
      if (this.page.url().includes('/pos-ui/pay')) {
        // Volver de /pay al carrito con "Regresar" del summary panel.
        await this.page
          .locator('[id="button_actions.return"]')
          .evaluate((el: HTMLElement) => {
            const b = el.tagName === 'BUTTON' ? el : (el.querySelector('button') as HTMLElement | null);
            b?.click();
          })
          .catch(() => undefined);
        await this.page.waitForURL(/pos-ui\/invoice/, { timeout: 30_000 }).catch(() => undefined);
        await this.page.waitForTimeout(2_000);
      }
      await new InvoicePage(this.page).vaciar();
      await this.goto();
    }
  }

  async asegurarCajaAbierta(): Promise<void> {
    for (let intento = 0; intento < 5; intento++) {
      await this.goto();
      await this.resolverBloqueos();
      await this.jsClick(this.irFacturacion);
      await this.page.waitForTimeout(5_000);
      if (this.page.url().includes('/pos-ui/invoice')) {
        await this.goto();
        return;
      }
      console.log(
        `[Dashboard] intento ${intento + 1}: Facturación no abrió (url=${this.page.url()}) → Apertura de Caja`,
      );

      await this.goto();
      await this.jsClick(this.irAperturaCaja);
      // El modal "Factura en curso" aparece al intentar entrar a otro módulo.
      await this.resolverBloqueos();
      if (!this.page.url().includes('box-opening')) {
        await this.jsClick(this.irAperturaCaja);
      }
      const apertura = new BoxOpeningPage(this.page);
      await apertura.esperarCargada();
      await apertura.aperturarCaja();
      if (apertura.ultimoRechazo && /no ha sido entregada/i.test(apertura.ultimoRechazo)) {
        // En 1.13.0 el FE mostraba "Entregas de caja pendientes" y resolverBloqueos()
        // la procesaba. En FE pbd-9-sync-develop no aparece porque
        // GET /pos/v1/daily-deposit-status responde 500 y la pantalla de Entrega
        // queda sin fecha: no se procesa a ciegas.
        throw new Error(
          `El POS rechazó la apertura de caja: "${apertura.ultimoRechazo}". ` +
            'Procesa esa entrega de caja (módulo Entrega de Caja + autorización de supervisor) y vuelve a correr la suite.',
        );
      }
    }
    throw new Error(
      'Caja no quedó abierta tras 5 intentos de Apertura. ' +
        'Verifica manualmente el estado del POS.',
    );
  }

  /** Centro que muestra el encabezado del POS ("CENTRO 004-150" → "004-150"). */
  async leerCentro(): Promise<string | null> {
    const texto = await this.page
      .getByText(/CENTRO\s+\d{3}-\d{3}/)
      .first()
      .innerText({ timeout: 15_000 })
      .catch(() => '');
    return texto.match(/\d{3}-\d{3}/)?.[0] ?? null;
  }
}
