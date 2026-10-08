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
  readonly inputPrincipal = this.page.locator('input[placeholder="$0.00"]').first();

  private readonly agregarBtn = this.page.locator('button:has-text("Agregar")');
  private readonly continuarBtn = this.page.locator('button:has-text("Continuar")');
  private readonly procesarBtn = this.page.locator('button:has-text("Procesar")');
  private readonly aceptarDialogo = this.page.locator('p-dialog button:has-text("Aceptar")');
  private readonly recibidoInput = this.page.locator('input[placeholder="$0.00"] >> nth=1');

  readonly credito = new CreditoPyccaForm(this.page);

  async esperarCargada(): Promise<void> {
    await this.page.waitForURL(/pos-ui\/pay/, { timeout: 30_000 });
  }

  /**
   * Pago completo en efectivo.
   *
   * Contempla los dos interruptores que la app puede intercalar:
   *  - modal de regalo por promoción,
   *  - recálculo de pagos que el regalo provoca.
   */
  async pagarEnEfectivo(): Promise<void> {
    await this.efectivo.first().click();
    await this.page.waitForTimeout(1_500);
    await this.agregarBtn.first().click();
    await this.page.waitForTimeout(2_000);
    await this.continuarBtn.first().click();
    await this.page.waitForTimeout(3_000);

    // Promoción: elegir un regalo y aceptar.
    if (await this.modalRegalo.isVisible().catch(() => false)) {
      await this.page.locator('tbody tr').first().click();
      await this.page.waitForTimeout(1_000);
      await this.aceptarDialogo.last().click();
      await this.page.waitForTimeout(3_000);

      // El regalo cambia el total → cubrir el saldo restante.
      await this.efectivo.first().click();
      await this.page.waitForTimeout(1_500);
      await this.agregarBtn.first().click();
      await this.page.waitForTimeout(2_000);
      await this.continuarBtn.first().click();
      await this.page.waitForTimeout(3_000);
    }

    await this.procesarBtn.first().click();
    await this.page.waitForTimeout(3_000);

    if (await this.recibidoInput.isVisible().catch(() => false)) {
      const aPagar = await this.inputPrincipal.inputValue();
      await this.recibidoInput.fill(aPagar.replace(/[^0-9.]/g, ''));
      await this.recibidoInput.press('Tab');
      await this.page.waitForTimeout(1_200);
      await this.aceptarDialogo.first().click();
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

  async seleccionarFinanciamiento(posicion = 1): Promise<void> {
    await seleccionarEnDropdown(this.page, this.financiamientoSelect, posicion);
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
    await this.agregarBtn.click();
    await this.page.waitForTimeout(2_500);
  }
}
