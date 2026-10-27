import { Page, Locator, expect } from '@playwright/test';
import { montoDe } from '../fixtures/dataset';

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
      const total = valor('Valor total');
      const registrado = valor('Valor registrado');
      // El <h1> muestra el valor absoluto: si ya se registró de más (p.ej. el
      // descuento de colaborador por EFECTIVO bajó el total después de Agregar)
      // el pendiente real es negativo (sobrepago).
      const absPendiente = num(panel?.querySelector('h1')?.textContent);
      const pendiente = registrado > total + 0.005 ? -absPendiente : absPendiente;
      return { total, registrado, descuento: valor('Descuento'), pendiente };
    });
  }

  /** Borra todos los pagos de la tabla "Pagos registrados" (tacho de cada fila). */
  private async eliminarPagosRegistrados(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      const borrado = await this.page.evaluate(() => {
        const fila = document.querySelector('#mf_pay_recorded_payments_table_row_0_actions');
        const botones = Array.from(fila?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
        const tacho = botones[botones.length - 1];
        tacho?.click();
        return !!tacho;
      });
      if (!borrado) return;
      await this.page.waitForTimeout(2_000);
    }
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
      let r = await this.leerResumen();
      console.log(
        `[pagarEnEfectivo] iter=${i} total=$${r.total} registrado=$${r.registrado} pendiente=$${r.pendiente}`,
      );
      if (r.pendiente === 0) return;
      if (r.pendiente < 0) {
        // Clientes colaboradores tienen 10% de descuento pagando en EFECTIVO: el
        // total baja después de registrar el pago y queda sobrepago. Se borra el
        // pago y se vuelve a pagar el total ya descontado.
        console.log(`[pagarEnEfectivo] sobrepago de $${-r.pendiente} → borrar pagos y repagar`);
        await this.eliminarPagosRegistrados();
        continue;
      }

      await this.seleccionarEfectivo();
      // Elegir EFECTIVO puede aplicar el descuento por forma de pago: releer.
      r = await this.leerResumen();
      if (r.pendiente <= 0) continue;
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
    await this.page
      .locator('label[for=check5]')
      .evaluate((el: HTMLElement) => el.click())
      .catch(() => this.creditoPycca.first().click());
    await this.page.waitForTimeout(2_000);
    return this.credito;
  }
}

/**
 * Formulario Crédito PYCCA (sub-componente de PaymentPage), FE 1.13.0.
 *
 * Los ids no cambiaron, pero:
 *  - Los `p-select` (tarjeta, financiamiento) tienen `appendTo="body"` y el
 *    layout del panel derecho intercepta el click de mouse: se abren con foco
 *    en su `[role=combobox]` + Enter, y la opción se elige con click DOM.
 *  - El financiamiento se habilita recién cuando "Valor a pagar" pierde el foco
 *    (Tab) → `POST /api/payment/v1/installments-plan`.
 *  - Opciones de financiamiento: "N CUOTAS-PAGA EN ENERO $X" y
 *    "DIF. CON INTERESES - (N CUOTAS) $X" (48 opciones para $749).
 *  - "Agregar" abre "Actualización de datos clientes club Pycca" (se cancela
 *    para no modificar datos reales del cliente; el pago se registra igual) y
 *    luego "Captaciones de seguros" (Cerrar).
 * Una tarjeta bloqueada se marca con `p-disabled` / `aria-disabled`.
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
  readonly opcionTarjeta = this.page.locator('[role=option]');
  readonly pagoRegistradoRow = this.page
    .locator('#mf_pay_recorded_payments_table_row_0_actions')
    .locator('..');
  /** Monto del primer pago registrado (la fila completa incluye el nº de tarjeta). */
  readonly pagoRegistradoMonto = this.page.locator('#mf_pay_recorded_payments_table_row_0_amount');

  async setCedula(cedula: string): Promise<void> {
    await this.cedulaInput.fill(cedula);
    await this.cedulaInput.press('Tab');
    await this.page.waitForTimeout(2_500);
  }

  /** Abre un p-select con teclado (el click de mouse lo intercepta el layout). */
  private async abrirSelect(selector: string): Promise<void> {
    await this.page.locator(`${selector} [role=combobox]`).focus();
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(1_500);
  }

  private async opcionesVisibles(): Promise<string[]> {
    return this.page.$$eval('[role=option]', (els) =>
      (els as HTMLElement[]).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()),
    );
  }

  private async clickOpcion(indice: number): Promise<void> {
    await this.opcionTarjeta.nth(indice).evaluate((el: HTMLElement) => el.click());
    await this.page.waitForTimeout(2_500);
  }

  async abrirTarjetaDropdown(): Promise<void> {
    await this.abrirSelect(this.tarjetaSelect);
  }

  /** Cierra el overlay abierto sin seleccionar. */
  async cerrarOverlay(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(600);
  }

  async seleccionarTarjeta(posicion = 1): Promise<void> {
    if (!(await this.opcionTarjeta.first().isVisible().catch(() => false))) {
      await this.abrirTarjetaDropdown();
    }
    await this.clickOpcion(posicion - 1);
  }

  /** True si la primera tarjeta del dropdown abierto está bloqueada. */
  async primeraTarjetaBloqueada(): Promise<{ hayTarjeta: boolean; bloqueada: boolean }> {
    const opcion = this.opcionTarjeta.first();
    const hayTarjeta = await opcion.isVisible().catch(() => false);
    const bloqueada = hayTarjeta
      ? await opcion
          .evaluate(
            (el) => el.classList.contains('p-disabled') || el.getAttribute('aria-disabled') === 'true',
          )
          .catch(() => true)
      : true;
    return { hayTarjeta, bloqueada };
  }

  private async financiamientoDeshabilitado(): Promise<boolean> {
    return this.financiamientoLocator
      .evaluate((el) => el.classList.contains('p-disabled'))
      .catch(() => true);
  }

  /**
   * Ajusta "Valor a pagar" al cupo si hace falta y confirma con Tab: es el blur
   * de ese campo lo que pide el plan de cuotas y habilita el financiamiento.
   */
  private async habilitarFinancing(): Promise<void> {
    const num = (s: string) => Number(s.replace(/[^0-9.]/g, '')) || 0;
    const disponible = num(await this.disponibleInput.inputValue().catch(() => ''));
    const valor = num(await this.valorAPagarInput.inputValue().catch(() => ''));
    console.log(`[CreditoPycca] disponible=${disponible} valorAPagar=${valor}`);

    await this.valorAPagarInput.focus();
    if (disponible > 0 && valor > disponible) {
      console.log(`[CreditoPycca] ajustando valorAPagar a ${disponible.toFixed(2)}`);
      await this.valorAPagarInput.evaluate((el: HTMLInputElement) => el.select());
      // p-inputnumber: hay que teclear, `fill` no sincroniza el model.
      await this.valorAPagarInput.pressSequentially(disponible.toFixed(2));
    }
    const plan = this.page
      .waitForResponse((r) => /\/payment\/v1\/installments-plan/.test(r.url()), { timeout: 15_000 })
      .catch(() => null);
    await this.page.keyboard.press('Tab');
    await plan;
    await this.page.waitForTimeout(1_500);
  }

  /**
   * Elige un plan "DIF. CON INTERESES - (N CUOTAS)" con N = `cuotas` si existe;
   * si no, el primer plan con más de 1 cuota.
   */
  async seleccionarFinanciamiento(cuotas = 3): Promise<void> {
    await this.habilitarFinancing();
    if (await this.financiamientoDeshabilitado()) {
      throw new Error(
        'El select de financiamiento no se habilitó (sigue p-disabled). Causa típica: ' +
          'la cédula no tiene cupo real (D-03) o installments-plan no respondió.',
      );
    }
    await this.abrirSelect(this.financiamientoSelect);
    const opciones = await this.opcionesVisibles();
    const plazo = (o: string) => Number(/\(\s*(\d+)\s*CUOTAS?\)/i.exec(o)?.[1] ?? 0);
    let idx = opciones.findIndex((o) => plazo(o) === cuotas);
    if (idx < 0) idx = opciones.findIndex((o) => plazo(o) > 1);
    if (idx < 0) idx = 0;
    console.log(
      `[CreditoPycca.seleccionarFinanciamiento] ${opciones.length} opciones → "${opciones[idx] ?? '?'}"`,
    );
    await this.clickOpcion(idx);
  }

  /** Cierra un modal por título con el botón indicado (click real; JS si algo lo tapa). */
  private async cerrarModalSiAplica(titulo: RegExp, boton: RegExp, timeout: number): Promise<boolean> {
    // Por rol + texto: en FE pbd-9-sync-develop estos modales ya no usan .p-dialog
    // (host con id dinámico modal_dialog_id_*), visto el 2026-10-26.
    const modal = this.page.getByRole('dialog').filter({ hasText: titulo }).first();
    const visible = await modal
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
    if (!visible) return false;
    const btn = modal.getByRole('button', { name: boton }).first();
    await btn.click({ timeout: 5_000 }).catch(() => btn.evaluate((el: HTMLElement) => el.click()));
    await modal.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    await this.page.waitForTimeout(1_000);
    return true;
  }

  async agregar(): Promise<void> {
    console.log('[CreditoPycca.agregar] click Agregar');
    await this.agregarBtn.evaluate((el: HTMLElement) => {
      const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') as HTMLElement | null);
      btn?.click();
    });
    // No se completan datos reales del cliente: Cancelar registra el pago igual.
    if (await this.cerrarModalSiAplica(/Actualizaci[oó]n de datos clientes/, /Cancelar/, 15_000)) {
      console.log('[CreditoPycca.agregar] "Actualización de datos clientes club Pycca" → Cancelar');
    }
    if (await this.cerrarModalSiAplica(/Captaciones de seguros/, /Cerrar/, 5_000)) {
      console.log('[CreditoPycca.agregar] "Captaciones de seguros" → Cerrar');
    }
    const filaOk = await this.pagoRegistradoRow
      .waitFor({ state: 'attached', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    console.log(`[CreditoPycca.agregar] fila pago registrado ${filaOk ? 'visible ✅' : 'NO apareció'}`);
  }
}
