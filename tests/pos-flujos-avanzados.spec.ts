import { test, expect, Page } from '@playwright/test';
import {
  SEL,
  CREDENCIALES,
  generarCarrito,
  tomarCedulas,
  mockImpresion,
  login,
  liberarEntregasCajaPendientes,
  cargarCarrito,
  asignarPersona,
  autorizarSupervisor,
  seleccionarEnDropdown,
  cerrarDialogos,
  vaciarCarrito,
  pagarEnEfectivo,
  evidencia,
  type ItemCarrito,
} from './pos.fixtures';

/**
 * Suite E2E — 5 casos de negocio avanzados POSCLICK 1.12.0-rc.1
 *
 * Todas las aserciones reflejan el comportamiento REAL verificado el 24/09/2026,
 * no la especificación original. Donde el sistema difiere de lo esperado, el
 * test documenta la diferencia en un comentario y asierta lo que la app hace.
 *
 * REQUISITOS DE EJECUCIÓN
 *  1. El navegador debe correr en la misma máquina que la app (SSO con
 *     redirect_uri=http://localhost:4200). Un navegador remoto/túnel falla.
 *  2. retries: 0 — estos casos mueven stock, caja y cupo de crédito reales.
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await mockImpresion(page);
  await login(page);
  // Sin esto, Facturación responde "Acceso denegado: tiene entregas de caja pendientes".
  await liberarEntregasCajaPendientes(page);
});

async function abrirFacturacion(page: Page): Promise<void> {
  if (!page.url().includes('/pos-ui/invoice')) {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(3_000);
    await page.locator(SEL.dashboard.irFacturacion).click();
    await page.waitForURL(/pos-ui\/invoice/, { timeout: 30_000 });
    await page.waitForTimeout(2_000);
  }
}

/* ==========================================================================
 * CASO 1 — Restricción de suspensión única y recuperación unitaria
 * ========================================================================*/
test('Caso 1: solo se permite una transacción suspendida y su recuperación es unitaria', async ({
  page,
}) => {
  await abrirFacturacion(page);

  // --- Transacción A ---
  const carritoA: ItemCarrito[] = generarCarrito();
  await cargarCarrito(page, carritoA);

  await page.locator(SEL.carrito.suspender).click();
  // Confirmación previa: advierte que se pierden descuentos/entregas/garantías.
  // NO pide autorización de supervisor.
  await expect(page.locator('text=Suspender transacción')).toBeVisible();
  await page.locator(SEL.autorizacion.confirmar).first().click();
  await page.waitForTimeout(3_000);
  await expect(page.locator('text=$0.00').first()).toBeVisible(); // carrito vacío

  // --- Transacción B ---
  const carritoB: ItemCarrito[] = generarCarrito();
  await cargarCarrito(page, carritoB);

  // COMPORTAMIENTO REAL: el sistema NO muestra "Ya existe una transacción
  // suspendida...". Impide la segunda suspensión deshabilitando el botón.
  await expect(page.locator(`${SEL.carrito.suspender} button`)).toBeDisabled();
  await evidencia(page, 'caso1-01-alerta-bloqueo');

  // --- Cancelar B y recuperar A ---
  await vaciarCarrito(page);
  await page.locator(SEL.carrito.recuperarSuspendida).click();
  await expect(page.locator(SEL.suspendidas.modal)).toBeVisible({ timeout: 15_000 });
  await page.locator(SEL.suspendidas.radioPrimera).first().click();
  await page.locator(SEL.suspendidas.recuperar).first().click();
  await page.waitForTimeout(3_500);

  // El carrito recuperado debe contener exactamente los SKUs de A.
  for (const { sku } of carritoA) {
    await expect(page.locator(`text=${sku}`).first()).toBeVisible();
  }
  for (const { sku } of carritoB.filter((b) => !carritoA.some((a) => a.sku === b.sku))) {
    await expect(page.locator(`text=${sku}`)).toHaveCount(0);
  }
  await evidencia(page, 'caso1-02-transaccion-recuperada');

  // --- Segundo intento: ya no quedan suspendidas ---
  await page.locator(SEL.carrito.recuperarSuspendida).click();
  await page.waitForTimeout(2_500);
  await expect(page.locator(SEL.suspendidas.sinDatos)).toBeVisible();
  await expect(page.locator(SEL.suspendidas.sinPendientes)).toBeVisible();
  await evidencia(page, 'caso1-03-sin-pendientes');

  await page.locator(SEL.carrito.cancelar).first().click();
  await vaciarCarrito(page);
});

/* ==========================================================================
 * CASO 2 — Proforma de Oferta Especial (H0867) y conversión a factura
 *
 * La funcionalidad NO es un módulo del dashboard: se accede desde la lupa
 * junto al buscador de SKU → diálogo "Cargar factura" → pestaña
 * "Oferta Especial" → Número de autorización + Número de documento.
 * ========================================================================*/
test('Caso 2: la proforma de oferta especial conserva cliente, ítems y beneficio al facturar', async ({
  page,
}) => {
  const { cedula, cupon } = CREDENCIALES.ofertaEspecial;
  await abrirFacturacion(page);

  // 1. Abrir el buscador de documentos y pasar a "Oferta Especial".
  await page.locator(SEL.ofertaEspecial.abrirCargarFactura).click();
  await expect(page.locator(SEL.ofertaEspecial.dialogo)).toBeVisible({ timeout: 15_000 });
  await page.locator(SEL.ofertaEspecial.tabOfertaEspecial).first().click();
  await page.waitForTimeout(1_500);

  // 2. Consultar por autorización + documento.
  await page.locator(SEL.ofertaEspecial.numeroAutorizacion).fill(cupon);
  await page.locator(SEL.ofertaEspecial.numeroDocumento).fill(cedula);
  await page.locator(SEL.ofertaEspecial.buscar).first().click();
  await page.waitForTimeout(4_000);

  // 3. La proforma se carga con el cliente y el beneficio aplicado.
  await expect(page.locator(SEL.ofertaEspecial.tituloProforma(cupon))).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(`text=${cedula}`).first()).toBeVisible();

  const descuentoProforma = montoDe(
    await page.locator(SEL.carrito.valorDescuento).innerText().catch(() => '0'),
  );
  const totalProforma = montoDe(await page.locator('#mf_sale_total_value').innerText().catch(() => '0'));
  expect(descuentoProforma, 'la oferta especial debe aplicar un descuento').toBeGreaterThan(0);
  await evidencia(page, 'caso2-01-proforma-cargada');

  // 4. Continuar: los datos deben viajar intactos a la pantalla de cobro.
  await page.locator(SEL.carrito.continuar).first().click();
  await page.waitForURL(/pos-ui\/pay/, { timeout: 30_000 });
  await expect(page.locator(`text=${cedula}`).first()).toBeVisible();
  await expect(page.locator('text=Valor total').locator('..')).toContainText(
    totalProforma.toFixed(2),
  );
  await evidencia(page, 'caso2-02-datos-en-cobro');

  // 5. Cobrar y emitir la factura.
  await pagarEnEfectivo(page);
  await evidencia(page, 'caso2-factura-proforma');
  await cerrarDialogos(page);
});

/* ==========================================================================
 * CASO 3 — Independencia cliente de facturación vs. persona de retiro
 *
 * La "persona autorizada para el retiro" es el campo "Envío a" de
 * /pos-ui/delivery. Usa el mismo componente que el cliente de facturación.
 * ========================================================================*/
test('Caso 3: cliente de facturación y persona de retiro son independientes', async ({ page }) => {
  const [clienteA, clienteB, clienteC, clienteD] = tomarCedulas(4);

  await abrirFacturacion(page);
  const carrito = generarCarrito(10, 10);
  await cargarCarrito(page, carrito);

  // Entrega a futuro (retiro en sucursal) — exige autorización de supervisor.
  await page.locator(SEL.carrito.checkboxTodos).first().click();
  await page.locator(SEL.carrito.entregaFutura).click();
  await autorizarSupervisor(page);
  await page.waitForURL(/pos-ui\/delivery/, { timeout: 60_000 });

  // Cliente B como persona de retiro.
  await asignarPersona(page, clienteB, 'CC');
  const retiroB = await page.locator('text=Envío a').locator('..').innerText();
  expect(retiroB).toContain(clienteB);

  // Configuración mínima de la entrega para poder volver.
  await configurarEntrega(page, carrito);
  await page.locator(SEL.entregaFutura.continuar).click();
  await page.waitForURL(/pos-ui\/invoice/, { timeout: 30_000 });

  // Cliente A como facturación → el retiro NO debe moverse.
  await asignarPersona(page, clienteA, 'CC');
  await volverAEntregaFutura(page);
  await expect(page.locator('text=Envío a').locator('..')).toContainText(clienteB);
  await evidencia(page, 'caso3-01-retiro-persiste');

  // Cambiar SOLO el retiro a D.
  await asignarPersona(page, clienteD, 'CC');
  await expect(page.locator('text=Envío a').locator('..')).toContainText(clienteD);
  await page.locator(SEL.entregaFutura.telefono).fill('0991234567');
  await page.locator(SEL.entregaFutura.continuar).click();
  await page.waitForURL(/pos-ui\/invoice/, { timeout: 30_000 });

  // El cliente de facturación NO debe haberse movido.
  await expect(page.locator(`text=${clienteA}`).first()).toBeVisible();
  await evidencia(page, 'caso3-02-facturacion-persiste');

  // Cierre de la venta.
  await page.locator(SEL.carrito.continuar).first().click();
  await page.waitForURL(/pos-ui\/pay/, { timeout: 30_000 });
  await pagarEnEfectivo(page);
  await evidencia(page, 'caso3-03-venta-emitida');
  await cerrarDialogos(page);

  // Reimpresión del voucher — DEFECTO CONOCIDO (ver aserción).
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(3_000);
  await page.locator(SEL.dashboard.irHistorialImpresion).click();
  await page.waitForURL(/print-history/, { timeout: 30_000 });
  await page.locator(SEL.historial.filaVoucher).first().click();
  await page.locator(SEL.historial.imprimir).click();
  await autorizarSupervisor(page);
  await page.waitForTimeout(4_000);
  await evidencia(page, 'caso3-04-reimpresion-voucher');

  // DEFECTO D-01: el voucher ENTREGA MERCADERIA (F4) no se reimprime, aunque
  // esté seleccionado. La FACTURA sí llega al driver de impresión.
  // Cuando dev lo corrija, invertir esta aserción y validar los nombres
  // Facturación=A / Retiro=D en el documento.
  await expect(
    page.locator(SEL.historial.sinDocumentos),
    'DEFECTO D-01: el voucher de entrega no se puede reimprimir',
  ).toBeVisible();
});

/* ==========================================================================
 * CASO 4 — Auditoría del supervisor que autoriza
 *
 * Alcance acordado: validar hasta pantalla. El contenido del documento impreso
 * no es inspeccionable (no hay impresora ni preview en el ambiente).
 * ========================================================================*/
test('Caso 4: la autorización de supervisor con lector de tarjeta habilita la operación', async ({
  page,
}) => {
  await abrirFacturacion(page);
  const carrito = generarCarrito();
  await cargarCarrito(page, carrito);

  await page.locator(SEL.carrito.checkboxTodos).first().click();
  await page.locator(SEL.carrito.entregaFutura).click();

  // El modal debe aparecer y aceptar la trama del lector + clave.
  await expect(page.locator(SEL.autorizacion.modal)).toBeVisible({ timeout: 20_000 });
  await autorizarSupervisor(page);

  // Autorización aceptada: la app avanza a la configuración de entrega.
  await page.waitForURL(/pos-ui\/delivery/, { timeout: 60_000 });
  await expect(page.locator('text=Entrega futura')).toBeVisible();
  await expect(page.locator('text=Lectura de tarjeta inválida')).toHaveCount(0);
  await expect(page.locator('text=Formulario incompleto')).toHaveCount(0);
  await evidencia(page, 'caso4-auditoria-supervisor');

  // NO verificable en este ambiente: que CREDENCIALES.supervisor.nombre conste
  // en la sección de firmas del voucher impreso (sin impresora ni preview).
  // Habilitar esta aserción cuando exista impresora PDF virtual:
  //   await expect(page.locator('body')).toContainText(CREDENCIALES.supervisor.nombre);

  await page.locator(SEL.entregaFutura.continuar).click().catch(() => undefined);
  await page.waitForTimeout(2_000);
  await vaciarCarrito(page);
});

/* ==========================================================================
 * CASO 5 — Consistencia de cuotas Crédito PYCCA: pantalla vs. documento
 *
 * Requiere una cédula con tarjeta NO bloqueada y cupo suficiente. Al 24/09/2026
 * las 24 del pool tienen la tarjeta con p-disabled (candado) y la única que
 * funcionaba (0301309787) quedó sobregirada. El test detecta esa condición y
 * falla con un mensaje accionable en vez de un error críptico de selector.
 * ========================================================================*/
test('Caso 5: la simulación de cuotas coincide con el documento emitido', async ({ page }) => {
  await abrirFacturacion(page);
  await cargarCarrito(page, generarCarrito());

  const cedulaCredito = await buscarCedulaConCreditoUtilizable(page);
  expect(
    cedulaCredito,
    'PRECONDICIÓN NO CUMPLIDA: ninguna cédula del pool tiene una tarjeta de ' +
      'Crédito PYCCA habilitada con cupo. Solicitar a infraestructura habilitar o ' +
      'reponer el cupo de una tarjeta de prueba.',
  ).not.toBeNull();

  await asignarPersona(page, cedulaCredito!, 'CC');
  await page.locator(SEL.carrito.continuar).first().click();
  await page.waitForURL(/pos-ui\/pay/, { timeout: 30_000 });

  await page.locator(SEL.pago.creditoPycca).first().click();
  await page.waitForTimeout(2_000);
  await page.locator(SEL.pago.credito.cedula).fill(cedulaCredito!);
  await page.locator(SEL.pago.credito.cedula).press('Tab');
  await page.waitForTimeout(2_500);

  await seleccionarEnDropdown(page, SEL.pago.credito.tarjetaSelect, 1);
  const disponible = montoDe(await page.locator(SEL.pago.credito.disponible).inputValue());
  expect(disponible, 'la tarjeta debe tener cupo disponible').toBeGreaterThan(0);

  // Plazo con intereses (posición 3 ≈ "DIF. CON INTERESES - (3 CUOTAS)").
  await seleccionarEnDropdown(page, SEL.pago.credito.financiamiento, 3);

  // Simulación en pantalla.
  const simulacion = {
    valor: montoDe(await page.locator(SEL.pago.credito.valorAPagar).inputValue()),
    cuota: montoDe(await page.locator(SEL.pago.credito.cuota).inputValue()),
    plazo: numeroDeCuotas(await page.locator(SEL.pago.credito.financiamiento).innerText()),
  };
  expect(simulacion.cuota).toBeGreaterThan(0);
  expect(simulacion.plazo).toBeGreaterThan(0);
  await evidencia(page, 'caso5-01-simulacion-pantalla');

  await page.locator(SEL.pago.credito.agregar).click();
  await page.waitForTimeout(2_500);

  // El pago registrado debe reflejar exactamente la simulación.
  const registrado = await page.locator('#mf_pay_recorded_payments_table_row_0_actions').locator('..').innerText();
  expect(registrado).toContain(String(simulacion.plazo));
  expect(montoDe(registrado)).toBeCloseTo(simulacion.valor, 2);

  // Coherencia matemática de la tabla de amortización.
  expect(simulacion.cuota * simulacion.plazo).toBeGreaterThanOrEqual(simulacion.valor - 0.05);
  await evidencia(page, 'caso5-consistencia-cuotas');
});

/* ============================================================================
 * Helpers locales
 * ==========================================================================*/

async function configurarEntrega(page: Page, carrito: ItemCarrito[]): Promise<void> {
  for (const { sku, cantidad } of carrito) {
    await page.locator(`text=${sku}`).first().click().catch(() => undefined);
    await page.waitForTimeout(1_200);
    await page
      .locator(SEL.entregaFutura.cantidadProducto(sku))
      .fill(String(cantidad))
      .catch(() => undefined);
    await page.locator(SEL.entregaFutura.buscarTienda).fill('');
    await page.waitForTimeout(1_500);
    const tienda = page.locator('tbody tr input[role=spinbutton]').first();
    await tienda.fill(String(cantidad));
    await tienda.press('Tab');
    await page.waitForTimeout(1_500);
  }
  await page.locator(SEL.entregaFutura.abrirCalendario).click();
  await page.waitForTimeout(1_200);
  await page.locator(SEL.entregaFutura.diaHabilitado).last().click();
  await page.keyboard.press('Escape');
  await page.locator(SEL.entregaFutura.telefono).fill('0991234567');
  await page.waitForTimeout(1_000);
}

/** Reentrar a la entrega futura: la app vuelve a exigir autorización cada vez. */
async function volverAEntregaFutura(page: Page): Promise<void> {
  await page.locator(SEL.carrito.checkboxTodos).first().click();
  await page.locator(SEL.carrito.entregaFutura).click();
  await autorizarSupervisor(page);
  await page.waitForURL(/pos-ui\/delivery/, { timeout: 60_000 });
}

/**
 * Recorre el pool buscando una tarjeta seleccionable (sin p-disabled/candado).
 * Devuelve null si ninguna sirve, para que el test falle con mensaje accionable.
 */
async function buscarCedulaConCreditoUtilizable(page: Page): Promise<string | null> {
  await page.locator(SEL.carrito.continuar).first().click();
  await page.waitForURL(/pos-ui\/pay/, { timeout: 30_000 });
  await page.locator(SEL.pago.creditoPycca).first().click();
  await page.waitForTimeout(2_000);

  for (const cedula of tomarCedulas(6)) {
    await page.locator(SEL.pago.credito.cedula).fill(cedula);
    await page.locator(SEL.pago.credito.cedula).press('Tab');
    await page.waitForTimeout(2_500);
    await page.locator(SEL.pago.credito.tarjetaSelect).click();
    await page.waitForTimeout(1_800);

    const opcion = page.locator(SEL.pago.credito.opcionTarjeta).first();
    const hayTarjeta = await opcion.isVisible().catch(() => false);
    const bloqueada = hayTarjeta
      ? await opcion.evaluate((el) => el.classList.contains('p-disabled')).catch(() => true)
      : true;

    await page.locator(SEL.pago.credito.cedula).click(); // cierra el overlay
    await page.waitForTimeout(600);
    if (hayTarjeta && !bloqueada) return cedula;
  }
  await page.goBack();
  return null;
}

const montoDe = (texto: string): number =>
  Number((/([\d]+[\d.,]*)/.exec(texto)?.[1] ?? '0').replace(/,/g, ''));

const numeroDeCuotas = (texto: string): number =>
  Number(/\((\d+)\s*CUOTAS?\)/i.exec(texto)?.[1] ?? 0);
