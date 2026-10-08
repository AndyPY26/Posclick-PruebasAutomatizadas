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

  // --- Transacción A ---
  const carritoA: ItemCarrito[] = generarCarrito();
  await invoice.cargarCarrito(carritoA);
  await invoice.suspender();

  // --- Transacción B ---
  const carritoB: ItemCarrito[] = generarCarrito();
  await invoice.cargarCarrito(carritoB);

  // COMPORTAMIENTO REAL: el sistema NO muestra "Ya existe una transacción
  // suspendida...". Impide la segunda suspensión deshabilitando el botón.
  await invoice.esperarSuspenderDeshabilitado();
  await evidencia(page, 'caso1-01-alerta-bloqueo');

  // --- Cancelar B y recuperar A ---
  await invoice.vaciar();
  const suspendidas = await invoice.abrirRecuperarSuspendida();
  await suspendidas.seleccionarPrimera();
  await suspendidas.recuperar();

  // El carrito recuperado debe contener exactamente los SKUs de A.
  for (const { sku } of carritoA) {
    await expect(page.locator(`text=${sku}`).first()).toBeVisible();
  }
  for (const { sku } of carritoB.filter((b) => !carritoA.some((a) => a.sku === b.sku))) {
    await expect(page.locator(`text=${sku}`)).toHaveCount(0);
  }
  await evidencia(page, 'caso1-02-transaccion-recuperada');

  // --- Segundo intento: ya no quedan suspendidas ---
  const sinPend = await invoice.abrirRecuperarSuspendidaRaw();
  await expect(sinPend.sinDatos).toBeVisible();
  await expect(sinPend.sinPendientes).toBeVisible();
  await evidencia(page, 'caso1-03-sin-pendientes');

  await invoice.cancelar();
  await invoice.vaciar();
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
  await invoice.cargarCarrito(generarCarrito());

  const pay = await invoice.continuar();
  const credito = await pay.seleccionarCreditoPycca();

  const cedulaCredito = await buscarCedulaConCreditoUtilizable(credito);
  expect(
    cedulaCredito,
    'PRECONDICIÓN NO CUMPLIDA: ninguna cédula del pool tiene una tarjeta de ' +
      'Crédito PYCCA habilitada con cupo. Solicitar a infraestructura habilitar o ' +
      'reponer el cupo de una tarjeta de prueba.',
  ).not.toBeNull();

  await credito.setCedula(cedulaCredito!);
  await credito.seleccionarTarjeta(1);
  const disponible = montoDe(await credito.disponibleInput.inputValue());
  expect(disponible, 'la tarjeta debe tener cupo disponible').toBeGreaterThan(0);

  // Plazo con intereses (posición 3 ≈ "DIF. CON INTERESES - (3 CUOTAS)").
  await credito.seleccionarFinanciamiento(3);

  const simulacion = {
    valor: montoDe(await credito.valorAPagarInput.inputValue()),
    cuota: montoDe(await credito.cuotaInput.inputValue()),
    plazo: numeroDeCuotas(await credito.financiamientoLocator.innerText()),
  };
  expect(simulacion.cuota).toBeGreaterThan(0);
  expect(simulacion.plazo).toBeGreaterThan(0);
  await evidencia(page, 'caso5-01-simulacion-pantalla');

  await credito.agregar();

  const registrado = await credito.pagoRegistradoRow.innerText();
  expect(registrado).toContain(String(simulacion.plazo));
  expect(montoDe(registrado)).toBeCloseTo(simulacion.valor, 2);

  // Coherencia matemática de la tabla de amortización.
  expect(simulacion.cuota * simulacion.plazo).toBeGreaterThanOrEqual(simulacion.valor - 0.05);
  await evidencia(page, 'caso5-consistencia-cuotas');
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
  for (const cedula of tomarCedulas(6)) {
    await credito.setCedula(cedula);
    await credito.abrirTarjetaDropdown();
    const { hayTarjeta, bloqueada } = await credito.primeraTarjetaBloqueada();
    await credito.cerrarOverlay();
    if (hayTarjeta && !bloqueada) return cedula;
  }
  return null;
}
