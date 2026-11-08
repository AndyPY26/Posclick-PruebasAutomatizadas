# Suite E2E POSCLICK — reglas del repositorio

> Este archivo se carga **siempre**, en cada sesión, sin invocarlo. Son las reglas que no se
> negocian y los punteros a dónde vive la verdad. No duplica contenido: **señala el archivo**.
>
> Contexto: suite Playwright + TypeScript contra el POS real (`http://localhost:4200`, Angular +
> PrimeNG, SSO Azure AD). Cada corrida toca **stock, caja y cupo de crédito reales**.

---

## 1. Dónde está la verdad

Nunca pidas que te peguen este contenido en el chat. Lee el archivo.

| Archivo | Qué contiene |
|---|---|
| `context.md` §Reglas críticas | las 8 reglas de ejecución del POS |
| `context.md` §Selectores clave | mapa selector → Page Object donde vive |
| `context.md` §Trucos no obvios | PrimeNG, swipe supervisor, modales, flujo de pago |
| `context.md` §Estado conocido | qué caso está en verde, defectos D-01…D-07 |
| `context.md` §Datos de prueba | qué variable de `.env` alimenta cada dato |
| `ARQUITECTURA.md` §3.3 | jerarquía de locators con ejemplos reales |
| `ARQUITECTURA.md` §5 | guía de modificación (agregar caso, agregar locator, agregar dato) |
| `README.md` §Ejecución local | túneles SSH, verificación de puertos |
| `.env.example` | qué variables existen (los **valores** nunca se leen ni se escriben) |

**Si un dato no está en estos archivos, no existe hasta que alguien lo verifique en el POS.**
No inventes selectores, endpoints, SKUs, cédulas, pantallas ni comportamientos. Si falta un dato,
escribe `SIN FUENTE` y di en una línea qué hace falta.

---

## 2. Reglas de ejecución — nunca se tocan

Están en `context.md` §Reglas críticas. Las cinco que **ninguna propuesta puede romper**:

1. **`retries: 0`.** Un reintento duplica transacciones reales. No subirlo "para estabilizar".
2. **`workers: 1` · `fullyParallel: false` · `mode: 'serial'`.** La app tiene estado global de caja.
3. **Mock de impresión** con `addInitScript` **antes** de navegar (`mockImpresion` en `dataset.ts`).
4. **Secretos solo en `.env`.** Nunca escribas una credencial, cédula, trama de supervisor o cupón
   en código, en documentación, en un log o en el chat. Las cédulas van enmascaradas (`******1234`).
5. **`test.skip` por datos del centro va FUERA del fixture**, envuelto en `test.describe(() => { … })`.
   Dentro del cuerpo del test corre *después* del fixture `pos` (login + caja) y falla ahí.

---

## 3. Antes de ejecutar cualquier cosa contra el POS

**Pide permiso explícito y espera la respuesta.** No es una formalidad:

- `npm test` y `npm run test:casoN` disparan `pretest` → **`clean` borra `evidencias/` entera**
  (videos, traces, html-report, capturas). Se pierde la evidencia de la corrida anterior.
- Cada caso mueve stock, caja y cupo de crédito **reales**. El Caso 5 consume cupo que no se repone.
- Dos corridas simultáneas se pisan: comparten caja y `clean` rompe los traces de la otra.

**Sin permiso sí podés correr**, porque no tocan el POS:

```bash
npm run typecheck                     # tsc --noEmit, sin salida = OK
npx playwright test --list            # títulos de los casos
grep / find / lectura de archivos
```

Al pedir permiso, decí **qué comando exacto** vas a correr, **qué caso** y **qué datos mueve**.

---

## 4. Locators — la jerarquía de ESTE proyecto

El FE **no expone un solo `data-testid`**. No apliques el criterio "solo locators semánticos":
acá los ids del FE son lo más estable que hay. Orden (detalle en `ARQUITECTURA.md` §3.3):

1. **ID del FE** — `#mf_sale_button_accept`, `#mf_pay_pycca_direct_credit_form_fee_value_input`.
   Prefijos reales: `mf_sale_*`, `mf_pay_*`, `mf_person_*`, `mf_posop_*`, `admin_authorization_*`.
2. **ID con punto escapado** — `[id="button_actions.continue"]` (un `#` CSS se rompe con el `.`).
3. **ID + fallback por atributo**, con `.first()`.
4. **ID parametrizado por SKU** — `#mf_sale_product_list_table_quantity_${sku} input`.
5. **Rol + filtro** — `getByRole('dialog').filter({ hasText: título })`, para modales cuyo host
   cambia de id entre versiones de FE (`modal_dialog_id_*` es dinámico: `.p-dialog` NO los agarra).
6. **Texto** — frágil ante cambios de copy. Último recurso.
7. **Contenedor filtrado por título** — solo donde el FE no expone ids: las 15 tarjetas del
   dashboard comparten `id="button_button.go"`, por eso `DashboardPage.tarjetaIr(titulo)`.

**Prohibido:** XPath posicional y `nth()` sobre listas que el FE puede reordenar.
**Ningún locator nuevo se acepta sin comprobarlo** contra el DOM real (MCP, `codegen` o corrida).
Una propuesta plausible no es evidencia.

---

## 5. Cuatro reglas de interacción ya codificadas

No las re-descubras ni las "simplifiques". Detalle en `context.md` §Trucos no obvios.

- **`fill()` no sirve en `p-inputnumber`.** Cambia el texto, no el model de Angular. Usar
  `pressSequentially` o los botones `.p-inputnumber-increment-button` + `Tab`.
- **Dropdowns `p-select`** se abren con teclado (`focus` + Enter), no con click, y la secuencia
  **no puede interrumpirse**: un screenshot intermedio cierra el overlay.
- **Wrappers `lib-button` / `p-button`**: el ngClick vive en el `<button>` interno. Usar
  `clickCustom(locator)` de `tests/fixtures/dataset.ts`. **No la dupliques**: ya se consolidó una
  vez desde 4 copias (`ARQUITECTURA.md` §6).
- **Nada de esperas fijas nuevas.** No agregues `waitForTimeout` para "estabilizar". Las que hay
  están justificadas y documentadas en el código.

---

## 6. Estructura — dónde va cada cosa

```
playwright.config.ts   workers:1, retries:0, video 'on', trace retain-on-failure, globalSetup
global-setup.ts        login SSO → detecta centro (CAJA_ACTUAL) → abre caja
tests/
  pos-flujos-avanzados.spec.ts   7 casos; SOLO intención de negocio, cero selectores
  fixtures/centros.ts            SKUs por centro
  fixtures/dataset.ts            datos del centro, credenciales lazy, utilidades DOM genéricas
  fixtures/pos.fixture.ts        fixture `pos` = mock impresión + login + caja + Facturación
  pages/*.ts                     12 Page Objects + components/PersonSearchComponent.ts
  utils/explorar-skus.spec.ts    utilidad, no es un caso
```

- **Los selectores viven DENTRO de la Page**, como campos privados. Un spec que declara un selector
  está mal ubicado.
- **Pantalla existente** → método nuevo en su Page. **Pantalla nueva** → clase nueva en `tests/pages/`.
- **Dato nuevo** → `.env.example` + lectura perezosa en `dataset.ts`, nunca un literal en el código.
- **Utilidad de DOM genérica** (sirve en más de una pantalla) → `dataset.ts`. Si es de una pantalla,
  va en su Page.
- **No edites `evidencias/`**: es generado y `clean` lo borra.

---

## 7. Quién decide

- Vos (la QA) firmás. Una capacidad de este repositorio entrega **`CANDIDATO`** o **`ESCALADO`**,
  nunca `ACEPTADO`, y nunca marca un caso como ✅ en `context.md` §Estado conocido.
- **Si el DOM real contradice `context.md`, decilo explícitamente**: significa que `context.md` está
  desactualizado, y actualizarlo es una decisión, no un efecto colateral.
- Un comportamiento inesperado del POS **no se declara defecto** sin contrastarlo con la tabla de
  defectos conocidos (D-01…D-07). D-06 ya fue un falso positivo una vez.
- Cuando la evidencia no alcance para decidir, **pará y preguntá**. No elijas por descarte.

---

## 8. Capacidades registradas

| Capacidad | Dónde vive | Qué hace |
|---|---|---|
| `mapear-pantalla-mcp` | `.claude/skills/mapear-pantalla-mcp/` | explora una pantalla con el MCP y propone selectores con origen |
| `generar-caso-posclick` | `.claude/skills/generar-caso-posclick/` | escribe un caso E2E nuevo al estilo de la suite y lo verifica con rúbrica |
| `diagnosticar-fallo-pos` | `.claude/skills/diagnosticar-fallo-pos/` | clasifica un rojo en POS \| ENTORNO \| DATO \| SUITE con evidencia |
| `actualizar-context` | `.claude/skills/actualizar-context/` | genera el parche a `context.md` tras un caso verde |
| `/caso-agent` | `.claude/commands/caso-agent.md` | encadena las cuatro con gate humano antes de ejecutar |

---

*Reglas siempre activas de `posclick-e2e`. El contenido vive en `context.md`, `ARQUITECTURA.md` y
`README.md`; este archivo solo dice qué no se negocia y dónde mirar.*
