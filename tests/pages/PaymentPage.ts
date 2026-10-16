import { Page, Locator, expect } from '@playwright/test';
import { seleccionarEnDropdown, montoDe } from '../fixtures/dataset';

/**
 * Pantalla de cobro (/pos-ui/pay).
 *
 * Contiene el flujo de pago en efectivo y un sub-componente `CreditoPyccaForm`
 * para pagos a crédito directo PYCCA.
 */
export class PaymentPage {
  constructor(private readonly page: Page) {}

  readonly efectivo = this.page.locator('text=EFECTIVO');
  readonly creditoPycca = this.page.locator('text=CREDITO PYCCA');
  readonly transaccionFinalizada = this.page.locator('text=Transacción finalizada');
  readonly modalRegalo = this.page.locator('text=Seleccionar regalo');
  readonly valorTotalRow = this.page.locator('text=Valor total').locator('..');
  // Input "Valor a pagar" en /pos-ui/pay.
  // DOM 2026-10-15: #valueToPay es el wrapper <p-inputnumber>, no un <input>.
  // El <input> real vive adentro (sin id) y el placeholder "$ 0.00" lo identifica.
  readonly inputPrincipal = this.page
    .locator('#valueToPay input, input[placeholder="$ 0.00"]')
    .first();

  // IDs reales descubiertos vía scrape DOM (v2026-10): el botón "Agregar"
  // y los "Continuar/Procesar" tienen IDs estables que no requieren
  // ambiguos text matchers.
  private readonly agregarBtn = this.page.locator('#button_agregar').first();
  // DOM 2026-10-15: en /pos-ui/pay hay DOS botones "Continuar" (el del header
  // está disabled). El summary panel usa un <lib-button id="button_actions.continue">
  // con un botón interno; el id está escapado porque contiene punto literal.
  private readonly continuarBtn = this.page.locator('[id="button_actions.continue"]').first();
  // El botón "Procesar" vive dentro del modal "Procesando Pago" (p-dialog con
  // clase p-button-success). Usar `button.p-button-success:has-text("Procesar")`
  // apunta al <button> real que dispara el handler Angular.
  private readonly procesarBtn = this.page
    .locator('button.p-button-success:has-text("Procesar"), button:has-text("Procesar")')
    .first();
  private readonly aceptarDialogo = this.page.locator('p-dialog button:has-text("Aceptar")');
  // Modal "Registro de pago en efectivo" (FE 1.13.0).
  private readonly pagarMontoInput = this.page.locator('input#paymentAmount');
  private readonly recibidoInput = this.page.locator('input#receivedAmount');
  private readonly aceptarRegistroEfectivoBtn = this.page.locator('[id="button_actions.accept"]').last();

  readonly credito = new CreditoPyccaForm(this.page);

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/pos-ui\/pay/, { timeout: 30_000 });
    // El modal "Pagos pendientes sin facturar" puede aparecer también en /pay
    // tras llegar con estado dirty de ejecuciones anteriores.
    const pagosPend = this.page.locator('text=Pagos pendientes sin facturar');
    if (await pagosPend.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // "Ahora no" es menos invasivo que "Reversar" (que requiere auth).
      const ahoraNo = this.page.locator('button:has-text("Ahora no")');
      if (await ahoraNo.isVisible().catch(() => false)) {
        await ahoraNo.first().evaluate((el: HTMLElement) => el.click()).catch(() => {});
        await this.page.waitForTimeout(2_000);
      }
    }
  }

  /** Click en el <button> real de un wrapper lib-button/p-button (el ngClick vive ahí). */
  private async clickInterno(locator: Locator): Promise<void> {
    await locator
      .evaluate((el: HTMLElement) => {
        const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') as HTMLElement | null);
        btn?.click();
      })
      .catch(async () => locator.click({ force: true }));
  }

  /**
   * Resumen del summary panel de /pos-ui/pay (FE 1.13.0). Los valores no tienen
   * id: "Valor total", "Valor registrado" y "Descuento" son pares <h2> etiqueta
   * + <h2> valor, y "Pendiente" es un <span> seguido del único <h1> del panel.
   * "Pendiente" es el monto exacto que el POS exige para dejar finalizar.
   */
  async leerResumen(): Promise<{ total: number; registrado: number; descuento: number; pendiente: number }> {
    return this.page.evaluate(() => {
      const num = (t?: string | null) => Number((t || '').replace(/[^0-9.]/g, '')) || 0;
      const panel = document.querySelector('[id^="summary_panel_body"]');
      const h2 = Array.from(panel?.querySelectorAll('h2') ?? []).map((h) => (h.textContent || '').trim());
      const valor = (label: string) => {
        const i = h2.indexOf(label);
        return i >= 0 ? num(h2[i + 1]) : 0;
      };
      return {
        total: valor('Valor total'),
        registrado: valor('Valor registrado'),
        descuento: valor('Descuento'),
        pendiente: num(panel?.querySelector('h1')?.textContent),
      };
    });
  }

  /** Selecciona EFECTIVO si no está marcado (el regalo lo deselecciona). */
  private async seleccionarEfectivo(): Promise<void> {
    const marcado = await this.page
      .locator('#check1')
      .isChecked()
      .catch(() => false);
    if (marcado) return;
    await this.page
      .locator('label[for=check1]')
      .evaluate((el: HTMLElement) => el.click())
      .catch(() => this.efectivo.first().evaluate((el: HTMLElement) => el.click()));
    await this.page.waitForTimeout(1_500);
  }

  /**
   * Si aparece el modal "Seleccionar regalo", elige el primer regalo y acepta.
   * Devuelve true si hubo regalo: en 1.13.0 el regalo SUMA su precio al total
   * (p.ej. tiradera $2.99) y deselecciona el método de pago, así que queda un
   * pendiente nuevo que hay que cubrir.
   */
  private async resolverRegaloSiAplica(): Promise<boolean> {
    const visible = await this.modalRegalo
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) return false;
    const primerRegalo = this.page.locator('[role=dialog] input[type=radio]').first();
    await primerRegalo
      .evaluate((el: HTMLElement) => el.click())
      .catch(() => primerRegalo.click({ force: true }).catch(() => undefined));
    await this.page.waitForTimeout(800);
    await this.aceptarDialogo
      .last()
      .evaluate((el: HTMLElement) => el.click())
      .catch(() => undefined);
    await this.page.waitForTimeout(2_500);
    return true;
  }

  /**
   * Registra pagos en efectivo hasta que el pendiente del resumen llegue a 0.
   * Cada pago se limita a $2,000 (tope por transacción en efectivo; ver D-07).
   */
  private async registrarEfectivoHastaCubrir(): Promise<void> {
    const LIMITE_EFECTIVO = 2000;
    for (let i = 0; i < 15; i++) {
      const r = await this.leerResumen();
      console.log(
        `[pagarEnEfectivo] iter=${i} total=$${r.total} registrado=$${r.registrado} pendiente=$${r.pendiente}`,
      );
      if (r.pendiente === 0) return;

      await this.seleccionarEfectivo();
      const monto = Math.min(r.pendiente, LIMITE_EFECTIVO);
      // focus + select + fill + Tab sincroniza el model de p-inputnumber.
      await this.inputPrincipal
        .evaluate((el: HTMLInputElement) => {
          el.focus();
          el.select();
        })
        .catch(() => undefined);
      await this.inputPrincipal.fill(monto.toFixed(2));
      await this.inputPrincipal.press('Tab');
      await this.page.waitForTimeout(700);
      await this.clickInterno(this.agregarBtn);
      await this.page.waitForTimeout(2_000);
    }
    throw new Error('El pendiente no llegó a $0 tras 15 pagos en efectivo.');
  }

  /**
   * Pago completo en efectivo (FE 1.13.0):
   *  1. Registrar pagos hasta pendiente $0.
   *  2. Continuar → puede aparecer "Seleccionar regalo"; el regalo agrega su
   *     precio al total → volver al paso 1 y Continuar de nuevo.
   *  3. Confirmar cada modal "Procesando Pago" (uno por pago) con "Procesar".
   */
  async pagarEnEfectivo(): Promise<void> {
    for (let ronda = 0; ronda < 3; ronda++) {
      await this.registrarEfectivoHastaCubrir();
      await this.clickInterno(this.continuarBtn);
      await this.page.waitForTimeout(2_000);
      if (!(await this.resolverRegaloSiAplica())) break;
      const r = await this.leerResumen();
      console.log(`[pagarEnEfectivo] regalo agregado → total=$${r.total} pendiente=$${r.pendiente}`);
    }

    // Por cada pago: "Procesando Pago" (Procesar) → "Registro de pago en
    // efectivo" (Recibido + Aceptar). Se repite hasta "Transacción finalizada".
    for (let i = 0; i < 10; i++) {
      if (await this.transaccionFinalizada.isVisible().catch(() => false)) break;

      const procesarVisible = await this.procesarBtn
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (procesarVisible) {
        console.log(`[pagarEnEfectivo] "Procesando Pago" #${i + 1} → Procesar`);
        await this.procesarBtn.click({ force: true }).catch(() => undefined);
        await this.page.waitForTimeout(2_500);
      }

      const registrado = await this.registrarEfectivoRecibidoSiAplica();
      if (!procesarVisible && !registrado) break;
    }

    await expect(this.transaccionFinalizada).toBeVisible({ timeout: 90_000 });
  }

  /**
   * Modal "Registro de pago en efectivo" (FE 1.13.0), tras "Procesar":
   *   #paymentAmount (Pagar, disabled) · #receivedAmount (Recibido *) ·
   *   #changeAmount (Cambio, disabled) · #newBanknoteValue / #newBanknoteSerial
   *   (registro opcional de billetes de $50/$100) · [id="button_actions.accept"].
   * Se registra Recibido = Pagar (cambio $0). La UI no exige registrar billetes
   * para habilitar Aceptar (verificado con $14.99 y $1,500).
   * `#receivedAmount` es p-inputnumber: hay que teclear, `fill` no sincroniza el model.
   */
  private async registrarEfectivoRecibidoSiAplica(): Promise<boolean> {
    const titulo = this.page.locator('text=Registro de pago en efectivo');
    const visible = await titulo
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) return false;

    const pagar = montoDe(await this.pagarMontoInput.inputValue().catch(() => '0'));
    console.log(`[pagarEnEfectivo] "Registro de pago en efectivo" → Recibido=$${pagar}`);
    await this.recibidoInput.evaluate((el: HTMLInputElement) => {
      el.focus();
      el.select();
    });
    await this.recibidoInput.pressSequentially(pagar.toFixed(2));
    await this.recibidoInput.press('Tab');
    await this.page.waitForTimeout(800);
    await this.clickInterno(this.aceptarRegistroEfectivoBtn);
    await titulo.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
    await this.page.waitForTimeout(1_500);
    return true;
  }

  async seleccionarCreditoPycca(): Promise<CreditoPyccaForm> {
    await this.creditoPycca.first().click();
    await this.page.waitForTimeout(2_000);
    return this.credito;
  }
}

/**
 * Formulario Crédito PYCCA (sub-componente de PaymentPage).
 *
 * Una tarjeta bloqueada se marca con `p-disabled` + icono `pi-lock`.
 */
export class CreditoPyccaForm {
  constructor(private readonly page: Page) {}

  readonly cedulaInput = this.page.locator(
    '#mf_pay_pycca_direct_credit_form_identification_number_input',
  );
  readonly tarjetaSelect = '#mf_pay_pycca_direct_credit_form_credit_select';
  readonly disponibleInput = this.page.locator(
    '#mf_pay_pycca_direct_credit_form_credit_available_input',
  );
  readonly valorAPagarInput = this.page.locator(
    '#mf_pay_pycca_direct_credit_form_value_to_pay_input',
  );
  readonly financiamientoSelect = '#mf_pay_pycca_direct_credit_form_financing_select';
  readonly financiamientoLocator = this.page.locator(
    '#mf_pay_pycca_direct_credit_form_financing_select',
  );
  readonly cuotaInput = this.page.locator('#mf_pay_pycca_direct_credit_form_fee_value_input');
  readonly agregarBtn = this.page.locator('#mf_pay_pycca_direct_credit_form_add_button');
  readonly opcionTarjeta = this.page.locator('li[role=option]');
  readonly pagoRegistradoRow = this.page
    .locator('#mf_pay_recorded_payments_table_row_0_actions')
    .locator('..');

  async setCedula(cedula: string): Promise<void> {
    await this.cedulaInput.fill(cedula);
    await this.cedulaInput.press('Tab');
    await this.page.waitForTimeout(2_500);
  }

  async seleccionarTarjeta(posicion = 1): Promise<void> {
    await seleccionarEnDropdown(this.page, this.tarjetaSelect, posicion);
  }

  private estadoCreditForm() {
    return this.page.evaluate(() => {
      const val = (id: string) => {
        const el = document.querySelector(`#${id}`);
        if (!el) return '';
        // El id puede estar en el <input> directamente o en un wrapper.
        const input = el.tagName === 'INPUT' ? (el as HTMLInputElement) : el.querySelector('input');
        return (input as HTMLInputElement | null)?.value || '';
      };
      const financing = document.querySelector('#mf_pay_pycca_direct_credit_form_financing_select');
      return {
        financingDisabled: !!financing?.classList.contains('p-disabled'),
        disponible: val('mf_pay_pycca_direct_credit_form_credit_available_input'),
        valorAPagar: val('mf_pay_pycca_direct_credit_form_value_to_pay_input'),
      };
    });
  }

  /**
   * Habilita el select de financiamiento ajustando valorAPagar al cupo
   * disponible (necesario por bug D-03: tarjetas con cupo insuficiente).
   */
  private async habilitarFinancing(): Promise<void> {
    const num = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;
    // Esperar a que el formulario termine de cargar disponible + valorAPagar.
    for (let i = 0; i < 10; i++) {
      const s = await this.estadoCreditForm();
      if (!s.financingDisabled) return;
      if (num(s.disponible) > 0 && num(s.valorAPagar) > 0) break;
      await this.page.waitForTimeout(1_000);
    }
    const estado = await this.estadoCreditForm();
    const disp = num(estado.disponible);
    const vap = num(estado.valorAPagar);
    console.log(
      `[CreditoPycca] estado pre-ajuste: disponible=${disp} valorAPagar=${vap} ` +
        `financingDisabled=${estado.financingDisabled}`,
    );
    if (estado.financingDisabled && disp > 0) {
      const monto = Math.min(vap || disp, disp);
      console.log(`[CreditoPycca] ajustando valorAPagar a ${monto.toFixed(2)}`);
      await this.valorAPagarInput.click({ force: true }).catch(() => undefined);
      await this.valorAPagarInput.press('Control+A').catch(() => undefined);
      await this.valorAPagarInput.fill(monto.toFixed(2));
      await this.valorAPagarInput.press('Tab');
      await this.page.waitForTimeout(2_500);
      const nuevo = await this.estadoCreditForm();
      console.log(
        `[CreditoPycca] estado post-ajuste: valorAPagar=${nuevo.valorAPagar} ` +
          `financingDisabled=${nuevo.financingDisabled}`,
      );
    }
  }

  async seleccionarFinanciamiento(posicion = 1): Promise<void> {
    await this.habilitarFinancing();
    const estado = await this.estadoCreditForm();
    if (estado.financingDisabled) {
      throw new Error(
        'El select de financiamiento no se habilitó (sigue p-disabled). ' +
          `disponible="${estado.disponible}" valorAPagar="${estado.valorAPagar}". ` +
          'Causa típica: la cédula de prueba no tiene cupo real asignado en el ' +
          'POS (bug D-03). Solicita a infraestructura reponer cupo de alguna ' +
          'cédula del CEDULA_POOL en el centro 004-112.',
      );
    }

    // Abrir el dropdown — PrimeNG p-select requiere click en el elemento
    // interno (.p-select-label o .p-select o similar), no en el wrapper.
    const abierto = await this.page.evaluate(() => {
      const root = document.querySelector('#mf_pay_pycca_direct_credit_form_financing_select');
      if (!root) return false;
      // Buscar el elemento clickable interno (varias clases posibles en PrimeNG v17/v18).
      const trigger =
        root.querySelector('.p-select-label') ||
        root.querySelector('.p-dropdown-label') ||
        root.querySelector('[data-pc-section="label"]') ||
        root.querySelector('[role="combobox"]') ||
        (root as HTMLElement);
      (trigger as HTMLElement).click();
      return true;
    });
    console.log(`[CreditoPycca.seleccionarFinanciamiento] dropdown abierto=${abierto}`);
    await this.page.waitForTimeout(2_500);
    // Scrape de opciones visibles del overlay — PrimeNG puede appendTo=body.
    const opciones = await this.page.$$eval(
      '.p-select-overlay li, .p-dropdown-items li, [role=option], .p-select-list-item, .p-dropdown-item',
      (els) =>
        (els as HTMLElement[])
          .filter((e) => e.offsetParent !== null)
          .map((e) => (e.innerText || '').trim())
          .filter(Boolean),
    );
    console.log(`[CreditoPycca.seleccionarFinanciamiento] opciones:`, JSON.stringify(opciones));
    // Priorizar opciones con "cuotas" > 1 (ej: "DIF. CON INTERESES - 3 CUOTAS").
    const idx = opciones.findIndex((o) => {
      const m = /\(\s*(\d+)\s*CUOTAS?\)/i.exec(o);
      return m && Number(m[1]) > 1;
    });
    const posicionFinal = idx >= 0 ? idx + 1 : posicion;
    const elegida = opciones[posicionFinal - 1] ?? '?';
    console.log(`[CreditoPycca.seleccionarFinanciamiento] eligiendo posición ${posicionFinal} (${elegida})`);
    // Navegar con teclado desde el estado abierto (el overlay está activo).
    for (let i = 0; i < posicionFinal; i++) await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(2_500);
  }

  async abrirTarjetaDropdown(): Promise<void> {
    await this.page.locator(this.tarjetaSelect).click();
    await this.page.waitForTimeout(1_800);
  }

  /** Cierra el overlay haciendo click en el input de cédula. */
  async cerrarOverlay(): Promise<void> {
    await this.cedulaInput.click();
    await this.page.waitForTimeout(600);
  }

  /** True si la primera tarjeta del dropdown abierto está bloqueada. */
  async primeraTarjetaBloqueada(): Promise<{ hayTarjeta: boolean; bloqueada: boolean }> {
    const opcion = this.opcionTarjeta.first();
    const hayTarjeta = await opcion.isVisible().catch(() => false);
    const bloqueada = hayTarjeta
      ? await opcion.evaluate((el) => el.classList.contains('p-disabled')).catch(() => true)
      : true;
    return { hayTarjeta, bloqueada };
  }

  async agregar(): Promise<void> {
    console.log('[CreditoPycca.agregar] click Agregar (JS click)');
    // JS click directo — las máscaras residuales interceptan incluso force:true.
    await this.agregarBtn.evaluate((el: HTMLElement) => el.click());
    // Esperar a que aparezca la fila del pago registrado (hasta 15s).
    const filaOk = await this.pagoRegistradoRow
      .waitFor({ state: 'attached', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!filaOk) {
      console.log('[CreditoPycca.agregar] fila pago registrado NO apareció tras 15s');
    } else {
      console.log('[CreditoPycca.agregar] ✅ fila pago registrado visible');
    }
    await this.page.waitForTimeout(1_500);
  }
}
