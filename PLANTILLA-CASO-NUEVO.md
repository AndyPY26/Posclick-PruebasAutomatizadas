# Plantilla para generar casos nuevos con LLM + Playwright MCP

Esta plantilla sirve para pedirle a un LLM (Claude, GPT, etc.) que genere un **caso E2E nuevo** para la suite POSCLICK, combinando:

- `context.md` como base de conocimiento (RAG) — reglas, selectores, trucos y dataset ya conocidos.
- `tests/pos.fixtures.ts` — helpers ya implementados.
- **Playwright MCP** (`browser_*`) — para explorar en vivo lo que aún no está documentado.

> El objetivo es que el LLM **reutilice todo lo que ya está documentado** y **solo use el MCP para lo nuevo**, dejando como entregable adicional un parche para `context.md` que mantiene el RAG creciendo.

---

## Prompt — copiar y pegar

```
Vas a generar un nuevo caso E2E para la suite POSCLICK.

FUENTES DE VERDAD (en este orden):
1. context.md — reglas, selectores conocidos, trucos, dataset, defectos.
   Úsalo PRIMERO. Si el selector o el flujo ya está documentado, no lo
   busques en vivo: reutilízalo tal cual.
2. tests/pos.fixtures.ts — helpers ya implementados (login,
   liberarEntregasCajaPendientes, mockImpresion, etc.). Reutilízalos.
3. Playwright MCP (browser_*) — SOLO para lo que NO esté en 1 ni en 2.
   Para cada selector nuevo:
     a. browser_navigate a la pantalla relevante (login si hace falta).
     b. browser_snapshot para ver el accessibility tree.
     c. Si el id no es estable, browser_evaluate con un querySelector
        para confirmar que es único.
     d. Devuélveme el selector elegido y por qué:
        prioridad id > data-testid > getByRole(name) > CSS por atributo
        estable. Prohibido XPath basado en posición.

CASO A GENERAR:
- Objetivo: <...>
- Precondiciones: <...>
- Pasos: <...>
- Resultado esperado: <...>
- Criterios de aceptación: <...>

ENTREGABLE:
1. Un archivo .spec.ts siguiendo el estilo de
   tests/pos-flujos-avanzados.spec.ts (reutilizando los helpers de
   pos.fixtures.ts, respetando retries:0, workers:1 y el mock de
   impresión).
2. Un parche sugerido para context.md con los selectores y trucos
   nuevos descubiertos, listo para que yo lo revise y lo pegue
   (sección "Selectores clave" y/o "Trucos no obvios").
3. Si algo del DOM no coincide con lo que dice context.md, avísamelo
   explícitamente — significa que context.md está desactualizado.
```

---

## Cómo rellenar el bloque `CASO A GENERAR`

| Campo | Qué poner | Ejemplo |
|---|---|---|
| **Objetivo** | Qué comportamiento del POS se valida en una frase. | *"Validar que una devolución parcial de factura actualiza el stock correctamente."* |
| **Precondiciones** | Estado requerido antes de iniciar: caja, cliente, factura previa, cupo, etc. | *"Caja abierta, factura `FAC-00123` emitida hoy con 2 items."* |
| **Pasos** | Lista numerada en lenguaje de usuario (no de selectores). | *"1. Entrar a Devoluciones. 2. Buscar factura. 3. Marcar item 1 para devolver. 4. Confirmar."* |
| **Resultado esperado** | Qué debe pasar en UI + estado del sistema. | *"Modal de confirmación con monto a reembolsar. Stock del item 1 aumenta en 1."* |
| **Criterios de aceptación** | Asserts concretos que el caso debe verificar. | *"- Mensaje `Devolución exitosa` visible.\n- Botón `Imprimir voucher` habilitado."* |

Cuanto más concretos los campos, menos necesita el LLM "inventar" y menos retoques manuales tendrás después.

---

## Flujo recomendado (dos vueltas)

Separar **exploración** y **generación** da mejores resultados que pedir todo de una:

### Vuelta 1 — Exploración

Pídele al LLM solo lo siguiente antes del `.spec.ts` completo:

```
Antes de generar el .spec.ts, usa el MCP para:
1. Navegar las pantallas del caso.
2. Darme un snapshot del accessibility tree de cada una.
3. Listar los selectores nuevos propuestos (con la prioridad id >
   data-testid > getByRole > CSS atributo) y por qué los elegiste.
4. Marcar los que NO lograste identificar con un selector estable.

NO escribas el .spec.ts todavía.
```

Revisas la lista, confirmas los dudosos, y recién después vas a la vuelta 2.

### Vuelta 2 — Generación

```
Perfecto. Ahora genera el .spec.ts final usando esos selectores +
los helpers de pos.fixtures.ts + las reglas de context.md.
Al final, dame el parche para context.md.
```

---

## Reglas prácticas

- **Un caso = una sesión del MCP.** No dejes al modelo "explorar" sin objetivo; se gastan tokens y a veces inventa selectores de pantallas que no visitó.
- **Prioridad de selectores**, siempre explícita en el prompt: `id` → `data-testid` → `getByRole(name)` → CSS por atributo estable. **Prohibido XPath basado en posición.**
- **Snapshot antes de clickear.** Pídele que haga `browser_snapshot` y te lo muestre antes de interactuar, para validar que está en la pantalla correcta.
- **El MCP corre contra el POS real.** Las reglas de `context.md` siguen aplicando: `retries: 0`, `workers: 1`, mock de impresión. Si el caso toca caja/stock/cupo, avísalo en el prompt para que el LLM lo considere.
- **Cerrá el loop.** Cuando el caso pase en verde, pega el parche que te dio para `context.md`. La próxima vez ese flujo ya es "conocido" y no necesita MCP.

---

## Checklist antes de correr el `.spec.ts` generado

- [ ] `npm run typecheck` sin errores.
- [ ] El spec reutiliza `login`, `mockImpresion` y los helpers de `pos.fixtures.ts` existentes (no reimplementa cosas que ya están).
- [ ] Los selectores nuevos están marcados en el parche propuesto para `context.md`.
- [ ] No introduce `test.describe.configure({ mode: 'parallel' })` ni cambia `retries`.
- [ ] Primera corrida en modo headed: `npm run test:headed -- -g "<nombre del caso>"`.
- [ ] Si pasa, aplicar el parche a `context.md` y agregar el caso a la tabla *"Estado conocido"* del propio `context.md`.

---

## Alternativa sin MCP: `codegen` de Playwright

Si no tienes el MCP configurado, el equivalente manual es:

```bash
npx playwright codegen http://localhost:4200
```

Te abre un navegador que graba tus clicks y genera selectores automáticamente. Luego le pasas al LLM el bloque generado + `context.md` y le pides que lo "limpie" al estilo de la suite (reutilizando helpers, respetando reglas, etc.).
