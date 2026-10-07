import { Page, expect } from '@playwright/test';

/* ============================================================================
 * DATASET
 * ==========================================================================*/

export const SKU_POOL = [
  'O22652', 'O22654', 'O22655', 'O22657', 'O22955', 'O22976', 'O22977', 'O22978',
  'O22979', 'O23546', 'O23553', 'O24144', 'O28268', 'O48324', 'O48357', 'O60832',
  'O60854', 'O78081', 'D01461', 'D01463', 'D01848', 'D02228', 'D02229', 'D02352',
  'D02411', 'D02427', 'D02429', 'D02431', 'D02656', 'D03247', 'D04736', 'D04827',
] as const;

export const CEDULA_POOL = [
  '0919522151', '2450681438', '0922154976', '0914880208', '0923022339', '0922350863',
  '1200007126', '0925688160', '0928181148', '0923632020', '1205902859', '0916835226',
  '0962366118', '1203874142', '0916381197', '0604473249', '1305717074', '0200875334',
  '0905448874', '0914102827', '1200018669', '0918171810', '1300437223', '1311371452',
] as const;

export const CREDENCIALES = {
  sso: { email: 'desarrollopy@pycca.com', password: 'cdPY2027!*' },
  /** Trama tal como la emite el lector de banda magnética. */
  supervisor: {
    trama: '%21310300;432940;JAIME GABRIEL HURTADO ALVAREZ',
    clave: '1979',
    nombre: 'JAIME GABRIEL HURTADO ALVAREZ',
  },
  codigoVendedor: '41602',
  ofertaEspecial: { cedula: '0914848171', cupon: 'H0867' },
} as const;

export type ItemCarrito = { sku: string; cantidad: number };

/** Entre 10 y 12 SKUs distintos, cantidad aleatoria > 1 (2..5). */
export function generarCarrito(min = 10, max = 12): ItemCarrito[] {
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  return [...SKU_POOL]
    .sort(() => Math.random() - 0.5)
    .slice(0, n)
    .map((sku) => ({ sku, cantidad: Math.floor(Math.random() * 4) + 2 }));
}

export function tomarCedulas(n: number): string[] {
  return [...CEDULA_POOL].sort(() => Math.random() - 0.5).slice(0, n);
}

/* ============================================================================
 * SELECTORES — todos verificados contra POSCLICK 1.12.0-rc.1 (24/09/2026)
 * ==========================================================================*/

export const SEL = {
  login: {
    botonSSO: 'text=Iniciar Sesión con Microsoft',
    msEmail: 'input[type=email]',
    msNext: 'text=Next',
    msPassword: 'input[type=password]',
    msSignIn: 'text=Sign in',
    msStaySignedIn: 'text=Yes',
  },

  /** Orden de tarjetas en el dashboard 1.12.0-rc.1 (15 módulos). */
  dashboard: {
    buscador: 'input[placeholder="Buscar por título o descripción"]',
    irFacturacion: 'text=IR >> nth=0',
    irEntregaCaja: 'text=IR >> nth=3',
    irHistorialImpresion: 'text=IR >> nth=4',
    accesoDenegadoEntregas: 'text=/entregas de caja pendientes/i',
  },

  carrito: {
    buscarSku: 'input[placeholder="Buscar producto por SKU"]',
    infoPendiente: 'text=Pendiente',
    infoCompletado: 'text=Completado',
    cantidad: (sku: string) => `#mf_sale_product_list_table_quantity_${sku} input`,
    expandirFila: (sku: string) => `#mf_sale_product_list_table_expand_${sku}`,
    checkboxTodos: 'table input[type=checkbox]',
    // Barra de herramientas sobre la tabla
    suspender: '#mf_sale_product_list_table_suspended_sales_transaction',
    entregaFutura: '#mf_sale_product_list_table_future_delivery',
    entregaDomicilio: '#mf_sale_product_list_table_truck',
    // Recuperar vive junto al buscador de SKU (lleva badge rojo si hay pendientes)
    recuperarSuspendida: '#mf_prod_search_product_list_table_recover_suspended_sales_transactions',
    // Cupón de descuento (distinto de la Oferta Especial: ver SEL.ofertaEspecial)
    cuponInput: '#mf_sale_discount_code_input',
    cuponAplicar: '#mf_sale_discount_code_button',
    descuentoAutorizado: '#mf_sale_open_manager_discount_button',
    valorDescuento: '#mf_sale_discount_value',
    continuar: 'button:has-text("Continuar")',
    cancelar: 'button:has-text("Cancelar")',
    confirmarEliminar: 'button:has-text("Sí, eliminar")',
  },

  /**
   * Ofertas Especiales / Proformas.
   * NO es un módulo del dashboard: vive en la lupa junto al buscador de SKU,
   * que abre el diálogo "Cargar factura" con dos pestañas
   * (Post Venta | Oferta Especial).
   */
  ofertaEspecial: {
    abrirCargarFactura: '#mf_prod_search_product_list_table_find_invoice',
    dialogo: 'text=Cargar factura',
    tabOfertaEspecial: 'text=Oferta Especial',
    tabPostVenta: 'text=Post Venta',
    numeroAutorizacion: 'input[placeholder="Ej: 123456"]',
    numeroDocumento: 'input[placeholder="Ej: 1234567890"]',
    buscar: 'button:has-text("Buscar")',
    /** Título que confirma la proforma cargada. */
    tituloProforma: (autorizacion: string) =>
      `text=Factura Proforma (Oferta Especial) ${autorizacion}`,
  },

  infoAdicional: {
    homologacion: '#homologacion_0',
    imei: '#imei_0 input',
    marca: '#marca_0',
    modelo: '#modelo_0',
    continuar: 'button:has-text("Continuar")',
  },

  garantia: {
    toggle: '[role=switch]',
    codigoVendedor: 'input[placeholder="Código vendedor"]',
  },

  /** Mismo componente en /invoice (cliente facturación) y /delivery ("Envío a"). */
  persona: {
    tipoDoc: '#mf_person_customer_search_document_type',
    documento: '#mf_person_customer_search_document_number',
    buscar: '#mf_person_customer_search_find_button',
    limpiar: '#mf_person_customer_search_clear_button',
    agregar: '#mf_person_customer_search_add_button',
  },

  autorizacion: {
    modal: 'text=Autorización de Administrador',
    inputTarjeta: '#admin_authorization_card_scan_input',
    inputClave: '#admin_authorization_pass_input',
    confirmar: 'button:has-text("Confirmar")',
  },

  suspendidas: {
    modal: 'text=Transacciones suspendidas',
    radioPrimera: 'input[type=radio]',
    recuperar: 'button:has-text("Recuperar")',
    sinDatos: 'text=No se encontraron datos',
    sinPendientes: 'text=/No se encontraron transacciones suspendidas/i',
  },

  entregaFutura: {
    cantidadProducto: (sku: string) =>
      `input#mf_sale_delivery_product_list_table_quantity_delivery_input_${sku}`,
    buscarTienda: 'input[placeholder="Buscar tienda"]',
    cantidadTienda: (tienda: string) => `tr:has-text("${tienda}") input[role=spinbutton]`,
    abrirCalendario: 'button[aria-label="Elige fecha"]',
    diaHabilitado: 'span.p-datepicker-day:not(.p-disabled)',
    telefono: 'input[placeholder="09xxxxxxxx"]',
    continuar: 'button:has-text("Continuar")',
  },

  pago: {
    efectivo: 'text=EFECTIVO',
    creditoPycca: 'text=CREDITO PYCCA',
    agregar: 'button:has-text("Agregar")',
    continuar: 'button:has-text("Continuar")',
    procesar: 'button:has-text("Procesar")',
    aceptar: 'button:has-text("Aceptar")',
    aceptarDialogo: 'p-dialog button:has-text("Aceptar")',
    recibido: 'input[placeholder="$0.00"] >> nth=1',
    transaccionFinalizada: 'text=Transacción finalizada',
    recalcular: '#mf_pay_recorded_payments_table_row_0_actions_recalculate',
    ajusteRequerido: 'text=Ajuste de pagos requerido',
    // Modal de regalo por promoción
    modalRegalo: 'text=Seleccionar regalo',
    // Formulario Crédito PYCCA
    credito: {
      cedula: '#mf_pay_pycca_direct_credit_form_identification_number_input',
      tarjetaSelect: '#mf_pay_pycca_direct_credit_form_credit_select',
      disponible: '#mf_pay_pycca_direct_credit_form_credit_available_input',
      valorAPagar: '#mf_pay_pycca_direct_credit_form_value_to_pay_input',
      financiamiento: '#mf_pay_pycca_direct_credit_form_financing_select',
      cuota: '#mf_pay_pycca_direct_credit_form_fee_value_input',
      agregar: '#mf_pay_pycca_direct_credit_form_add_button',
      /** Una tarjeta bloqueada se marca con p-disabled + icono pi-lock. */
      opcionTarjeta: 'li[role=option]',
    },
  },

  entregaCaja: {
    fecha: 'text=Fecha',
    procesar: 'button:has-text("Procesar")',
    exito: 'text=/fue entregada con éxito/i',
  },

  historial: {
    filaFactura: 'tr:has-text("FACTURA") input[type=radio]',
    filaVoucher: 'tr:has-text("ENTREGA MERCADERIA") input[type=radio]',
    imprimir: 'button:has-text("Imprimir")',
    sinDocumentos: 'text=No hay documentos para imprimir',
    impresoraNoEncontrada: 'text=Impresora no encontrada',
  },
} as const;

/* ============================================================================
 * HELPERS
 * ==========================================================================*/

export async function mockImpresion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.print = () => console.log('[MOCK_PRINT] Impresión interceptada con éxito');
  });
}

/**
 * Login SSO (Azure AD / MSAL).
 * El navegador DEBE correr en la misma máquina: redirect_uri=http://localhost:4200.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'load' });
  await page.locator(SEL.login.botonSSO).first().click();
  await page.locator(SEL.login.msEmail).first().waitFor({ state: 'visible' });
  await page.locator(SEL.login.msEmail).first().fill(CREDENCIALES.sso.email);
  await page.locator(SEL.login.msNext).first().click();
  await page.locator(SEL.login.msPassword).first().waitFor({ state: 'visible' });
  await page.locator(SEL.login.msPassword).first().fill(CREDENCIALES.sso.password);
  await page.locator(SEL.login.msSignIn).first().click();
  await page.locator(SEL.login.msStaySignedIn).first().click({ timeout: 8_000 }).catch(() => undefined);
  await page.waitForURL(/localhost:4200/, { timeout: 90_000 });
  // El modal "Inicio de día — Verificando actualizaciones pendientes" se cierra solo.
  await page.waitForTimeout(4_000);
  await expect(page.locator(SEL.dashboard.irFacturacion)).toBeVisible({ timeout: 30_000 });
}

/**
 * PRECONDICIÓN CRÍTICA: con entregas de caja pendientes, Facturación responde
 * "Acceso denegado". Libera la caja antes de cualquier caso de venta.
 * Es idempotente: si no hay nada pendiente, no hace nada.
 */
export async function liberarEntregasCajaPendientes(page: Page): Promise<void> {
  for (let intento = 0; intento < 5; intento++) {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(3_000);
    await page.locator(SEL.dashboard.irFacturacion).click();
    await page.waitForTimeout(3_000);

    if (page.url().includes('/pos-ui/invoice')) return; // caja limpia

    // Bloqueado → procesar la entrega de caja pendiente
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(3_000);
    await page.locator(SEL.dashboard.irEntregaCaja).click();
    await page.waitForURL(/box-delivery/, { timeout: 30_000 });
    await page.locator(SEL.entregaCaja.procesar).first().click();
    await autorizarSupervisor(page);
    await page.waitForTimeout(5_000);
    await cerrarDialogos(page);
  }
  throw new Error('No se pudo liberar la caja tras 5 intentos');
}

/**
 * Inyecta la trama del lector de banda magnética.
 *
 * Detalles descubiertos en reconocimiento:
 *  - El input visible es `readonly`; hay que escribir en el input REAL oculto.
 *  - La trama necesita el prefijo `%` y un salto de línea final, más Enter.
 *    Sin el `%` la app responde "Formulario incompleto: cardNumber, frameData".
 */
export async function autorizarSupervisor(page: Page): Promise<void> {
  const tarjeta = page.locator(SEL.autorizacion.inputTarjeta);
  await tarjeta.waitFor({ state: 'attached', timeout: 25_000 });
  await tarjeta.fill(`${CREDENCIALES.supervisor.trama}\n`);
  await tarjeta.press('Enter');
  await page.waitForTimeout(1_000);
  await page.locator(SEL.autorizacion.inputClave).fill(CREDENCIALES.supervisor.clave);
  await page.waitForTimeout(300);
  await page.locator(SEL.autorizacion.confirmar).first().click();
  await page.waitForTimeout(3_000);
}

/** Carga el carrito resolviendo la info adicional (IMEI) cuando el SKU la exige. */
export async function cargarCarrito(page: Page, items: ItemCarrito[]): Promise<void> {
  for (const { sku, cantidad } of items) {
    await page.locator(SEL.carrito.buscarSku).fill(sku);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2_000);

    const pendiente = page.locator(SEL.carrito.infoPendiente).first();
    if (await pendiente.isVisible().catch(() => false)) {
      await pendiente.click();
      await page.locator(SEL.infoAdicional.homologacion).fill('HOM-2026-001');
      await page.locator(SEL.infoAdicional.imei).fill(generarImei());
      await page.locator(SEL.infoAdicional.marca).fill('GENERICA');
      await page.locator(SEL.infoAdicional.modelo).fill('MODELO-TEST');
      await page.locator(SEL.infoAdicional.continuar).first().click();
      await page.waitForTimeout(1_000);
    }

    if (cantidad > 1) {
      const input = page.locator(SEL.carrito.cantidad(sku));
      await input.fill(String(cantidad));
      await input.press('Tab');
      await page.waitForTimeout(600);
    }
  }
}

export function generarImei(): string {
  return `3597475${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

/**
 * Asigna una persona (cliente de facturación en /invoice, "Envío a" en /delivery).
 * Si ya hay una asignada hay que limpiarla primero, o el campo de búsqueda no existe.
 */
export async function asignarPersona(
  page: Page,
  documento: string,
  tipo: 'CC' | 'RUC' = 'CC',
): Promise<void> {
  const limpiar = page.locator(SEL.persona.limpiar);
  if (await limpiar.isVisible().catch(() => false)) {
    await limpiar.click();
    await page.waitForTimeout(1_500);
  }
  if (tipo === 'RUC') {
    await page.locator(SEL.persona.tipoDoc).first().click();
    await page.locator('text=RUC').first().click();
  }
  await page.locator(SEL.persona.documento).fill(documento);
  await page.locator(SEL.persona.buscar).click();
  await page.waitForTimeout(2_500);
}

/**
 * Selecciona una opción de un dropdown PrimeNG.
 * El click directo sobre el texto lo intercepta <p-selectitem>; el teclado sí
 * funciona, pero la secuencia NO puede interrumpirse (un screenshot o un dump
 * intermedio cierran el overlay).
 */
export async function seleccionarEnDropdown(
  page: Page,
  trigger: string,
  posicion = 1,
): Promise<void> {
  await page.locator(trigger).first().click();
  await page.waitForTimeout(1_500);
  for (let i = 0; i < posicion; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2_000);
}

/** Cierra diálogos de hardware ausente (impresora / cajón monedero) y confirmaciones. */
export async function cerrarDialogos(page: Page, veces = 3): Promise<void> {
  for (let i = 0; i < veces; i++) {
    const aceptar = page.locator(SEL.pago.aceptarDialogo).first();
    if (await aceptar.isVisible().catch(() => false)) {
      await aceptar.click().catch(() => undefined);
      await page.waitForTimeout(1_500);
    }
  }
}

/** Vacía el carrito en curso (Cancelar → "Sí, eliminar"). Idempotente. */
export async function vaciarCarrito(page: Page): Promise<void> {
  const cancelar = page.locator(SEL.carrito.cancelar).last();
  if (!(await cancelar.isVisible().catch(() => false))) return;
  await cancelar.click();
  await page.waitForTimeout(1_200);
  await page.locator(SEL.carrito.confirmarEliminar).first().click().catch(() => undefined);
  await page.waitForTimeout(2_500);
}

/**
 * Cierra la venta pagando en efectivo. Contempla los dos interruptores que la
 * app puede intercalar: el modal de regalo por promoción y el recálculo de
 * pagos que ese regalo provoca.
 */
export async function pagarEnEfectivo(page: Page): Promise<void> {
  await page.locator(SEL.pago.efectivo).first().click();
  await page.waitForTimeout(1_500);
  await page.locator(SEL.pago.agregar).first().click();
  await page.waitForTimeout(2_000);
  await page.locator(SEL.pago.continuar).first().click();
  await page.waitForTimeout(3_000);

  // Promoción: elegir un regalo y aceptar.
  if (await page.locator(SEL.pago.modalRegalo).isVisible().catch(() => false)) {
    await page.locator('tbody tr').first().click();
    await page.waitForTimeout(1_000);
    await page.locator(SEL.pago.aceptarDialogo).last().click();
    await page.waitForTimeout(3_000);

    // El regalo cambia el total → cubrir el saldo restante.
    await page.locator(SEL.pago.efectivo).first().click();
    await page.waitForTimeout(1_500);
    await page.locator(SEL.pago.agregar).first().click();
    await page.waitForTimeout(2_000);
    await page.locator(SEL.pago.continuar).first().click();
    await page.waitForTimeout(3_000);
  }

  await page.locator(SEL.pago.procesar).first().click();
  await page.waitForTimeout(3_000);

  const recibido = page.locator(SEL.pago.recibido);
  if (await recibido.isVisible().catch(() => false)) {
    const aPagar = await page.locator('input[placeholder="$0.00"]').first().inputValue();
    await recibido.fill(aPagar.replace(/[^0-9.]/g, ''));
    await recibido.press('Tab');
    await page.waitForTimeout(1_200);
    await page.locator(SEL.pago.aceptarDialogo).first().click();
  }

  await expect(page.locator(SEL.pago.transaccionFinalizada)).toBeVisible({ timeout: 90_000 });
}

export async function evidencia(page: Page, nombre: string): Promise<void> {
  await page.screenshot({ path: `./evidencias/${nombre}.png`, fullPage: true });
}
