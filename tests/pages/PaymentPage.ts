import { Page, expect } from '@playwright/test';
import { seleccionarEnDropdown } from '../fixtures/dataset';

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
  private readonly recibidoInput = this.page.locator('input[placeholder="$ 0.00"]').nth(1);

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

  /** Lee el valor numérico de un selector de texto tipo "$1,234.56". */
  private async leerMonto(locator: ReturnType<Page['locator']>): Promise<number> {
    const txt = await locator.innerText().catch(() => '');
    return Number((txt.match(/[\d]+[\d.,]*/)?.[0] ?? '0').replace(/,/g, '')) || 0;
  }

  /**
   * Pendiente real que la UI muestra en el summary panel (derecha, al pie):
   *   "Pendiente $X,XXX.XX"
   * Es la fuente de verdad del POS; el input "Valor a pagar" puede
   * desincronizarse con el model de p-inputnumber tras varios pagos.
   */
  private async leerPendiente(): Promise<number> {
    const txt = await this.page
      .evaluate(() => {
        // Buscar panel resumen y extraer "Pendiente $XXXX.XX".
        const roots = Array.from(
          document.querySelectorAll('[id^="summary_panel"], aside, [role=complementary], body'),
        );
        for (const root of roots) {
          const match = (root.textContent || '').match(/Pendiente\s*\$?\s*([\d.,]+)/i);
          if (match) return match[1];
        }
        return '0';
      })
      .catch(() => '0');
    return Number((txt ?? '0').replace(/,/g, '')) || 0;
  }

  /**
   * El POS abre un modal "Procesando Pago" tras cada Agregar para confirmar
   * el pago con un botón "Procesar". Resuelve el modal haciendo click DOM
   * directo sobre el <button> real dentro del p-dialog (los wrappers p-button
   * / lib-button a veces se tragan el click delegado de Playwright).
   */
  /**
   * El POS puede abrir un modal "Procesando Pago" (botón "Procesar") que debe
   * confirmarse para que el pago asociado quede commiteado. Se busca con un
   * walk recursivo que atraviesa shadow DOM (PrimeNG v18 renderiza algunos
   * dialogs por fuera del body principal).
   *
   * TODO: el walk encuentra el <p-dialog> en la UI visual pero `evaluate` lo
   * reporta como no visible en varios casos — queda pendiente diagnóstico
   * fino. Por ahora la lógica es best-effort y no bloquea el flujo.
   */
  private async confirmarProcesandoPagoSiAplica(): Promise<void> {
    for (let intento = 0; intento < 3; intento++) {
      const clicked = await this.page.evaluate(() => {
        const allElements: Element[] = [];
        const walk = (root: Document | ShadowRoot | Element) => {
          const els = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
          allElements.push(...els);
          for (const el of els) {
            const sr = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
            if (sr) walk(sr);
          }
        };
        walk(document);
        for (const el of allElements) {
          const tag = el.tagName.toLowerCase();
          if (!['button', 'p-button', 'lib-button'].includes(tag) && el.getAttribute('role') !== 'button') continue;
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          const label = el.getAttribute('label') || el.getAttribute('aria-label') || '';
          if (!/procesar/i.test(t) && !/procesar/i.test(label)) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if ((el as HTMLButtonElement).disabled) continue;
          if (el.getAttribute('aria-disabled') === 'true') continue;
          const inner = el.tagName === 'BUTTON' ? el : el.querySelector('button');
          (inner as HTMLButtonElement | null)?.click();
          return true;
        }
        return false;
      });
      if (!clicked) return;
      await this.page.waitForTimeout(2_500);
    }
  }

  /**
   * Si está el modal "Seleccionar regalo", selecciona el primer radio y acepta.
   * El POS lo lanza al registrar ciertos pagos; si no se resuelve bloquea el
   * resto del flujo.
   */
  private async resolverRegaloSiAplica(): Promise<void> {
    if (!(await this.modalRegalo.isVisible().catch(() => false))) return;
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
  }

  /**
   * Pago completo en efectivo.
   *
   * El POS actual tiene un límite por transacción (ej. $2,000) para pagos en
   * efectivo. Si el total supera el límite, hace falta añadir varios pagos
   * fraccionados hasta cubrirlo.
   */
  async pagarEnEfectivo(): Promise<void> {
    const MAX_INTENTOS = 15;
    const LIMITE_EFECTIVO = 2000;

    // Seleccionar EFECTIVO una vez. Click repetido sobre un método ya
    // seleccionado NO refresca el input "Valor a pagar".
    await this.efectivo.first().evaluate((el: HTMLElement) => el.click());
    await this.page.waitForTimeout(1_500);

    for (let i = 0; i < MAX_INTENTOS; i++) {
      // Resolver modales abiertos del ciclo previo.
      await this.confirmarProcesandoPagoSiAplica();
      await this.resolverRegaloSiAplica();

      // Fuente de verdad: pendiente del summary panel.
      const pendiente = await this.leerPendiente();
      console.log(`[pagarEnEfectivo] iter=${i} pendiente=${pendiente}`);
      if (pendiente === 0) break;

      const monto = Math.min(pendiente, LIMITE_EFECTIVO);

      // Fill explícito: focus + select vía DOM, luego fill + Tab para
      // sincronizar el model de p-inputnumber con el valor a pagar.
      await this.inputPrincipal
        .evaluate((el: HTMLInputElement) => {
          el.focus();
          el.select();
        })
        .catch(() => undefined);
      await this.inputPrincipal.fill(monto.toFixed(2));
      await this.inputPrincipal.press('Tab');
      await this.page.waitForTimeout(700);

      // #button_agregar es un <p-button> custom element; disparar ngClick
      // requiere clickear el <button> real dentro, no el wrapper.
      await this.agregarBtn
        .evaluate((el: HTMLElement) => {
          const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') as HTMLElement | null);
          btn?.click();
        })
        .catch(async () => this.agregarBtn.click({ force: true }));
      await this.page.waitForTimeout(2_000);

      // Confirmar el modal "Procesando Pago" que aparece tras cada Agregar.
      await this.confirmarProcesandoPagoSiAplica();
    }

    // Click Continuar en el footer principal (summary panel). El id apunta a
    // un <lib-button>; disparar el handler Angular requiere clickear el
    // <button> interno, no el custom element wrapper.
    await this.continuarBtn
      .evaluate((el: HTMLElement) => {
        const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') as HTMLElement | null);
        btn?.click();
      })
      .catch(async () => this.continuarBtn.click({ force: true }));
    await this.page.waitForTimeout(2_000);

    // El POS lanza UN modal "Procesando Pago" por cada pago registrado.
    // Cada uno se confirma con el botón "Procesar" verde. Hasta que todos
    // se procesen (o deje de aparecer el modal) no llegamos a "Transacción
    // finalizada".
    await this.resolverRegaloSiAplica();
    for (let i = 0; i < 10; i++) {
      const procesarLocator = this.page.locator('button:has-text("Procesar")').first();
      const visible = await procesarLocator
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!visible) break;
      await procesarLocator.click({ force: true }).catch(() => undefined);
      await this.page.waitForTimeout(3_000);
      await this.resolverRegaloSiAplica();
    }

    if (await this.recibidoInput.isVisible().catch(() => false)) {
      const aPagar = await this.inputPrincipal.inputValue();
      await this.recibidoInput.fill(aPagar.replace(/[^0-9.]/g, ''));
      await this.recibidoInput.press('Tab');
      await this.page.waitForTimeout(1_200);
      await this.aceptarDialogo.first().evaluate((el: HTMLElement) => el.click());
    }

    await expect(this.transaccionFinalizada).toBeVisible({ timeout: 90_000 });
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
