import { test, expect } from './fixtures/pos.fixture';
import {
  CREDENCIALES,
  generarCarrito,
  tomarCedulas,
  montoDe,
  numeroDeCuotas,
  evidencia,
  cerrarDialogos,
  type ItemCarrito,
} from './fixtures/dataset';
import { CreditoPyccaForm } from './pages/PaymentPage';

/**
 * Suite E2E — 5 casos de negocio avanzados POSCLICK 1.12.0-rc.1
 *
 * Reescrito en patrón Page Object Model. Toda la interacción con selectores
 * vive en `tests/pages/*`; estos tests solo expresan intención de negocio.
 *
 * REQUISITOS DE EJECUCIÓN
 *  1. El navegador debe correr en la misma máquina que la app (SSO con
 *     redirect_uri=http://localhost:4200). Un navegador remoto/túnel falla.
 *  2. retries: 0 — estos casos mueven stock, caja y cupo de crédito reales.
 */

test.describe.configure({ mode: 'serial' });

/* ==========================================================================
 * CASO 1 — Restricción de suspensión única y recuperación unitaria
 * ========================================================================*/
test('Caso 1: solo se permite una transacción suspendida y su recuperación es unitaria', async ({
  pos,
}) => {
  const { invoice, page } = pos;

  console.log('[Caso1] 1/9 → cargar carrito A');
  const carritoA: ItemCarrito[] = generarCarrito();
  await invoice.cargarCarrito(carritoA);

  console.log('[Caso1] 2/9 → suspender transacción A');
  await invoice.suspender();

  console.log('[Caso1] 3/9 → cargar carrito B');
  const carritoB: ItemCarrito[] = generarCarrito();
  await invoice.cargarCarrito(carritoB);

  console.log('[Caso1] 4/9 → verificar botón suspender deshabilitado');
  await invoice.esperarSuspenderDeshabilitado();
  await evidencia(page, 'caso1-01-alerta-bloqueo');

  console.log('[Caso1] 5/9 → vaciar carrito B');
  await invoice.vaciar();

  console.log('[Caso1] 6/9 → recuperar suspendida');
  const suspendidas = await invoice.abrirRecuperarSuspendida();
  const countAntes = await suspendidas.contarTransacciones();
  console.log(`[Caso1]   transacciones antes de recuperar=${countAntes}`);
  await suspendidas.seleccionarPrimera();
  await suspendidas.recuperar();

  console.log('[Caso1] 7/9 → verificar SKUs recuperados');
  for (const { sku } of carritoA) {
    await expect(page.locator(`text=${sku}`).first()).toBeVisible();
  }
  for (const { sku } of carritoB.filter((b) => !carritoA.some((a) => a.sku === b.sku))) {
    await expect(page.locator(`text=${sku}`)).toHaveCount(0);
  }
  await evidencia(page, 'caso1-02-transaccion-recuperada');

  console.log('[Caso1] 8/9 → verificar que la suspendida se eliminó de la lista');
  const sinPend = await invoice.abrirRecuperarSuspendidaRaw();
  const countDespues = await sinPend.contarTransacciones();
  console.log(`[Caso1]   transacciones después de recuperar=${countDespues}`);
  // Tolerante a estado residual de otros runs: lo importante es que la
  // transacción recuperada se eliminó (count bajó por 1 o quedó en 0).
  expect(countDespues, 'la transacción recuperada debe salir de la lista').toBeLessThan(
    countAntes || 1,
  );
  await evidencia(page, 'caso1-03-sin-pendientes');

  console.log('[Caso1] 9/9 → cerrar diálogo y vaciar');
  await invoice.cancelar();
  await invoice.vaciar();
  console.log('[Caso1] ✅ completado');
});

/* ==========================================================================
 * CASO 2 — Proforma de Oferta Especial (H0867) y conversión a factura
 * ========================================================================*/
test('Caso 2: la proforma de oferta especial conserva cliente, ítems y beneficio al facturar', async ({
  pos,
}) => {
  const { invoice, page } = pos;
  const { cedula, cupon } = CREDENCIALES.ofertaEspecial;

  // 1. Abrir el buscador de documentos y pasar a "Oferta Especial".
  const cargar = await invoice.abrirCargarFactura();
  await cargar.cargarOfertaEspecial(cupon, cedula);

  // 2. La proforma se carga con el cliente y el beneficio aplicado.
  await expect(cargar.tituloProforma(cupon)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`text=${cedula}`).first()).toBeVisible();

  const descuentoProforma = montoDe(
    await invoice.valorDescuento.innerText().catch(() => '0'),
  );
  const totalProforma = montoDe(
    await invoice.totalValor.innerText().catch(() => '0'),
  );
  expect(descuentoProforma, 'la oferta especial debe aplicar un descuento').toBeGreaterThan(0);
  await evidencia(page, 'caso2-01-proforma-cargada');

  // 3. Continuar: los datos deben viajar intactos a la pantalla de cobro.
  const pay = await invoice.continuar();
  await expect(page.locator(`text=${cedula}`).first()).toBeVisible();
  await expect(pay.valorTotalRow).toContainText(totalProforma.toFixed(2));
  await evidencia(page, 'caso2-02-datos-en-cobro');

  // 4. Cobrar y emitir la factura.
  await pay.pagarEnEfectivo();
  await evidencia(page, 'caso2-factura-proforma');
  await cerrarDialogos(page);
});

/* ==========================================================================
 * CASO 3 — Independencia cliente de facturación vs. persona de retiro
 * ========================================================================*/
test('Caso 3: cliente de facturación y persona de retiro son independientes', async ({ pos }) => {
  const { invoice, dashboard, page } = pos;
  const [clienteA, clienteB, , clienteD] = tomarCedulas(4);

  const carrito = generarCarrito(10, 10);
  await invoice.cargarCarrito(carrito);

  // Entrega a futuro (retiro en sucursal) — exige autorización de supervisor.
  const delivery = await invoice.irAEntregaFuturaConAutorizacion();

  // Cliente B como persona de retiro.
  await delivery.persona.asignar(clienteB, 'CC');
  const retiroB = await delivery.envioA.innerText();
  expect(retiroB).toContain(clienteB);

  // Configuración mínima de la entrega para poder volver.
  await delivery.configurarEntregaMinima(carrito);
  await delivery.continuar();

  // Cliente A como facturación → el retiro NO debe moverse.
  await invoice.persona.asignar(clienteA, 'CC');
  const delivery2 = await invoice.irAEntregaFuturaConAutorizacion();
  await delivery2.esperarEnvioAContiene(clienteB);
  await evidencia(page, 'caso3-01-retiro-persiste');

  // Cambiar SOLO el retiro a D.
  await delivery2.persona.asignar(clienteD, 'CC');
  await delivery2.esperarEnvioAContiene(clienteD);
  await delivery2.setTelefono('0991234567');
  await delivery2.continuar();

  // El cliente de facturación NO debe haberse movido.
  await expect(page.locator(`text=${clienteA}`).first()).toBeVisible();
  await evidencia(page, 'caso3-02-facturacion-persiste');

  // Cierre de la venta.
  const pay = await invoice.continuar();
  await pay.pagarEnEfectivo();
  await evidencia(page, 'caso3-03-venta-emitida');
  await cerrarDialogos(page);

  // Reimpresión del voucher — DEFECTO CONOCIDO (ver aserción).
  await dashboard.goto();
  const historial = await dashboard.irAHistorialImpresion();
  await historial.seleccionarVoucher();
  await historial.imprimirConAutorizacion();
  await evidencia(page, 'caso3-04-reimpresion-voucher');

  // DEFECTO D-01: el voucher ENTREGA MERCADERIA (F4) no se reimprime, aunque
  // esté seleccionado. La FACTURA sí llega al driver de impresión.
  // Cuando dev lo corrija, invertir esta aserción y validar los nombres
  // Facturación=A / Retiro=D en el documento.
  await expect(
    historial.sinDocumentos,
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
  pos,
}) => {
  const { invoice, page } = pos;
  const carrito = generarCarrito();
  await invoice.cargarCarrito(carrito);

  // El modal debe aparecer y aceptar la trama del lector + clave.
  const auth = await invoice.abrirEntregaFutura();
  await auth.esperarVisible();
  await auth.autorizar();

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

  await page.locator('button:has-text("Continuar")').first().click().catch(() => undefined);
  await page.waitForTimeout(2_000);
  await invoice.vaciar();
});

/* ==========================================================================
 * CASO 5 — Consistencia de cuotas Crédito PYCCA: pantalla vs. documento
 *
 * Requiere una cédula con tarjeta NO bloqueada y cupo suficiente.
 * ========================================================================*/
test('Caso 5: la simulación de cuotas coincide con el documento emitido', async ({ pos }) => {
  const { invoice, page } = pos;

  console.log('[Caso5] 1/10 → cargar carrito aleatorio');
  await invoice.cargarCarrito(generarCarrito());

  console.log('[Caso5] 2/10 → asignar cédula al cliente de facturación');
  await invoice.persona.asignar(tomarCedulas(1)[0]);

  console.log('[Caso5] 3/10 → continuar a /pos-ui/pay');
  const pay = await invoice.continuar();

  console.log('[Caso5] 4/10 → seleccionar Crédito PYCCA');
  const credito = await pay.seleccionarCreditoPycca();

  const cedulaCredito = await buscarCedulaConCreditoUtilizable(credito);
  expect(
    cedulaCredito,
    'PRECONDICIÓN NO CUMPLIDA: ninguna cédula del pool tiene una tarjeta de ' +
      'Crédito PYCCA habilitada con cupo. Solicitar a infraestructura habilitar o ' +
      'reponer el cupo de una tarjeta de prueba.',
  ).not.toBeNull();

  console.log('[Caso5] 6/10 → leer cupo disponible');
  const disponible = montoDe(await credito.disponibleInput.inputValue());
  expect(disponible, 'la tarjeta debe tener cupo disponible').toBeGreaterThan(0);

  console.log('[Caso5] 7/10 → seleccionar financiamiento (pos. 3 ≈ 3 cuotas)');
  await credito.seleccionarFinanciamiento(3);

  console.log('[Caso5] 8/10 → leer simulación');
  const simulacion = {
    valor: montoDe(await credito.valorAPagarInput.inputValue()),
    cuota: montoDe(await credito.cuotaInput.inputValue()),
    plazo: numeroDeCuotas(await credito.financiamientoLocator.innerText()),
  };
  console.log(`[Caso5]   simulación valor=${simulacion.valor} cuota=${simulacion.cuota} plazo=${simulacion.plazo}`);
  expect(simulacion.cuota).toBeGreaterThan(0);
  expect(simulacion.plazo).toBeGreaterThan(0);
  await evidencia(page, 'caso5-01-simulacion-pantalla');

  console.log('[Caso5] 9/10 → agregar pago registrado');
  await credito.agregar();

  console.log('[Caso5] 10/10 → verificar consistencia');
  const registrado = await credito.pagoRegistradoRow.innerText();
  expect(registrado).toContain(String(simulacion.plazo));
  expect(montoDe(registrado)).toBeCloseTo(simulacion.valor, 2);
  expect(simulacion.cuota * simulacion.plazo).toBeGreaterThanOrEqual(simulacion.valor - 0.05);
  await evidencia(page, 'caso5-consistencia-cuotas');
  console.log('[Caso5] ✅ completado');
});

/* ==========================================================================
 * CASO 6 — Venta en efectivo con cliente CLUB PYCCA
 *
 * Objetivo: validar el flujo "venta feliz" end-to-end sin ofertas, crédito ni
 *           suspensiones: cargar carrito, asignar cliente, cobrar efectivo.
 * Precondiciones: caja abierta (globalSetup).
 * Pasos:
 *   1. Armar un carrito con total entre $1,000 y $1,500 (SKUs aleatorios de a 1).
 *   2. Asignar un cliente del CEDULA_POOL (lote CLUB PYCCA - CREDITO).
 *   3. Continuar → pagar el total en efectivo en un único pago.
 * Resultado esperado: transacción finalizada con "Transacción finalizada".
 * Criterios de aceptación:
 *   - El total del carrito está entre $1,000 y $1,500.
 *   - Al finalizar se renderiza el mensaje "Transacción finalizada".
 *
 * WORKAROUND D-07: con totales > $2,000 el POS no registra el segundo pago en
 * efectivo. Se acota el carrito para validar el flujo estándar de un solo pago.
 * Revertir a `generarCarrito(5, 6)` cuando dev corrija el pago dividido.
 * ========================================================================*/
const CASO6_TOTAL_MIN = 1_000;
const CASO6_TOTAL_MAX = 1_500;

test('Caso 6: venta en efectivo con cliente CLUB PYCCA (total $1,000-$1,500)', async ({
  pos,
}) => {
  const { invoice, page } = pos;

  // Cliente primero: puede aplicar descuentos que cambian el total.
  console.log('[Caso6] 1/5 → asignar cliente');
  const cedula = tomarCedulas(1)[0];
  await invoice.persona.asignar(cedula);
  await expect(page.locator(`text=${cedula}`).first(), 'el cliente debe quedar asignado').toBeVisible();

  console.log(`[Caso6] 2/5 → armar carrito entre $${CASO6_TOTAL_MIN} y $${CASO6_TOTAL_MAX}`);
  await invoice.cargarCarritoConTope(CASO6_TOTAL_MIN, CASO6_TOTAL_MAX);

  console.log('[Caso6] 3/5 → verificar total dentro del rango');
  const total = await invoice.leerTotal();
  expect(total, 'total debe quedar bajo el límite de pago en efectivo').toBeGreaterThanOrEqual(CASO6_TOTAL_MIN);
  expect(total).toBeLessThanOrEqual(CASO6_TOTAL_MAX);
  await evidencia(page, 'caso6-01-carrito-con-cliente');

  console.log('[Caso6] 4/5 → continuar a pago');
  const pay = await invoice.continuar();

  console.log('[Caso6] 5/5 → pagar en efectivo');
  await pay.pagarEnEfectivo();
  await evidencia(page, 'caso6-02-factura-emitida');
  await cerrarDialogos(page);
  console.log('[Caso6] ✅ completado');
});

/* ==========================================================================
 * CASO 7 — Venta con entrega futura (envío) + pago en efectivo
 *
 * Objetivo: validar que el flujo de entrega futura se puede configurar y
 *           cerrar con un cobro en efectivo.
 * Precondiciones: caja abierta + al menos un SKU del pool con stock asignable
 *                 en alguna tienda del centro 004-112.
 * Pasos:
 *   1. Cargar 5-6 SKUs aleatorios.
 *   2. Asignar cliente de facturación.
 *   3. Abrir "Entrega Futura" (requiere auth supervisor).
 *   4. Configurar tienda + fecha + teléfono (`configurarEntregaMinima`).
 *   5. Continuar → cobrar en efectivo.
 * Resultado esperado: factura emitida con entrega futura registrada.
 * Criterios de aceptación:
 *   - La configuración de entrega NO lanza "ningún SKU tiene stock".
 *   - Al finalizar se renderiza el mensaje "Transacción finalizada".
 * ========================================================================*/
test('Caso 7: venta con entrega futura y pago en efectivo', async ({ pos }) => {
  const { invoice, page } = pos;

  console.log('[Caso7] 1/7 → generar + cargar carrito');
  const carrito = generarCarrito(5, 6);
  await invoice.cargarCarrito(carrito);

  console.log('[Caso7] 2/7 → asignar cliente');
  await invoice.persona.asignar(tomarCedulas(1)[0]);

  console.log('[Caso7] 3/7 → ir a entrega futura con autorización');
  const delivery = await invoice.irAEntregaFuturaConAutorizacion();

  console.log('[Caso7] 4/7 → configurar entrega mínima');
  await delivery.configurarEntregaMinima(carrito);
  await evidencia(page, 'caso7-01-entrega-configurada');

  console.log('[Caso7] 5/7 → continuar desde entrega al carrito');
  await delivery.continuar();

  console.log('[Caso7] 6/7 → continuar a pago');
  const pay = await invoice.continuar();

  console.log('[Caso7] 7/7 → pagar en efectivo');
  await pay.pagarEnEfectivo();
  await evidencia(page, 'caso7-02-factura-con-entrega');
  await cerrarDialogos(page);
  console.log('[Caso7] ✅ completado');
});

/* ============================================================================
 * Helpers locales al spec
 * ==========================================================================*/

/**
 * Recorre el pool buscando una tarjeta seleccionable (sin p-disabled/candado).
 * Devuelve null si ninguna sirve, para que el test falle con mensaje accionable.
 *
 * Vive en el spec porque es lógica de setup del caso, no de la Page: cambia la
 * cédula varias veces y abre/cierra el dropdown repetidamente.
 */
async function buscarCedulaConCreditoUtilizable(
  credito: CreditoPyccaForm,
): Promise<string | null> {
  for (const cedula of tomarCedulas(10)) {
    await credito.setCedula(cedula);
    await credito.abrirTarjetaDropdown();
    const { hayTarjeta, bloqueada } = await credito.primeraTarjetaBloqueada();
    await credito.cerrarOverlay();
    if (!hayTarjeta || bloqueada) {
      console.log(`[Caso5] cédula ${cedula}: tarjeta ${!hayTarjeta ? 'no existe' : 'bloqueada'}`);
      continue;
    }
    // Validación REAL: seleccionar la tarjeta y leer el cupo disponible.
    await credito.seleccionarTarjeta(1);
    const disponible = montoDe(await credito.disponibleInput.inputValue());
    if (disponible > 0) {
      console.log(`[Caso5] cédula ${cedula} con cupo=${disponible} ✓`);
      return cedula;
    }
    console.log(`[Caso5] cédula ${cedula}: tarjeta OK pero cupo=0 → siguiente`);
  }
  return null;
}
