# Análisis técnico — Suite E2E POSCLICK

> Documento de arquitectura y mantenimiento de la suite de automatización
> (Playwright + TypeScript, patrón Page Object Model + Data-Driven Testing).
>
> **Alcance del análisis:** 22 archivos, ~2.960 líneas de TypeScript.
> **Fecha:** 2026-10-28 · **Commit base:** `9bbd8a7` (Pruebas ajustadas)
>
> **Actualizado 2026-10-29** (rama `refactor/dashboard-y-clicks`): se resolvieron
> las dos primeras observaciones de la sección 6 — `DashboardPage` ya no depende
> del orden de las tarjetas y el adapter de clicks quedó unificado en
> `dataset.ts`. Las secciones 1.2, 2.3, 3.3, 5.2 y 6 reflejan ese estado.

## Índice

1. [Arquitectura y patrones de diseño](#1-arquitectura-y-patrones-de-diseño)
2. [Desglose por clase y módulo](#2-desglose-por-clase-y-módulo)
3. [Variables, locators y estado](#3-variables-locators-y-estado)
4. [Tipado y características de TypeScript](#4-tipado-y-características-de-typescript)
5. [Guía rápida de modificación](#5-guía-rápida-de-modificación)
6. [Observaciones de mantenimiento](#6-observaciones-de-mantenimiento)

---

# 1. Arquitectura y patrones de diseño

## 1.1 Capas

```
playwright.config.ts ──► dotenv + flags de argv (process.env)
        │
        ├─ global-setup.ts ──────────► precondición global (caja abierta, centro detectado)
        │
        └─ workers (1) ──► tests/pos-flujos-avanzados.spec.ts   ← CAPA DE INTENCIÓN
                                │  (solo lenguaje de negocio, cero selectores)
                                ▼
                     tests/fixtures/pos.fixture.ts               ← COMPOSITION ROOT / DI
                                │  (arma el grafo de Page Objects por test)
                                ▼
                     tests/pages/*.ts                            ← PAGE OBJECTS
                                │  (único lugar con selectores y DOM)
                                ├─ pages/components/*.ts         ← COMPONENT OBJECTS
                                ▼
                     tests/fixtures/dataset.ts + centros.ts      ← DATOS Y HELPERS PUROS
                                   (sin DOM, salvo 4 helpers utilitarios)
```

La regla de dependencia es unidireccional y se respeta casi perfectamente:
**spec → fixture → pages → dataset**. La única excepción deliberada es que
`dataset.ts` recibe un `Page` en cuatro helpers (`evidencia`, `cerrarDialogos`,
`seleccionarEnDropdown`, `mockImpresion`), documentado en el encabezado del archivo.

## 1.2 Patrones implementados

| Patrón | Dónde | Implementación concreta |
|---|---|---|
| **Page Object Model** | `tests/pages/*.ts` | Clase por pantalla, `constructor(private readonly page: Page)`, locators como campos `private readonly`, métodos de acción asíncronos. |
| **Component Object** | `PersonSearchComponent.ts`, `CreditoPyccaForm` (`PaymentPage.ts:291`) | Componentes reutilizables compuestos *dentro* de Pages. `PersonSearchComponent` se instancia en `InvoicePage:63` y `DeliveryPage:21` — mismos IDs en dos rutas distintas, por eso todos sus locators llevan `:visible`. |
| **Factory Method / navegación fluida** | `DashboardPage:40-66`, `InvoicePage:84`, `InvoicePage:161` | Un método de navegación **devuelve la Page de destino ya cargada**: `irAFacturacion(): Promise<InvoicePage>`, `continuar(): Promise<PaymentPage>`. El test nunca hace `new XPage(page)`. |
| **Fixture / Dependency Injection** | `pos.fixture.ts:37-54` | `base.extend<Fixtures>` inyecta `pos: { page, dashboard, invoice }` ya autenticado y posicionado. Es el *composition root*: el único sitio donde se instancian `LoginPage` y `DashboardPage` para los tests. |
| **Template Method (informal)** | Todas las Pages | Contrato implícito `esperarCargada(): Promise<void>` que valida URL + un elemento ancla. Quien navega llama siempre a ese método. |
| **Registry / Strategy de datos** | `centros.ts:50` | `CENTROS_DATA: Record<string, DatosCentro>` indexado por centro. El centro detectado en runtime selecciona la "estrategia de datos". |
| **Lazy initialization** | `dataset.ts:81-107`, `centros.ts:95-118` | `get` en objetos literales: la variable de entorno se lee **al usarla**, no al importar el módulo. |
| **Null Object / fallo controlado** | `BoxOpeningPage.ultimoRechazo:24`, `PrintHistoryPage.sinDocumentosVisto:21` | Estado mutable de instancia usado como canal de retorno secundario hacia el caller/assert. |
| **Adapter de clicks** | `clickCustom` (`tests/fixtures/dataset.ts`) | Helper único, compartido por las 4 clases que lo necesitaban: traduce "click lógico" → `querySelector('button').click()` en el DOM, saltando wrappers `lib-button`/`p-button` y máscaras PrimeNG, con fallback a `click({ force: true })`. |

## 1.3 Flujo de ejecución completo

```
npm test
 └─ pretest → npm run clean (package.json:7)   borra evidencias/, recrea test-results/
 └─ playwright test
     1. Carga playwright.config.ts en el proceso main
        · dotenv.config({quiet:true})          → .env entra a process.env
        · si argv menciona explorar-skus       → process.env.E2E_EXPLORAR_SKUS='1'
     2. globalSetup (global-setup.ts) — navegador PROPIO, descartable
        · mockImpresion(page)                  → window.print = noop
        · LoginPage.loginSSO()                 → Azure AD, 3 reintentos por pantalla
        · DashboardPage.leerCentro()           → "CENTRO 004-112" → "004-112"
        · resolverCentro()                     → valida modo estricto/automático + datos
        · process.env.CAJA_ACTUAL = caja       ← ESTADO GLOBAL CROSS-PROCESO
        · DashboardPage.asegurarCajaAbierta()  → hasta 5 ciclos: desbloquear → apertura
        · browser.close()
     3. Playwright forkea el worker (1 solo) → HEREDA process.env, incluido CAJA_ACTUAL
     4. Por cada test (describe en mode:'serial'):
        · test.skip() de describe se evalúa ANTES de los fixtures (Casos 2 y 5)
        · fixture `pos`: mockImpresion → loginSSO → asegurarCajaAbierta → irAFacturacion
          ⚠️ cada test hace login completo: contexto y sesión nuevos, aislamiento total
        · cuerpo del test → Page Objects → DOM
        · teardown del fixture: Playwright cierra el context (no hay lógica propia)
     5. Reporters: list (consola) + html (evidencias/html-report) + json (resultados.json)
        · video: 'on' siempre · trace y screenshot solo en fallo
```

Dos decisiones no negociables documentadas en `playwright.config.ts:13-22`:

- **`workers: 1` + `fullyParallel: false` + `mode: 'serial'`** — todos los casos tocan la misma caja física del POS.
- **`retries: 0`** — un reintento generaría transacciones duplicadas reales (stock, cupo de crédito, caja).

`mode: 'serial'` añade algo importante: **si un caso falla, los siguientes se marcan
como skipped**, no se ejecutan.

---

# 2. Desglose por clase y módulo

## 2.1 Configuración y arranque

### `playwright.config.ts`

Carga `.env` en el proceso main (clave: los workers heredan `process.env`, no
re-ejecutan dotenv). El truco de `process.argv.some(a => a.includes('explorar-skus'))`
(línea 11) convierte el *comando* en una variable de entorno, para que
`tests/utils/explorar-skus.spec.ts` —que vive dentro de `testDir`— se auto-salte
en `npm test`.

`timeout: 15 min` por test y `expect.timeout: 20 s` responden a que cada caso
incluye login SSO + apertura de caja + varias llamadas al backend real.

### `global-setup.ts`

Único lugar que corre **una vez** por suite. Su contrato:

- **Entrada:** `FullConfig` (de ahí saca `baseURL`).
- **Efecto lateral crítico:** `process.env.CAJA_ACTUAL`.
- **Falla temprano y con mensaje accionable:** `resolverCentro()` (línea 40)
  distingue tres fallos — no se leyó el centro, centro ≠ `E2E_CENTRO_ESPERADO`,
  o centro sin datos en `centros.ts` — y cada mensaje dice exactamente qué hacer.

## 2.2 Datos

### `tests/fixtures/centros.ts`

Separa datos **no sensibles versionables** (arrays de SKUs, en código) de
**datos de clientes reales** (cédulas, cupones, en `.env`).

- `prefijo('004-150')` → `'E2E_004_150_'` (línea 29) — convención que liga
  centro ↔ variables de entorno.
- Los campos `oferta` y `credito` son **getters** (`get oferta()`, línea 95):
  se evalúan al leerlos, así el módulo puede importarse sin `.env` cargado
  (lo hace `playwright test --list`).
- `CENTROS_SOPORTADOS` (línea 122) existe solo para el mensaje de error de
  `global-setup.ts:57`.

### `tests/fixtures/dataset.ts`

Cuatro responsabilidades:

1. **Resolución de datos del centro:** `cajaActual()`, `datosCaja()`, `skuPool()`.
   Son **funciones, no constantes** — razón documentada en líneas 15-19:
   `globalSetup` importa este módulo *antes* de que exista `CAJA_ACTUAL`, y una
   constante evaluada al importar reventaría.
2. **Credenciales:** `CREDENCIALES` con getters perezosos sobre `envRequerida()`.
   Consecuencia de diseño: *una variable faltante rompe solo el caso que la usa*,
   con un mensaje que nombra la variable.
3. **Generadores de datos:** `generarCarrito()` (10-12 SKUs, cantidad 2-5),
   `tomarCedulas(n)`, `generarImei()` — todos con `Math.random()` **sin semilla**:
   los datos cambian en cada corrida.
4. **Parsers y helpers DOM genéricos:** `montoDe()` (`"$1,234.56"` → `1234.56`),
   `numeroDeCuotas()`, `evidencia()`, `cerrarDialogos()`, `mockImpresion()`,
   `seleccionarEnDropdown()`.

### `tests/fixtures/pos.fixture.ts`

Expone tres fixtures. `loginPage` y `dashboardPage` son instancias sueltas;
**`pos` es el que usan todos los casos**: ejecuta mock de impresión → login →
`asegurarCajaAbierta()` → `irAFacturacion()` y entrega `{ page, dashboard, invoice }`.
Exporta también `expect` reexportado, para que los specs importen todo de un solo módulo.

## 2.3 Page Objects

### `LoginPage.ts` — el más defensivo del repo

Tres bucles de reintento independientes, cada uno con una causa real documentada y fechada:

- `clickBotonSSO()` (53): si el POS perdió la nube reemplaza el botón de Microsoft
  por "Iniciar Sesión Local". Detecta el caso, recarga `/login` hasta 3 veces y
  falla con el motivo exacto.
- `ingresarPassword()` (87): Microsoft vacía el campo durante la animación.
  Verifica con `inputValue()` que la escritura cuajó antes de hacer submit;
  nunca loguea el valor.
- `diagnosticoDashboard()` (116): si el dashboard no carga, **lee el encabezado
  del POS** (fuera de línea / centro / versión FE) y construye un mensaje de
  causa probable en lugar de un timeout opaco.

Devuelve `void`; el estado de éxito es "el primer botón IR es visible".

### `DashboardPage.ts` — orquestador de precondiciones

Los módulos se seleccionan por el **título visible de la tarjeta** vía
`tarjetaIr(titulo)`: filtra `p-panel.custom-panel-dashboard` por su encabezado
exacto y toma el `button:has-text("IR")` de adentro. Reemplaza al antiguo
`.nth(0/3/4/8)`, que se rompía en silencio si el POS reordenaba o habilitaba
módulos. Verificado contra el DOM real el **2026-10-29**: las 15 tarjetas
comparten `id="button_button.go"` en su botón "IR" y el `pn_id_NN` del panel lo
autogenera PrimeNG, así que no hay ningún id utilizable — el título es el único
anclaje estable.

Métodos clave:

- `goto()` (25): navega y **neutraliza overlays** poniendo `pointer-events:none`
  a `.p-dialog-mask`, `.p-overlay-mask`, `lib-pending-orphan-payments`,
  `#loader-custom-overlay`.
- `clickPorTexto(patron)` (95): consecuencia directa de lo anterior — como
  `pointer-events:none` se hereda a los botones del modal, un click de mouse ya
  no llega, así que busca el `<button>` por texto en el DOM y lo clickea por JS.
  Devuelve `boolean` (si encontró botón).
- `resolverBloqueos()` (112): limpia estado sucio de corridas abortadas —
  "Entregas de caja pendientes" → procesar con auth supervisor; "Factura en curso"
  → navegar al carrito (volviendo desde `/pay` si hace falta) y vaciarlo.
- `asegurarCajaAbierta()` (144): bucle de 5 intentos. Prueba Facturación como
  *sonda* de caja abierta; si no navega a `/pos-ui/invoice`, va a Apertura. Si
  `BoxOpeningPage.ultimoRechazo` dice "no ha sido entregada", **aborta con mensaje
  accionable en vez de intentar la entrega a ciegas** (línea 168, con la
  justificación del cambio de FE).
- `leerCentro()` (186): `Promise<string | null>`, extrae `\d{3}-\d{3}`.

### `BoxOpeningPage.ts`

Tres pre-pasos condicionales (`*SiAplica`) antes de la apertura: reversar pagos
huérfanos, procesar entrega pendiente, autorizar supervisor.

`aperturarCaja(): Promise<boolean>` (111) es el ejemplo más sólido de
sincronización del repo: **no espera un elemento, espera la respuesta HTTP**.
Arma `waitForResponse(POST /api/pos/v1/open)` *antes* de clickear, y luego discrimina:

- `204` → éxito, limpia `ultimoRechazo`, `true`.
- `>= 400` → lee `body.message` a `ultimoRechazo` y **retorna `false` sin
  reintentar** (un rechazo de negocio no se arregla reclickeando).
- sin respuesta → reintenta hasta 3 veces (el primer click a veces no dispara
  nada porque Angular aún está bindeando).

### `InvoicePage.ts` (436 líneas) — la clase central

Locators organizados en tres bloques: privados, públicos (para asserts desde el
spec: `valorDescuento`, `totalValor`, `carritoVacio`) y un objeto anidado `ia`
para el modal de "Info adicional"/IMEI.

Métodos destacados:

- **`cargarCarrito(items): Promise<string[]>`** (195) — **devuelve los SKUs que
  realmente entraron**, no los que se pidieron. Por cada ítem: escribe SKU + Enter
  → resuelve el modal IMEI si aparece → verifica que exista
  `#mf_sale_product_list_table_row_<sku>` en 3 s → si no, cierra "Producto no
  encontrado" y lo salta. Solo lanza excepción si **ningún** SKU entró. Este
  contrato es el que permite al Caso 1 afirmar solo sobre `cargadosA`.

- **`cargarCarritoConTope(min, max, maxIntentos=40): Promise<ItemCarrito[]>`** (278)
  — algoritmo greedy con backtracking de un paso. Los precios **no están en el
  dataset**, así que los descubre: agrega 1 unidad, lee el total real, y si se
  pasa de `max` quita ese SKU. Si el pool se agota bajo `min`, llama a
  `subirCantidadHastaMinimo()` (325), que calcula unidades con el precio unitario
  inferido y **corrige leyendo el valor que el POS dejó en el input**
  (`real = inputValue()`), porque el POS recorta por stock. Existe para esquivar
  el defecto D-07 (tope de $2.000 por pago en efectivo).

- **`continuar(): Promise<PaymentPage>`** (84) — es una máquina de estados, no un
  click. Secuencia: cerrar modal de descuentos de cliente → JS-click Continuar →
  reintentar si el modal reapareció → resolver "Validación de saldo" (stock
  insuficiente) → autorizar supervisor si el ajuste lo pide → esperar
  `/pos-ui/pay` con hasta 3 reintentos ante el error "No se pudo generar la
  transacción", esperando a que el POS vuelva en línea.

- `suspender()` (392), `esperarSuspenderDeshabilitado()` (403),
  `abrirRecuperarSuspendida()` vs `abrirRecuperarSuspendidaRaw()` (407/414).
  La diferencia entre estas dos últimas es sutil y deliberada: la primera
  **espera** que el modal cargue (falla si no hay); la *Raw* solo espera 2,5 s y
  devuelve el diálogo, para poder afirmar sobre un modal vacío.

- `irAEntregaFuturaConAutorizacion()` vs `abrirEntregaFutura()` (161/172): misma
  acción, pero la segunda **no autoriza** y devuelve el `SupervisorAuthDialog`
  para que el Caso 4 valide el modal en sí.

### `PaymentPage.ts` (463 líneas) — dos clases en un archivo

**`PaymentPage`** resuelve el cobro en efectivo:

- `leerResumen()` (78) — el summary panel no tiene IDs: ejecuta un `page.evaluate`
  que recorre los `<h2>` del panel como pares etiqueta/valor y toma `<h1>` como
  pendiente. Detalle fino: el `<h1>` muestra **valor absoluto**, así que infiere
  el signo comparando `registrado > total` para detectar sobrepago (línea 93).
  Devuelve `{ total, registrado, descuento, pendiente }`.
- `registrarEfectivoHastaCubrir()` (156) — bucle hasta 15 iteraciones que converge
  el pendiente a 0, troceando pagos en montos de máximo $2.000. Maneja el caso del
  cliente colaborador: al elegir EFECTIVO se aplica 10 % de descuento *después* de
  registrar el pago → pendiente negativo → borra los pagos y repaga.
- `pagarEnEfectivo()` (201) — dos bucles anidados: hasta 3 rondas de "cubrir +
  Continuar + resolver modal de regalo" (el regalo **suma** su precio al total y
  deselecciona el método de pago), y luego hasta 10 ciclos de "Procesando Pago" →
  "Registro de pago en efectivo". Cierra con
  `expect(transaccionFinalizada).toBeVisible({timeout: 90_000})`.

**`CreditoPyccaForm`** (291) encapsula el formulario de crédito directo:

- `abrirSelect()` (324): los `p-select` tienen `appendTo="body"` y el click de
  mouse lo intercepta el layout → se abren con `focus()` sobre `[role=combobox]` + Enter.
- `habilitarFinancing()` (382): el plan de cuotas se pide con el **blur** del campo
  "Valor a pagar", no con el input. Por eso arma un
  `waitForResponse(/installments-plan/)` y recién después presiona Tab.
- `pressSequentially` en lugar de `fill` para los `p-inputnumber` (línea 393):
  `fill` cambia el texto pero **no sincroniza el modelo de Angular**. El mismo
  problema está documentado en `DeliveryPage.incrementar():63`, donde fue la causa
  del falso defecto D-06.
- `seleccionarFinanciamiento(cuotas=3)` (407): degradación en cascada — busca el
  plazo exacto, si no el primero con más de 1 cuota, si no el índice 0.

### `DeliveryPage.ts`

- `configurarEntregaMinima(carrito)` (80) — recorre los SKUs hasta encontrar uno
  asignable: sube "Entrega" con el botón `+`, espera `check-inventory`, detecta
  "No se encontraron tiendas", y **verifica el efecto real** comparando
  `totalUnidades()` antes/después. Si ninguno sirve, lanza un error que lista los
  SKUs probados y los que quedaron sin tiendas.
- `elegirFechaEntrega()` (156) — 3 intentos de abrir el datepicker y avance de mes
  si no hay días habilitados.

### Diálogos (`SupervisorAuthDialog`, `SuspendedTxDialog`, `CargarFacturaDialog`, `PrintHistoryPage`, `BoxDeliveryPage`)

- `SupervisorAuthDialog.autorizar()` (25) — el input visible es `readonly`; hay que
  escribir en el real oculto `#admin_authorization_card_scan_input`, con `%` inicial
  y `\n` final, más Enter. Sin el `%`, el POS responde "Formulario incompleto".
- `SuspendedTxDialog.esperarVisible()` (29) — acota el locator al `.p-dialog` porque
  el aviso "No se encontraron transacciones suspendidas…" contenía el mismo texto,
  y espera a que **la tabla termine de cargar** (`radios.first().or(sinDatos.first())`),
  ya que contar radios apenas aparece el título daba 0.
- `PrintHistoryPage.imprimirConAutorizacion()` (35) — patrón de **captura de evento
  efímero**: arranca la promesa del aviso *antes* de autorizar y guarda el resultado
  en `sinDocumentosVisto`, porque el mensaje dura pocos segundos.

## 2.4 Specs

**`tests/pos-flujos-avanzados.spec.ts`** — casos 1 a 7 (el 2 y el 5 condicionales).
Los tests son declarativos: no hay un solo selector.

Técnica importante en Casos 2 y 5 (líneas 115 y 259): se envuelven en un
`test.describe(() => {...})` **anónimo** solo para alojar un
`test.skip(callback, motivo)`. El callback se evalúa **antes de los fixtures**,
de modo que un caso saltado **no ejecuta el login**. Es la forma correcta de
condicionar por dato sin pagar 1-2 minutos de SSO.

Helper local `buscarCedulaConCreditoUtilizable()` (431): está en el spec, no en la
Page, porque es lógica de *setup del caso* (itera cédulas, abre y cierra dropdowns).
Enmascara las cédulas en los logs (`enmascarar()`, 473) — son datos de clientes reales.

**`tests/utils/explorar-skus.spec.ts`** — herramienta de mantenimiento, no un caso.
Cosecha SKUs con stock del centro actual probando el pool de otro centro y escribe
`evidencias/skus-<centro>.json` para pegar en `centros.ts`. Se auto-salta salvo que
se invoque explícitamente.

---

# 3. Variables, locators y estado

## 3.1 Variables de entorno

| Variable | Lectura | Falla si falta |
|---|---|---|
| `E2E_CENTRO_ESPERADO` | `centroEsperado()` → `envOpcional` | No. Vacío = modo automático. |
| `E2E_SSO_EMAIL` / `_PASSWORD` | `CREDENCIALES.sso.*` (getter) | Sí, al hacer login. |
| `E2E_SUPERVISOR_TRAMA` / `_CLAVE` | `CREDENCIALES.supervisor.*` | Sí, al autorizar. |
| `E2E_SUPERVISOR_NOMBRE` | opcional; default = 3.º campo de la trama | No. |
| `E2E_CODIGO_VENDEDOR` | `CREDENCIALES.codigoVendedor` | Sí, al usarse. |
| `E2E_CEDULA_POOL` | `cedulaPool()` | Sí, al usarse. |
| `E2E_<centro>_OFERTA_CUPON/_CEDULA/_CREDITO` | `centros.ts` getters | No: ausencia → el caso se salta. |
| `CAJA_ACTUAL` | **escrita** por `globalSetup`, leída por `cajaActual()` | Sí: "la suite debe arrancar con globalSetup". |
| `E2E_EXPLORAR_SKUS` | escrita desde `process.argv` en el config | No. |
| `E2E_EXPLORAR_ORIGEN` | `explorar-skus.spec.ts:27` | No, default `004-150`. |

El patrón transversal: **todo acceso a env pasa por `envRequerida`/`envOpcional`**,
nunca por `process.env.X` directo en lógica de negocio, y las lecturas son perezosas.

## 3.2 Estado compartido

Hay cuatro formas de estado, en orden de alcance:

1. **Cross-proceso:** `process.env.CAJA_ACTUAL`. Escrito en `globalSetup` (proceso
   main), leído en los workers por herencia de entorno. Es el único acoplamiento
   global real, y es deliberado: Playwright no ofrece otro canal main→worker sin
   tocar disco.
2. **Por test:** el fixture `pos`. Cada test obtiene browser, contexto, sesión SSO
   y Page Objects nuevos. **No hay reutilización de `storageState`** — cada caso
   paga el login completo a cambio de aislamiento total.
3. **De instancia (canal de retorno secundario):** `BoxOpeningPage.ultimoRechazo` y
   `PrintHistoryPage.sinDocumentosVisto`. Son campos mutables públicos que llevan
   información al caller porque el método principal devuelve otra cosa.
4. **Estado del POS (el más importante y el no gestionado por la suite):** caja
   abierta, transacciones suspendidas, pagos huérfanos, entregas pendientes. La
   suite **no lo resetea, lo reconcilia** — `resolverBloqueos()` y los `*SiAplica`
   existen justamente para absorber estado sucio de corridas abortadas.

## 3.3 Estrategia de locators

Jerarquía observada, de más a menos estable:

1. **ID del FE** — `#mf_sale_button_accept`, `#mf_pay_pycca_direct_credit_form_fee_value_input`.
   Prefijos `mf_sale_*`, `mf_pay_*`, `mf_person_*`, `mf_posop_*`, `admin_authorization_*`.
2. **ID con punto literal escapado** — `[id="button_actions.continue"]`,
   `[id="button_actions.return"]` (el `.` rompería un selector CSS `#`).
3. **ID + fallback por atributo**, con `.first()` —
   `'#mf_product_search_product_input, input[placeholder="Buscar producto por SKU"]'`.
4. **ID parametrizado por SKU** — `#mf_sale_product_list_table_row_${sku}`,
   `#mf_sale_product_list_table_quantity_${sku} input`. Es lo que permite que
   `cargarCarrito` verifique de verdad que la fila entró.
5. **Rol + filtro** — `getByRole('dialog').filter({ has: getByRole('heading', {name: ...}) })`.
   Usado en los modales cuyo host cambió de id entre versiones de FE.
6. **Texto** — `locator('text=Transacción finalizada')`. Frágil ante cambios de copy e i18n.
7. **Contenedor filtrado por título** — `locator('p-panel.custom-panel-dashboard').filter({ has: getByText('Entrega de Caja', { exact: true }) }).locator('button:has-text("IR")')`
   en `DashboardPage`. Se usa solo donde el FE no expone ids (las tarjetas del
   dashboard); depende del copy, pero **no** del orden de los módulos.

Cuatro reglas no obvias ya codificadas, que conviene respetar al escribir código nuevo:

- `fill()` **no sirve** en `p-inputnumber`: usar `pressSequentially` o los botones
  `+`/`-`, y confirmar con `Tab`.
- Los dropdowns `p-select` con `appendTo="body"` se abren con teclado
  (`focus` + Enter), no con click.
- Los wrappers `lib-button`/`p-button` necesitan click sobre el `<button>`
  **interno** (`clickCustom`).
- Un `evaluate(el => el.click())` salta el sistema de pointer events y por eso
  atraviesa máscaras residuales de PrimeNG; es el fallback estándar aquí.

---

# 4. Tipado y características de TypeScript

## 4.1 `useDefineForClassFields: false` — la línea más importante del `tsconfig.json`

Todo el POM depende de ella. El patrón es:

```ts
export class LoginPage {
  constructor(private readonly page: Page) {}
  private readonly botonSSO = this.page.getByRole('button', {...});  // usa this.page
}
```

Con `useDefineForClassFields: false`, TypeScript emite las *parameter properties*
(`this.page = page`) **antes** de los inicializadores de campo, así que `this.page`
ya existe. Con `true` (semántica nativa ES2022 `[[Define]]`), los campos se
inicializan antes del cuerpo del constructor y **todas las Pages reventarían con
`Cannot read properties of undefined`**. Si alguien "moderniza" ese flag, la suite
entera deja de arrancar.

## 4.2 Interfaces y modificadores `readonly`

```ts
export interface DatosCentro {
  readonly skus: readonly string[];
  readonly oferta: OfertaCentro | null;
  readonly credito: readonly string[];
}
```

El `readonly string[]` es inmutabilidad real, no decorativa: por eso
`generarCarrito()` hace `[...skuPool()].sort(...)` y `cargarCarritoConTope()` hace
`[...skuPool()]`. `sort()` muta in situ, y el tipo lo impide — el spread es
obligatorio, no cosmético. Esto evita el bug clásico de "el pool de SKUs quedó
reordenado entre casos".

`oferta: OfertaCentro | null` fuerza narrowing explícito en los consumidores:
el Caso 2 usa `datosCaja().oferta!` solo **después** del `test.skip` que garantiza
su existencia.

## 4.3 Getters que satisfacen propiedades `readonly`

```ts
'004-150': {
  skus: [...],
  get oferta() { return ofertaEnv('004-150', false); },
  get credito() { return listaEnv('004-150', 'CREDITO'); },
}
```

Un getter satisface estructuralmente una propiedad `readonly` de la interfaz.
Resultado: el consumidor ve una **forma de datos plana** (`datos.credito.length`),
pero la lectura del `.env` ocurre al acceder. Es lo que permite importar
`centros.ts` desde `globalSetup` y desde `playwright test --list` sin `.env` cargado.

## 4.4 Tipos de función e intersecciones

```ts
export type ItemCarrito = { sku: string; cantidad: number };
const cargados: (ItemCarrito & { precio: number })[] = [];   // InvoicePage:280
```

La intersección añade el precio *descubierto en runtime* sin contaminar el tipo
público. Y al retornar se vuelve a estrechar con destructuring:

```ts
return cargados.map(({ sku, cantidad }) => ({ sku, cantidad }));   // InvoicePage:314
```

El contrato externo sigue siendo `ItemCarrito[]`; el precio es un detalle de implementación.

## 4.5 Genéricos de Playwright

```ts
type Fixtures = { loginPage: LoginPage; dashboardPage: DashboardPage; pos: PosContext };
export const test = base.extend<Fixtures>({ ... });
```

`base.extend<Fixtures>` es el único genérico explícito del repo, y hace todo el
trabajo pesado: en el spec, `async ({ pos })` está completamente tipado y
`pos.invoice.cargarCarrito(...)` tiene autocompletado y chequeo. Si añades un
fixture sin declararlo en `Fixtures`, el compilador lo rechaza.

`PosContext` se exporta por separado para que un helper externo pueda recibirlo
como parámetro.

## 4.6 Tipos en callbacks de `evaluate`

```ts
await locator.evaluate((el: HTMLElement) => { ... });
```

`Locator.evaluate` tipa su argumento como `SVGElement | HTMLElement`; anotarlo a
`HTMLElement` permite usar `.click()` y `.style`. En `leerResumen()`
(`PaymentPage:78`) el tipo de retorno se declara en la firma del método y TS lo
infiere hacia el callback — el objeto que construye el `evaluate` del navegador
queda validado contra `{ total; registrado; descuento; pendiente }`.

## 4.7 Uniones literales, `import type` y destructuring

- `asignar(doc: string, tipo: 'CC' | 'RUC' = 'CC')` — unión literal con default;
  cierra el dominio del parámetro.
- `import type { ItemCarrito }`, `import type { InvoicePage }` — imports borrados
  en compilación; evitan ciclos de módulo en tiempo de ejecución (relevante porque
  `InvoicePage` ↔ `PaymentPage`/`DeliveryPage` se referencian mutuamente).
- `const [clienteA, clienteB, , clienteD] = tomarCedulas(4);` — hueco posicional
  para descartar el tercer elemento.

## 4.8 Dos puntos de atención en el tipado

1. **`Record<string, DatosCentro>` sin `noUncheckedIndexedAccess`.**
   `CENTROS_DATA[centro]` se tipa como `DatosCentro` aunque en runtime pueda ser
   `undefined`. El código lo compensa a mano (`if (!datos) throw ...` en
   `dataset.ts:33` y `global-setup.ts:53`), lo cual funciona, pero el compilador no
   lo está exigiendo. Activar `noUncheckedIndexedAccess` en `tsconfig.json`
   convertiría esas guardas en obligatorias — hoy son disciplina, no tipo.
2. **El idioma `.catch(() => false)`.** `await loc.isVisible().catch(() => false)`
   colapsa cualquier error (incluido un selector mal escrito) en `false`. Es
   intencional para tolerar la inestabilidad del POS, pero significa que un locator
   roto se manifiesta como "la rama no se ejecutó" y no como un fallo. Al depurar un
   `*SiAplica` que "no hace nada", sospechar primero del selector.

---

# 5. Guía rápida de modificación

## 5.1 Agregar un caso de prueba nuevo

**Dónde:** `tests/pos-flujos-avanzados.spec.ts` (o un `.spec.ts` nuevo en `tests/`,
que `testDir: './tests'` recoge automáticamente).

```ts
test('Caso 8: <intención de negocio en una frase>', async ({ pos }) => {
  const { invoice, page } = pos;        // ya logueado, caja abierta, en /pos-ui/invoice
  // ... solo llamadas a Page Objects + expect
});
```

Checklist:

1. **El nombre debe empezar con `Caso N`** — los scripts `test:casoN` filtran con
   `-g "Caso N"`. Añade también `test:caso8` y `pretest:caso8` en `package.json`
   siguiendo el patrón de las líneas 15 y 24.
2. **Cero selectores en el spec.** Si necesitas tocar el DOM, el método va en la
   Page correspondiente.
3. **Si el caso depende de un dato opcional** (oferta, cupo de crédito), envuélvelo
   en el `test.describe` anónimo con `test.skip(callback, motivo)` — así no paga el
   login cuando se salta:

   ```ts
   test.describe(() => {
     test.skip(() => datosCaja().algo.length === 0, 'Saltado: <motivo + qué configurar>');
     test('Caso 8: ...', async ({ pos }) => { ... });
   });
   ```

4. **Si el caso cobra en efectivo**, acota el carrito con `carritoBajoTope(invoice)`
   por el defecto D-07 ($2.000 por pago).
5. **No toques** `retries`, `workers` ni `mode: 'serial'`.
6. **Evidencias:** `await evidencia(page, 'caso8-01-descripcion')` en los puntos de
   interés; el nombre va sin extensión y aterriza en `evidencias/`.
7. **Deja el POS limpio al final** (`invoice.vaciar()` o cerrar la venta).
   `mode: 'serial'` hace que tu basura rompa los casos siguientes.
8. Verifica con `npm run typecheck` y primera corrida con
   `npm run test:headed -- -g "Caso 8"`.

`PLANTILLA-CASO-NUEVO.md` tiene el prompt completo para generar casos con LLM +
Playwright MCP, usando `context.md` como RAG.

## 5.2 Modificar un Page Object / añadir locators

**Dónde:** `tests/pages/<Pantalla>.ts`.

Para un locator nuevo:

```ts
private readonly miBoton = this.page.locator('#mf_sale_mi_boton');
```

Reglas del repo:

- **Prioridad:** `#id` → `[data-testid]` → `getByRole(name)` → CSS por atributo
  estable. **Prohibido XPath posicional.**
- `private readonly` por defecto; `readonly` público **solo** si el spec necesita
  afirmar sobre él (como `invoice.totalValor` o `pay.valorTotalRow`).
- **Documenta el origen y la fecha** del selector en un comentario, como hace el
  resto del archivo (`// DOM scrape 2026-10-15 (FE 1.12.0-rc.5)`). Esa convención
  es lo que hace mantenible este repo frente a un FE que cambia.
- Si el elemento es un wrapper `lib-button`/`p-button`, clickéalo con
  `clickCustom()`, no con `.click()`.
- Si es un `p-inputnumber`, usa `pressSequentially` + `Tab`, o los botones `+`/`-`.
- Si el POS dispara una petición, **sincroniza con `waitForResponse` antes del
  click**, no con `waitForTimeout`.

Para una pantalla nueva:

1. Crea `tests/pages/MiPantalla.ts` con `constructor(private readonly page: Page) {}`
   y `esperarCargada()`.
2. Añade el método de navegación en la Page de origen, devolviendo la nueva Page
   ya cargada:

   ```ts
   async irAMiPantalla(): Promise<MiPantalla> {
     await clickCustom(this.irMiPantalla);
     const p = new MiPantalla(this.page);
     await p.esperarCargada();
     return p;
   }
   ```

3. Si entra por el dashboard, declara el locator con
   `private readonly irMiPantalla = this.tarjetaIr('Título exacto de la tarjeta');`
   — el título se copia del encabezado visible, sin contar posiciones.

Para un componente reutilizable en varias pantallas: `tests/pages/components/`, con
locators filtrados por `:visible` (en el POS conviven instancias ocultas con los
mismos IDs, ver `PersonSearchComponent:12`).

## 5.3 Cambiar o añadir fuentes de datos

**Añadir un centro POS:**

1. Bloque nuevo en `CENTROS_DATA` (`tests/fixtures/centros.ts:50`):

   ```ts
   '004-999': {
     skus: ['...'],
     get oferta() { return ofertaEnv('004-999', false); },
     get credito() { return listaEnv('004-999', 'CREDITO'); },
   },
   ```

2. Variables en `.env.example` **y** en tu `.env`: `E2E_004_999_OFERTA_CUPON`,
   `_OFERTA_CEDULA`, `_CREDITO`. El prefijo lo genera `prefijo()` reemplazando
   `-` por `_`.
3. Para poblar `skus` sin adivinar: pon el POS en ese centro y corre
   `npm run explorar:skus` (opcionalmente `E2E_EXPLORAR_ORIGEN=004-150`). Deja
   `evidencias/skus-004-999.json` listo para pegar.
4. `CENTROS_SOPORTADOS` se actualiza solo.

**Activar una oferta:** el segundo argumento de `ofertaEnv(centro, vigente)` es el
flag de vigencia. Hoy ambos centros están en `false` (BG961 responde 404 desde
2026-10-16) y por eso el Caso 2 se salta. Cuando haya cupón vivo:
`ofertaEnv('004-150', true)` + las dos variables en `.env`.

**Añadir un dato sensible nuevo** (nunca en código):

1. Entrada documentada en `.env.example`.
2. Accessor en `dataset.ts` usando `envRequerida` (obligatorio) o `envOpcional`
   (con default), o como getter dentro de `CREDENCIALES` si es una credencial.
3. Si es por centro, va en `centros.ts` con el prefijo, no en `dataset.ts`.

**Cambiar generación de datos:** `generarCarrito()`, `tomarCedulas()`,
`generarImei()` en `dataset.ts:109-126`. Ojo: usan `Math.random()` sin semilla — si
necesitas reproducibilidad para depurar un fallo, ese es el punto donde inyectar
una semilla fija.

**Cambiar rangos y topes:** las constantes de negocio del spec están en
`pos-flujos-avanzados.spec.ts:34-35` (`TOTAL_EFECTIVO_MIN/MAX`); el tope por pago
está en `PaymentPage:157` (`LIMITE_EFECTIVO = 2000`).

---

# 6. Observaciones de mantenimiento

De las tres observaciones del análisis original, las dos primeras ya están
resueltas (2026-10-29, rama `refactor/dashboard-y-clicks`):

- ~~**`DashboardPage` depende de posiciones (`.nth(0/3/4/8)`).**~~ **Resuelto.**
  Las tarjetas se ubican por su título visible con `tarjetaIr(titulo)` (ver 2.3).
  Se inspeccionó el DOM real del POS el 2026-10-29 para descartar ids propios:
  los 15 botones "IR" comparten `id="button_button.go"` y los `pn_id_NN` del
  panel son autogenerados por PrimeNG. Smoke test en el POS: los 4 locators
  resuelven a exactamente 1 botón y Apertura/Entrega de Caja navegan correctamente.
- ~~**`clickCustom`/`jsClick`/`clickInterno` están duplicados.**~~ **Resuelto.**
  Hay una única `clickCustom(locator)` exportada desde `tests/fixtures/dataset.ts`,
  usada por `InvoicePage`, `PaymentPage`, `DashboardPage` y `PersonSearchComponent`.
  Cubre los dos matices que diferían entre las copias: `querySelector('button') ?? el`
  y el fallback a `click({ force: true })`.
- **Cada test rehace el login SSO completo** (fixture `pos`). Es correcto para el
  aislamiento, pero con 6-7 casos son 6-7 logins contra Azure AD. Si en algún momento
  el tiempo de corrida molesta, `storageState` reutilizable es la palanca — a costa
  de perder parte de ese aislamiento.
