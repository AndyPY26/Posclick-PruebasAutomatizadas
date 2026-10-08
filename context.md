# Context — Suite E2E POSCLICK

App: `http://localhost:4200` · FE/BE `1.12.0-rc.1` · Caja `004-112`

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
├── playwright.config.ts   # workers:1, retries:0, video+trace 'on', globalSetup
├── global-setup.ts        # libera entregas de caja pendientes
├── tsconfig.json
├── package.json
├── tests/
│   ├── pos-flujos-avanzados.spec.ts   # 5 casos (solo intención de negocio)
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

npm test                            # los 5 casos
npm run test:caso2                  # uno (caso1…caso5)
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
| Oferta Especial | autorización `H0867` + documento `0914848171` |

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

## Trucos no obvios

- **Swipe de supervisor:** escribir en el input *oculto* (el visible es `readonly`), con prefijo `%` y `\n` final, luego Enter. Sin el `%` → *"Formulario incompleto: cardNumber, frameData"*.
- **Dropdowns PrimeNG:** click en trigger → `ArrowDown` → `Enter`, **sin interrupciones** (un screenshot intermedio cierra el overlay).
- **Cambiar cliente:** primero `clear_button`; si hay uno asignado el campo de búsqueda no existe.
- **Ofertas Especiales** no es módulo del dashboard: lupa → "Cargar factura" → pestaña "Oferta Especial".
- **"Envío a"** (`/pos-ui/delivery`) = persona de retiro; usa el mismo componente que el cliente de facturación.
- Tras pagar puede aparecer **modal de regalo** → elegir uno → recalcular saldo.

## Estado conocido

| Caso | Estado |
|---|---|
| 1 Suspensión única | ✅ (restricción = botón `disabled`, no mensaje) |
| 2 Oferta Especial H0867 | ✅ completo |
| 3 Independencia clientes | ✅ + defecto D-01 |
| 4 Autorización supervisor | ✅ hasta pantalla |
| 5 Cuotas crédito | ❌ sin cédula con cupo |

**Defectos:** D-01 voucher *ENTREGA MERCADERIA (F4)* no reimprime (*"No hay documentos para imprimir"*) · D-02 suspensión sin feedback · D-03 créditos de prueba bloqueados/sobregirados · D-04 autorización repetitiva · D-05 código de oferta no visible en cobro.

**No verificable aquí:** contenido de documentos impresos (sin impresora ni preview).
