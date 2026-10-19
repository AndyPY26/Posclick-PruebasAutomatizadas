# Context — Suite E2E POSCLICK

App: `http://localhost:4200` · FE `1.13.0` / BE `1.13.0` (verificado 2026-10-16) · Caja `004-150`

> Historial: hasta 2026-10-15 era FE `1.12.0-rc.5` / BE `1.12.0-rc.3` en la caja `004-112`. Los selectores mapeados en rc.5 siguen vigentes en 1.13.0 salvo lo indicado en "Resumen de pago".
> Al cambiar de caja, un carrito abierto con la caja anterior falla con *"El id de la transacción no corresponde al posId/transaccionType"*: vaciarlo y empezar de nuevo.

**Acceso desde Windows:** túnel SSH a `pos4-dev` con los dos puertos (frontend + backend):
`ssh -fN -L 4200:localhost:4200 pos4-dev` y `ssh -fN -L 3000:localhost:3000 pos4-dev`. Sin el 3000 la app queda en blanco (`/api/configuration/v1/pos` falla). Si `curl` cuelga, matar los `ssh` zombis y relanzar.

## Reglas críticas

1. **El navegador debe correr en la misma máquina que la app.** El SSO usa `redirect_uri=http://localhost:4200`; con navegador remoto o túnel el retorno de sesión falla (~85%).
2. **`retries: 0`.** Cada caso mueve stock, caja y cupo de crédito reales. Un reintento duplica transacciones.
3. **Ejecución secuencial** (`fullyParallel: false`, `workers: 1`). La app tiene estado global de caja.
4. **Precondición obligatoria:** con entregas de caja pendientes, Facturación responde *"Acceso denegado"*. `global-setup.ts` las libera.
5. **Las pruebas de crédito consumen cupo real** y no son repetibles sin reponerlo.
6. **Mockear impresión** con `addInitScript` antes de navegar; sin impresora la app lanza *"Impresora no encontrada"* (ignorable).

## Estructura (POM)

```
e2e/
├── playwright.config.ts   # workers:1, retries:0, video 'on', trace 'retain-on-failure', globalSetup
├── global-setup.ts        # libera entregas de caja pendientes
├── tsconfig.json
├── package.json
├── tests/
│   ├── pos-flujos-avanzados.spec.ts   # 7 casos (solo intención de negocio)
│   ├── fixtures/
│   │   ├── dataset.ts                 # pools, credenciales, utilidades puras
│   │   └── pos.fixture.ts             # test.extend con `pos`
│   └── pages/                         # Page Object Model
│       ├── LoginPage.ts
│       ├── DashboardPage.ts
│       ├── InvoicePage.ts
│       ├── CargarFacturaDialog.ts
│       ├── DeliveryPage.ts
│       ├── PaymentPage.ts             # + CreditoPyccaForm
│       ├── SupervisorAuthDialog.ts
│       ├── SuspendedTxDialog.ts
│       ├── BoxDeliveryPage.ts
│       ├── PrintHistoryPage.ts
│       └── components/
│           └── PersonSearchComponent.ts
└── evidencias/            # video, trace, screenshots (generado)
```

**Patrón:** los tests consumen Pages (`invoice.cargarCarrito(...)`), no selectores. Los selectores viven DENTRO de la clase correspondiente. Al agregar un caso nuevo: si cae en una pantalla existente, nuevo método en la Page; si cae en una pantalla nueva, nueva clase bajo `tests/pages/`.

## Comandos

```bash
cd /home/sistemas/POS4/pycca-dockerized-solution/e2e

npm install
npx playwright install chromium
npx tsc --noEmit                    # sin salida = OK
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4200/login   # → 200

npm test                            # los 7 casos (modo serial: se detiene en el primer fallo)
npm run test:caso2                  # uno (caso1…caso7)
# Suite completa sin cortar en el primer fallo (uno por uno):
for c in 1 2 3 4 5 6 7; do npx playwright test -g "Caso $c:"; done
npm run test:headed
npm run report                      # HTML + videos + traces
npx playwright show-trace evidencias/test-results/**/trace.zip
```

## Datos de prueba

| Dato | Valor |
|---|---|
| SSO | `desarrollopy@pycca.com` / `cdPY2027!*` |
| Supervisor (trama lector) | `%21310300;432940;JAIME GABRIEL HURTADO ALVAREZ` + Enter |
| Clave supervisor | `1979` |
| Código vendedor | `41602` |
| Oferta Especial | `CREDENCIALES.ofertaEspecial` = `BG961` + `1709231169`. **Vencido en 004-150** (404). El anterior `H0867` + `0914848171` también da 404 |
| Crédito con cupo (verificado 2026-10-16) | `1200573622` (cupo $3,400) y `0916633472` (cupo $2,521.58) |

## Selectores clave (ubicación en POM)

Los selectores viven como campos privados de la Page correspondiente. Mapa rápido para saber dónde editar al cambiar el DOM:

| Selector | Vive en |
|---|---|
| `#mf_sale_product_list_table_suspended_sales_transaction` (suspender) | `InvoicePage.ts` |
| `#mf_prod_search_product_list_table_recover_suspended_sales_transactions` | `InvoicePage.ts` |
| `#mf_prod_search_product_list_table_find_invoice` (lupa → *Cargar factura*) | `InvoicePage.ts` |
| `#mf_sale_product_list_table_future_delivery` (entrega a futuro) | `InvoicePage.ts` |
| `#mf_person_customer_search_*` (persona) | `components/PersonSearchComponent.ts` |
| `#admin_authorization_card_scan_input` / `_pass_input` | `SupervisorAuthDialog.ts` |
| `#mf_pay_pycca_direct_credit_form_*` (crédito PYCCA) | `PaymentPage.ts` (clase `CreditoPyccaForm`) |
| `text=IR >> nth=0..4` (dashboard) | `DashboardPage.ts` |
| `input[placeholder="Ej: 123456"]`, `Ej: 1234567890` (oferta especial) | `CargarFacturaDialog.ts` |
| `#mf_sale_delivery_product_list_table_quantity_delivery_input_${sku}` | `DeliveryPage.ts` |
| `#mf_product_search_product_input` (buscador SKU) | `InvoicePage.ts` |
| `#mf_sale_button_accept` ("Continuar") / `#mf_sale_button_cancel` ("Regresar") | `InvoicePage.ts` |
| `#valueToPay input` (el id es del wrapper `p-inputnumber`) | `PaymentPage.ts` |
| `#button_agregar`, `[id="button_actions.continue"]` | `PaymentPage.ts` |
| `button.p-button-success:has-text("Procesar")` (modal "Procesando Pago") | `PaymentPage.ts` |
| `#mf_payment_methods_list_item_N` / `label[for=checkN]` (1=EFECTIVO, 5=CREDITO PYCCA) | `PaymentPage.ts` |
| `input#receivedAmount`, `input#paymentAmount`, `[id="button_actions.accept"]` (registro de efectivo) | `PaymentPage.ts` |
| `#mf_pay_recorded_payments_table_row_0_amount` (monto del pago registrado) | `PaymentPage.ts` (`CreditoPyccaForm`) |
| `table:has-text("Tienda Destino")` (tiendas con inventario) + `.p-inputnumber-increment-button` | `DeliveryPage.ts` |
| `#mf_sale_invoice_finder_invoice_document_type_select` (toggle Post Venta / Oferta Especial), `[id="button_invoice-finder.find-button"]` | `CargarFacturaDialog.ts` |

## Trucos no obvios

- **Swipe de supervisor:** escribir en el input *oculto* (el visible es `readonly`), con prefijo `%` y `\n` final, luego Enter. Sin el `%` → *"Formulario incompleto: cardNumber, frameData"*.
- **Dropdowns PrimeNG:** click en trigger → `ArrowDown` → `Enter`, **sin interrupciones** (un screenshot intermedio cierra el overlay). En `/pay` (1.13.0) el layout del panel derecho **intercepta el click** de los `p-select` de Crédito PYCCA: abrir con foco en `[role=combobox]` + Enter y elegir la opción con click DOM.
- **Contadores `p-inputnumber` (1.13.0):** `fill()` cambia el texto pero NO el model de Angular. Usar el botón `.p-inputnumber-increment-button` + Tab, o `pressSequentially`. Afecta entrega futura (Entrega y Cantidad por tienda), Recibido del registro de efectivo y Valor a pagar de crédito.
- **Cambiar cliente:** primero `clear_button`; si hay uno asignado el campo de búsqueda no existe.
- **Ofertas Especiales** no es módulo del dashboard: lupa → "Cargar factura" → pestaña "Oferta Especial".
- **"Envío a"** (`/pos-ui/delivery`) = persona de retiro; usa el mismo componente que el cliente de facturación.
- **Entrega futura (1.13.0):** (1) en el panel izquierdo subir "Entrega" del SKU con **+** y Tab → `POST /api/product/v1/check-inventory`; (2) la tabla "Productos disponibles" (Tienda · Ciudad · Inventario · Cantidad · Tienda Destino) lista tiendas con stock: subir "Cantidad" de una con **+** y Tab; (3) "Movimiento de unidades → Total Unidades" sube (la etiqueta y el número son nodos hermanos). Sin stock, la tabla dice "No se encontraron tiendas.".
- **Crédito PYCCA (1.13.0):** cédula + Tab → elegir tarjeta → foco en "Valor a pagar" + Tab (→ `POST /api/payment/v1/installments-plan` habilita Financiamiento) → elegir plan ("DIF. CON INTERESES - (N CUOTAS) $X" o "N CUOTAS-PAGA EN ENERO $X") → Agregar. Tras Agregar pueden salir "Actualización de datos clientes club Pycca" (`#areaCasa`, `#telefonoCasa`, `#celular`, `#mail1`; se **cancela** para no tocar datos reales, el pago se registra igual) y "Captaciones de seguros" (Seguro de Desgravamen $2.99, Cerrar).
- **Cargar factura → Oferta Especial:** es un toggle (`p-togglebutton`); "Post Venta" viene activo por defecto y un segundo click desactiva la opción elegida. Campos: "Número de autorización" (`Ej: 123456`) y "Número de documento" (`Ej: 1234567890`). Consulta `GET /api/offers/v1/special-offer?accessToken=…&customerId=…`; si no existe: aviso "Advertencia – No se encontraron datos.".
- **Reimpresión (D-01, 1.13.0):** "No hay documentos para imprimir" es un aviso **efímero** (pocos segundos tras la autorización); `PrintHistoryPage` lo escucha mientras autoriza (`sinDocumentosVisto`).
- **No correr dos suites a la vez en el servidor:** `npm run test:casoN` ejecuta `clean`, que borra `evidencias/test-results` y rompe los traces de la otra corrida (`ENOENT … .trace`); además comparten caja.
- Tras pagar puede aparecer **modal de regalo** → elegir uno → recalcular saldo. Desde rc.5 cada regalo es un `input[type=radio]` dentro del dialog (no `tbody tr`); "Aceptar" queda disabled hasta marcar uno.
- **Wrappers `lib-button` / `p-button` (rc.5):** `el.click()` sobre el custom element NO dispara el ngClick. Hay que clickear el `<button>` interno (helper `clickCustom` en `InvoicePage` / `PersonSearchComponent`). Afecta: suspender, entrega futura, recuperar suspendida, lupa cargar factura, buscar cliente, Agregar, Continuar de `/pay`.
- **Botones duplicados:** en `/invoice` y `/pay` hay un "Continuar" disabled en el header; `button:has-text("Continuar").first()` lo toma. Usar siempre los ids.
- **Buscador de persona en `/delivery`:** coexisten dos instancias con los mismos ids (facturación oculta + "Envío a"). Filtrar con `:visible`. `#mf_person_customer_search_add_button` = **agregar cliente nuevo**, no limpiar.
- **Suspender / Entrega futura** solo se renderizan con ≥1 producto en el carrito.
- **Pago en efectivo:** "Agregar" registra el pago como *Pendiente* sin modal. El modal **"Procesando Pago"** (botón verde "Procesar") aparece recién al pulsar "Continuar" del summary, uno por pago. Límite $2,000 por pago: con carritos mayores, el segundo "Agregar" no registra (sin resolver, ver D-07).
- **Regalo que cambia el total (1.13.0):** al pulsar "Continuar" en `/pay` puede aparecer "Seleccionar regalo" (promo *DECO – Compra x Compra Tiraderas*, tiraderas G03705/G03706 a $2.99). Elegir un regalo **suma su precio al total** y **deselecciona EFECTIVO**. Ejemplo reproducido: total $1,111.62 → $1,114.61, descuento $111.60 → $109.60, pendiente $0 → **$2.99**. Hay que volver a seleccionar EFECTIVO, pagar el pendiente y pulsar Continuar otra vez (`PaymentPage.pagarEnEfectivo` lo hace en rondas).

- **"Descuentos disponibles para el cliente" (1.13.0):** al asignar un cliente con descuento permanente/colaborador sale un modal informativo (tabla forma de pago / % / descripción) con solo "Aceptar". Si no se acepta, la asignación no se completa y "Continuar" del carrito queda deshabilitado. Lo cierra `PersonSearchComponent.cerrarDescuentosClienteSiAplica()` (también se llama en `InvoicePage.continuar()`).
- **"Registro de pago en efectivo" (1.13.0):** después de cada "Procesar" aparece este modal. Campos: `input#paymentAmount` (Pagar, deshabilitado), `input#receivedAmount` (Recibido *, `p-inputnumber`: hay que **teclear**, `fill` no sincroniza), `input#changeAmount` (Cambio), `#newBanknoteValue` + `#newBanknoteSerial` + Agregar (`#mf_pay_register_cash`) para registrar billetes de $50/$100. "Aceptar" = `[id="button_actions.accept"]`. **Registrar billetes no es obligatorio**: con Recibido ≥ Pagar se habilita Aceptar (probado con $14.99 y $1,500).
- **Final de venta:** modal "Transacción finalizada – Retire la factura y entregue al cliente" (Total / Recibido / Su cambio + Aceptar), y luego "Cierre de Cajón Monedero" (Aceptar). `cerrarDialogos()` los cierra.
- **Secuencia completa de pago en efectivo (1.13.0):** EFECTIVO → Agregar (hasta pendiente $0) → Continuar → [Seleccionar regalo → volver a EFECTIVO y pagar la diferencia → Continuar] → Procesando Pago (Procesar) → Registro de pago en efectivo (Recibido + Aceptar) → Transacción finalizada. Varios pagos en efectivo se consolidan en uno.

### Resumen de pago (`/pos-ui/pay`, FE 1.13.0)

Los valores del summary panel **no tienen id**. Se leen por estructura dentro de `[id^="summary_panel_body"]` (`PaymentPage.leerResumen()`):

| Campo | Estructura | Nota |
|---|---|---|
| Valor total | `<h2>Valor total</h2>` + `<h2>$X</h2>` | Incluye IVA y regalos agregados |
| Valor registrado | `<h2>Valor registrado</h2>` + `<h2>$X</h2>` | Suma de pagos en la tabla |
| Descuento | `<h2>Descuento</h2>` + `<h2>$X</h2>` | Puede venir negativo (`-$2.00`) |
| **Pendiente** | `<span>Pendiente</span>` + **único `<h1>`** del panel | **Monto exacto a pagar**; Continuar exige que sea $0 |

En `/pos-ui/invoice` el resumen sí tiene ids: `#mf_sale_discount_value`, `#mf_sale_subtotal_value`, `#mf_sale_taxable_base_value` (aparece **dos veces**: base IVA y base 0%), `#mf_sale_total_tax_value` (IVA 15%), `#mf_sale_total_value`. Total = base imponible + impuesto. No hay rubros de envío ni recargo en una venta en tienda.
- **Dashboard rc.5:** 16 módulos (nuevos: Abonos y Crédito Pycca, Cambio y devolución, Reverso de Abono). Los `nth` usados (0,3,4,8) siguen valiendo por casualidad.
- **"Factura en curso":** si un run aborta con carrito abierto, el dashboard bloquea Apertura con ese modal. Ir a Facturación → Regresar → "Sí, eliminar".

## Estado conocido

Estado final 2026-10-16 · FE 1.13.0 · caja 004-150 (cada caso corrido por separado en `pos4-dev`):

| Caso | Estado | Notas |
|---|---|---|
| 1 Suspensión única | ✅ | `SuspendedTxDialog` espera que cargue la tabla (antes contaba 0 radios) y su `modal` quedó acotado al `.p-dialog` |
| 2 Oferta Especial | ❌ **datos** | `GET /api/offers/v1/special-offer` → 404 para `BG961`/`1709231169` y para `H0867`/`0914848171` ("Advertencia – No se encontraron datos."). UI y selectores OK |
| 3 Independencia clientes | ✅ | Entrega futura con flujo +/Tab; carrito acotado (D-07); D-01 capturado como aviso efímero |
| 4 Autorización supervisor | ✅ | — |
| 5 Cuotas crédito | ✅ | `CreditoPyccaForm` reescrito (p-select por teclado, blur de "Valor a pagar", modales de datos de cliente y seguros); carrito de $500–$1,000 |
| 6 Venta efectivo + cliente | ✅ | Carrito $1,000–$1,500 (D-07); regalo +$2.99; sobrepago por descuento de colaborador (10% EFECTIVO) → borra y repaga (implementado, aún no ejercitado en corrida) |
| 7 Venta entrega futura efectivo | ✅ | Mismo flujo de entrega que el Caso 3 |

**Defectos:** D-01 voucher *ENTREGA MERCADERIA (F4)* no reimprime (*"No hay documentos para imprimir"*, aviso efímero en 1.13.0; el backend responde 200 a `/receipt/v1/reprint` y `/generatereceipts`) · D-02 suspensión sin feedback · D-03 créditos de prueba bloqueados/sobregirados · D-04 autorización repetitiva · D-05 código de oferta no visible en cobro · ~~D-06~~ **falso positivo** (2026-10-16): el POM llenaba los contadores con `fill()` y nunca consultaba inventario; en 004-150 sí hay stock de entrega (p.ej. M03493 en 21 tiendas, O22652 en 16) · D-07 con carrito > $2,000 en efectivo, el primer pago de $2,000 se registra pero los siguientes "Agregar" no (el botón se ve habilitado). Pendiente confirmar con FE la regla de pago dividido.

**Dataset ampliado (2026-10):** `SKU_POOL` crece de 32 → ~290 (familias O, D, M, L, A, Y). `CEDULA_POOL` crece de 24 → 33 incluyendo lote CLUB PYCCA - CREDITO con cédulas reales de clientes con tarjeta de crédito activa.

**No verificable aquí:** contenido de documentos impresos (sin impresora ni preview).
