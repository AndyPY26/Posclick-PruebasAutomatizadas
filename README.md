# Suite E2E POSCLICK

Suite de pruebas end-to-end para **POSCLICK** basada en [Playwright](https://playwright.dev/) + planes de prueba de TestSprite. Cubre 5 flujos avanzados del POS (suspensión de ventas, ofertas especiales, independencia de clientes, autorización de supervisor y cuotas de crédito).

- **App bajo prueba:** `http://localhost:4200`
- **FE/BE:** `1.12.0-rc.1`
- **Caja:** `004-112`

## Requisitos

- Node.js 18+
- Acceso al POS corriendo localmente en `http://localhost:4200`
- Credenciales SSO válidas de PYCCA

## Reglas críticas de ejecución

1. **El navegador debe correr en la misma máquina que la app.** El SSO de Azure AD usa `redirect_uri=http://localhost:4200`; con navegador remoto o túnel el retorno de sesión falla (~85%).
2. **`retries: 0`.** Cada caso mueve stock, caja y cupo de crédito reales. Un reintento duplicaría transacciones.
3. **Ejecución secuencial** (`fullyParallel: false`, `workers: 1`). La app mantiene estado global de caja.
4. **Precondición obligatoria:** con entregas de caja pendientes, Facturación responde *"Acceso denegado"*. `global-setup.ts` las libera antes de la suite.
5. **Las pruebas de crédito consumen cupo real** y no son repetibles sin reponerlo.
6. **La impresión se mockea** con `addInitScript` antes de navegar; sin impresora la app lanza *"Impresora no encontrada"*.

## Instalación

```bash
npm install
npx playwright install chromium
```

Verificar que el POS responde:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4200/login   # → 200
```

Chequeo de tipos (sin salida = OK):

```bash
npm run typecheck
```

## Ejecución

```bash
npm test                 # corre los 5 casos
npm run test:caso1       # un caso puntual (caso1 … caso5)
npm run test:caso2
npm run test:headed      # modo con UI
npm run report           # abre el HTML report con videos y traces
```

Ver una traza específica:

```bash
npx playwright show-trace evidencias/test-results/**/trace.zip
```

## Estructura

```
e2e/
├── playwright.config.ts        # workers:1, retries:0, video+trace 'on', globalSetup
├── global-setup.ts             # libera entregas de caja pendientes
├── tsconfig.json
├── package.json
├── context.md                  # notas internas de la suite
├── tests/
│   ├── pos.fixtures.ts              # dataset + ~65 selectores + helpers
│   └── pos-flujos-avanzados.spec.ts # 5 casos
├── testsprite-plans/           # planes JSON de TestSprite por caso
└── evidencias/                 # video, trace, screenshots, HTML report (generado)
```

## Casos cubiertos

| # | Caso | Estado |
|---|---|---|
| 1 | Suspensión única | ✅ (restricción = botón `disabled`, no mensaje) |
| 2 | Oferta Especial `H0867` | ✅ completo |
| 3 | Independencia clientes | ✅ + defecto D-01 |
| 4 | Autorización supervisor | ✅ hasta pantalla |
| 5 | Cuotas crédito | ❌ sin cédula con cupo |

### Defectos conocidos

- **D-01** Voucher *ENTREGA MERCADERIA (F4)* no reimprime (*"No hay documentos para imprimir"*).
- **D-02** Suspensión sin feedback visible al usuario.
- **D-03** Créditos de prueba bloqueados / sobregirados.
- **D-04** Autorización repetitiva.
- **D-05** Código de oferta no visible en cobro.

**No verificable desde la suite:** contenido de documentos impresos (sin impresora ni preview).

## Trucos no obvios (uso de selectores / interacciones)

- **Swipe de supervisor:** escribir en el input *oculto* (el visible es `readonly`), con prefijo `%` y `\n` final, luego Enter. Sin el `%` → *"Formulario incompleto: cardNumber, frameData"*.
- **Dropdowns PrimeNG:** click en trigger → `ArrowDown` → `Enter`, **sin interrupciones**. Un screenshot intermedio cierra el overlay.
- **Cambiar cliente:** primero `clear_button`; si ya hay cliente asignado, el campo de búsqueda no existe.
- **Ofertas Especiales** no es un módulo del dashboard: lupa → "Cargar factura" → pestaña "Oferta Especial".
- **"Envío a"** (`/pos-ui/delivery`) = persona de retiro; usa el mismo componente que el cliente de facturación.
- Tras pagar puede aparecer **modal de regalo** → elegir uno → recalcular saldo.

## `context.md` como base de conocimiento (RAG)

El archivo [`context.md`](./context.md) funciona como **base de conocimiento (RAG)** de la suite: concentra las reglas, selectores, dataset, trucos de interacción y defectos conocidos del POS en un formato pensado para pasárselo a un LLM como contexto y que éste pueda generar nuevos casos de prueba coherentes con el estilo del proyecto.

> No es "entrenamiento" en sentido estricto (los pesos del modelo no cambian). Es **contexto en tiempo de inferencia**: cada vez que pides un caso nuevo, le pasas `context.md` y el modelo lo usa como fuente de verdad. En la práctica el efecto es el mismo — mientras más denso y actualizado esté el archivo, mejores scripts genera.

### Por qué `context.md` funciona como RAG

- **Reglas invariantes** (SSO local, `retries:0`, ejecución secuencial, mock de impresión) → el modelo no las rompe al generar un caso nuevo.
- **Selectores clave** (`#mf_sale_product_list_table_*`, etc.) → los reutiliza en vez de inventar.
- **Trucos no obvios** (swipe supervisor con `%` + `\n`, dropdowns PrimeNG sin interrupciones, `clear_button` antes de buscar cliente) → son justo los que un modelo "ciego" fallaría.
- **Dataset de prueba** (usuarios, autorizaciones, códigos) → no tiene que preguntártelos.
- **Defectos conocidos** (D-01…D-05) → evita que marque como bug algo ya documentado.

### Flujo recomendado para pedir un caso nuevo al LLM

1. Pásale como contexto: `context.md` + `tests/pos.fixtures.ts` + 1 spec existente (ej. `pos-flujos-avanzados.spec.ts`) como patrón de estilo.
2. Describe el caso nuevo con: **objetivo, precondiciones, pasos de usuario, resultado esperado y criterios de aceptación**. Mientras más concreto, mejor sale el script.
3. Si usa selectores que no están en `context.md`, pídele que los marque con `TODO: confirmar selector` para verificarlos tú en el DOM.
4. Corre `npm run typecheck` y luego el caso en modo headed la primera vez (`npm run test:headed`).

### Cómo seguir "entrenando" el RAG

El `context.md` se enriquece con cada caso nuevo. Cada vez que descubras algo que al modelo le costaría adivinar, agrégalo:

- **Selector nuevo** que uses más de una vez → sección *"Selectores clave"* de `context.md` (o como constante en `pos.fixtures.ts`).
- **Truco de interacción nuevo** (ej. "este modal necesita un `blur` antes de `click`") → sección *"Trucos no obvios"*.
- **Defecto nuevo** encontrado durante la prueba → tabla de defectos (D-06, D-07…).
- **Caso ya estable** → tabla *"Estado conocido"* con ✅.
- **Dato de prueba nuevo** (nueva autorización, nuevo cliente de prueba, etc.) → tabla de datos de prueba.

Así el próximo caso que pidas al LLM sale cada vez con menos retoques manuales.

### Límites a tener en cuenta

- El modelo **no verifica en vivo** que un selector exista. Si el DOM cambió y no actualizaste `context.md`, generará código que falla en `click` o `fill`.
- **No ve el estado real del POS** (cupos, stock, caja). Si pides un caso que depende de datos específicos (ej. "cliente con cupo libre"), el flujo saldrá, pero los datos los tienes que garantizar tú — exactamente lo que pasa con el Caso 5.
- Para flujos muy largos conviene pedirlo **por partes** (helpers reutilizables en `pos.fixtures.ts` primero, luego el `test(...)` que los compone) para evitar que corte código a la mitad.

## Generar casos nuevos con el MCP de Playwright

Cuando el caso nuevo toca pantallas o flujos que **no están documentados** en `context.md`, el LLM necesita "ojos" en vivo para descubrir selectores reales. La forma recomendada es combinar `context.md` (como atajo para lo ya conocido) con el **[Playwright MCP](https://github.com/microsoft/playwright-mcp)** (para explorar lo nuevo en el DOM real).

### Setup del MCP

Registra el MCP de Playwright en tu cliente de LLM (Claude Code, Claude Desktop, etc.). Ejemplo de configuración:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chromium"]
    }
  }
}
```

Esto expone al modelo tools como `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_evaluate`, etc.

### Flujo híbrido `context.md` + MCP

```
Caso nuevo
  │
  ├─ ¿Está documentado en context.md / fixtures? ──► Sí ──► Usar directo
  │
  └─ No ──► MCP de Playwright: navegar + snapshot + confirmar selector
             │
             └─► Generar .spec.ts
                   │
                   └─► Correr headed → ✅ → Actualizar context.md
                                             (selectores + trucos + estado)
```

Cada vuelta del ciclo hace que la próxima prueba necesite menos exploración en vivo. Es así como el `context.md` se vuelve cada vez más denso y útil como RAG.

### Plantilla de prompt para pedir un caso nuevo

La plantilla completa (prompt listo para copiar, cómo rellenar cada campo del caso, flujo en dos vueltas y checklist previo a correr) vive en un archivo aparte para mantenerla sincronizada entre proyectos:

- 📄 [`PLANTILLA-CASO-NUEVO.md`](./PLANTILLA-CASO-NUEVO.md)

### Reglas prácticas para que no se descontrole

- **Un caso = una sesión del MCP.** No dejes al modelo "explorar" sin objetivo; se gastan tokens y a veces inventa selectores de pantallas que no visitó.
- **Prioridad de selectores**, dísela explícita: `id` → `data-testid` → `getByRole(name)` → CSS por atributo estable. **Prohibido XPath basado en posición.**
- **Antes de autogenerar, snapshot.** Pídele siempre que haga `browser_snapshot` y te lo muestre antes de clickear, para validar que está en la pantalla correcta.
- **El MCP corre contra el POS real.** Las reglas de `context.md` siguen aplicando: no habilites retries, no corras en paralelo, y si el caso toca caja/stock avisa antes.
- **Flujo iterativo.** Primero pídele solo que explore y proponga el esqueleto; en una segunda vuelta pídele el `.spec.ts` completo. Separar exploración de generación da mejores resultados.
- **Cerrá el loop.** Cuando el caso pase, pega el diff que te dio para `context.md` → la próxima vez ese flujo ya es "conocido" y no necesita MCP.

### Alternativa sin MCP: `codegen` de Playwright

Si no quieres configurar MCP, el equivalente manual es:

```bash
npx playwright codegen http://localhost:4200
```

Te abre un navegador que graba tus clicks y genera selectores automáticamente. Luego le pasas al LLM el bloque generado + `context.md` y le pides que lo "limpie" al estilo de la suite (reutilizando helpers, respetando reglas, etc.). Es más manual pero no requiere configuración extra.

## Evidencias

Cada corrida genera en `./evidencias/`:

- `html-report/` — reporte HTML navegable (`npm run report`)
- `test-results/` — videos, traces y screenshots por caso
- `resultados.json` — reporte JSON consolidado

Este directorio está en `.gitignore` y no se versiona.
