---
name: generar-caso-posclick
description: Escribe un caso E2E nuevo para la suite POSCLICK al estilo de pos-flujos-avanzados.spec.ts, reutilizando los Page Objects y el fixture pos existentes, y lo verifica con una rúbrica de cuatro criterios más typecheck y --list. Úsala cuando haya que agregar un caso de prueba, automatizar un flujo del POS o convertir una historia de usuario en un .spec.ts. Pide permiso antes de ejecutar nada contra el POS y entrega CANDIDATO, nunca ACEPTADO.
---

# Generar un caso E2E de POSCLICK

> Es la **vuelta 2** del flujo de dos vueltas. Empaqueta `PLANTILLA-CASO-NUEVO.md` como
> procedimiento ejecutable. Escribe código, así que trabaja bajo todas las reglas de `CLAUDE.md`.

## 1. Entrada

| Qué | Ejemplo |
|---|---|
| `OBJETIVO` · qué comportamiento del POS se valida, en una frase | "una devolución parcial actualiza el stock" |
| `PRECONDICIONES` · estado requerido antes de empezar | "caja abierta, factura de hoy con 2 ítems" |
| `PASOS` · lista numerada en lenguaje de usuario, sin selectores | "1. Entrar a Devoluciones. 2. Buscar factura…" |
| `RESULTADO ESPERADO` · qué pasa en UI y en el estado del sistema | "modal con monto a reembolsar; stock +1" |
| `CRITERIOS DE ACEPTACIÓN` · los asserts concretos | "mensaje `Devolución exitosa` visible" |
| `DATOS` · qué datos reales necesita y de dónde salen | "cédula de `E2E_CEDULA_POOL`" |
| *(opcional)* `MAPA` · salida de `mapear-pantalla-mcp` | tabla de locators con origen |

Si falta una, **pará y pedila**. En particular: sin `CRITERIOS DE ACEPTACIÓN` no hay qué asegurar,
y un caso sin aserciones es un script de clicks, no una prueba.

**Antes de escribir una sola línea**, resolvé esto y decilo:

- ¿El flujo ya está documentado en `context.md` (§Selectores clave / §Trucos no obvios)?
  **Si sí, se reutiliza tal cual.** Si no, falta la vuelta 1: pedí `mapear-pantalla-mcp` primero.
- ¿El caso choca con un defecto conocido D-01…D-07? El D-07 (tope de $2.000 en efectivo) obliga a
  acotar el carrito con `cargarCarritoConTope(min, max)` en cualquier caso que cobre en efectivo.
- ¿Depende de un dato del centro (oferta vigente, cupo de crédito)? Entonces necesita `test.skip`
  **fuera** del fixture.

## 2. Fase generar

1. **Leé antes de escribir**, en este orden: `tests/fixtures/pos.fixture.ts` →
   `tests/pos-flujos-avanzados.spec.ts` (un caso completo, como molde de estilo) →
   las Page Objects de las pantallas que toca el caso → `tests/fixtures/dataset.ts`.
2. **Reutilizá, no reimplementes.** Antes de crear cualquier helper, buscalo:
   ```bash
   grep -rn "<nombre>" tests/
   ```
   Ya existen: `clickCustom`, `seleccionarEnDropdown`, `cerrarDialogos`, `mockImpresion`,
   `evidencia`, `generarCarrito`, `cargarCarritoConTope`, `tomarCedulas`, `montoDe`,
   `numeroDeCuotas`, `datosCaja`, `skuPool`. Duplicar una utilidad ya costó una consolidación
   desde 4 copias (`ARQUITECTURA.md` §6): no la repitas.
3. **El spec expresa intención de negocio, cero selectores.** Si el caso necesita tocar el DOM,
   eso va en la Page Object, no en el spec. Pantalla existente → método nuevo en su Page;
   pantalla nueva → clase nueva en `tests/pages/` con el molde de las existentes
   (`constructor(private readonly page: Page)`, locators como campos privados `readonly`).
4. **Molde del caso**, igual al resto de la suite:
   ```ts
   test('Caso N: <qué se valida, en lenguaje de negocio>', async ({ pos }) => {
     const { invoice, page } = pos;
     console.log('[CasoN] 1/X → <paso>');
     // …
     await evidencia(page, 'casoN-01-<qué muestra>');
   });
   ```
   Numeración `i/total` en cada `console.log` y una `evidencia()` por hito verificable.
5. **Datos siempre del `.env`**, por las funciones perezosas de `dataset.ts`. Nunca un literal de
   cédula, cupón, credencial o trama. Dato nuevo → agregalo a `.env.example` (nombre y comentario,
   **sin valor**) y leelo con `envRequerida` / `envOpcional`.
6. **Si el caso depende de datos del centro**, el skip va envuelto:
   ```ts
   test.describe(() => {
     test.skip(() => !datosCaja().oferta?.vigente, 'Saltado: <motivo y dónde se configura>.');
     test('Caso N: …', async ({ pos }) => { /* … */ });
   });
   ```
7. **Selector sin confirmar** → marcalo `// TODO: confirmar selector` y listalo en la salida.
   No lo escondas dentro del código esperando que pase.
8. **Tocá un solo archivo de test.** Los Page Objects que haga falta, sí. `playwright.config.ts`,
   `global-setup.ts` y `pos.fixture.ts` **no se modifican** sin pedirlo explícitamente.

## 3. Fase verificar

### 3.1 Estático — sin permiso, no toca el POS

```bash
npm run typecheck                    # sin salida = OK
npx playwright test --list           # el caso nuevo aparece con su título
grep -rn "waitForTimeout" <archivo>  # ninguna espera fija nueva
grep -rn "retries\|fullyParallel\|workers\|mode: 'parallel'" <archivo>   # vacío
```

Copiá **comando y salida literales**. Un resumen ("compiló bien") no es evidencia.

### 3.2 Rúbrica — de 1 a 3 por criterio, total sobre 12

Todo puntaje menor a 3 **cita la línea** del archivo. Un número sin línea no vale.
**No se compensa: solo `12/12` permite pedir la corrida.**

| Criterio | 3 | 2 | 1 |
|---|---|---|---|
| Locators y origen | todos de nivel 1-4 (id FE) con su fila de `context.md` o del `MAPA` | alguno de nivel 5-7 justificado, o alguno `SIN FUENTE` | texto sin justificar, `nth()`, XPath |
| Reutilización | usa el fixture `pos` y Pages/helpers existentes; cero duplicados | crea un helper que podría haber reutilizado | reimplementa login, carrito o utilidades que ya existen |
| Capas | el spec no nombra ni un selector; todo el DOM vive en Pages | un selector suelto en el spec | el spec manipula el DOM directo |
| Reglas críticas | respeta las 5 de `CLAUDE.md` §2; `test.skip` fuera del fixture si aplica; datos del `.env` | una regla al límite, declarada | rompe una regla crítica |

### 3.3 Corrida real — SOLO con permiso explícito

**Pará y pedí autorización.** Decí literalmente, antes de preguntar:

- el comando exacto: `npx playwright test -g "Caso N:" --headed`
- **qué datos mueve**: stock, caja, cupo de crédito, cédula que va a usar
- que `pretest` → `clean` **borra `evidencias/` de la corrida anterior**

Esperá la respuesta. **Un "sí" vale para una corrida, no para las tres.**
Con permiso, ejecutá **exactamente ese comando**, sin filtros extra ni otro reporter, y copiá
comando, exit code, pasados, fallidos y duración, **literales**.

Si falla, pasá a `diagnosticar-fallo-pos` antes de tocar nada. No corrijas a ciegas.

## 4. Límites

- **No ejecuta nada contra el POS sin permiso explícito**, ni siquiera "una prueba rápida".
- **No corre `npm test`** (la suite entera) nunca: mueve los 7 casos y borra toda la evidencia.
- **No modifica** `playwright.config.ts`, `global-setup.ts`, `pos.fixture.ts`, los casos existentes
  ni sus títulos, ni las Page Objects más allá de **agregar** lo que el caso nuevo necesita.
- **No borra ni renombra** nada que una Page ya exponía: otros casos la usan.
- **No sube `retries`, no agrega `waitForTimeout`, no cambia a `mode: 'parallel'`.**
- **No escribe un valor real** de cédula, credencial, trama o cupón en ningún archivo ni en el chat.
- **No edita `context.md`**: el parche lo produce `actualizar-context` y lo firma la QA.
- **No escribe `ACEPTADO`** ni marca ✅ en §Estado conocido. Esa palabra es de la QA.
- **No declara un defecto nuevo** sin contrastarlo con D-01…D-07.

## 5. Salida

En la conversación, en este orden:

1. **Resultado** — `CANDIDATO` (12/12 + exit code 0) o `PENDIENTE DE CORRIDA` (12/12, sin permiso
   aún) o `ESCALADO` (con qué falta). **Nunca `ACEPTADO`.**
2. **Qué se reutilizó** — fixture, Pages, helpers, con sus nombres.
3. **Archivos escritos** — la lista completa, y la confirmación de que ningún otro fue tocado.
4. **Rúbrica** — cuatro puntajes, total, con las líneas citadas.
5. **Origen de los locators** — tabla `elemento · locator · fila de context.md o del MAPA o SIN FUENTE`.
6. **Evidencia ejecutable** — comandos y salidas literales (typecheck, `--list`, greps y, si hubo
   permiso, la corrida con exit code y conteos).
7. **`TODO: confirmar selector`** — la lista, o "ninguno".
8. **Alcance** — qué NO demuestra este verde (datos del centro, hardware, impresión, otros centros).
9. **Pendiente de la QA** — qué tiene que decidir o verificar, incluido el parche a `context.md`.

---

*Skill de `posclick-e2e`. Consume `mapear-pantalla-mcp`; cuando falla, llama a
`diagnosticar-fallo-pos`; cuando pasa, su cierre es `actualizar-context`.*
