---
description: Genera y verifica un caso E2E de POSCLICK con evidencia real. Cierra su ciclo hasta 3 intentos, pide permiso explícito antes de cada corrida contra el POS, y entrega CANDIDATO o ESCALADO. Nunca ACEPTADO.
argument-hint: [objetivo del caso, o la ruta del archivo con el caso a generar]
---

Actuá como `@caso-agent` sobre la suite E2E POSCLICK. Usá las skills `mapear-pantalla-mcp`,
`generar-caso-posclick`, `diagnosticar-fallo-pos` y `actualizar-context`, y respetá `CLAUDE.md`.

Caso pedido: $ARGUMENTS

> **Este archivo no es el agente: es su recorrido.** El agente aparece cuando el recorrido corre en
> una herramienta que lee y escribe archivos y ejecuta comandos, y decide sola el siguiente paso.
>
> **Vive como slash command y no como subagente a propósito**: un subagente corre aislado y no
> puede parar a pedirte permiso a mitad del ciclo. Acá ese gate es la regla más importante, porque
> cada corrida mueve stock, caja y cupo de crédito reales.

## Entradas

`OBJETIVO` · `PRECONDICIONES` · `PASOS` · `RESULTADO ESPERADO` · `CRITERIOS DE ACEPTACIÓN` · `DATOS`.
Si falta una, **pará y pedila**. No arranques con la mitad: un caso sin criterios de aceptación es
un script de clicks.

Opcional: `MAPA` (salida previa de `mapear-pantalla-mcp`) y el reporte del intento anterior.

## Ciclo — máximo 3 intentos

### 0. PREPARAR
Leé `CLAUDE.md`, `context.md` (§Reglas críticas, §Selectores clave, §Trucos no obvios,
§Estado conocido), `tests/fixtures/pos.fixture.ts`, un caso existente como molde y las Page Objects
de las pantallas que toca el caso.

**Decidí si hace falta explorar:** ¿todos los selectores del caso están en `context.md` o en una
Page? Si falta alguno → `mapear-pantalla-mcp` primero (eso también toca el POS: pedí permiso).
Si están todos, saltá directo a GENERAR y decí que no hizo falta MCP.

### 1. GENERAR
Fase generar de `generar-caso-posclick`. Escribí **solo** el archivo de test y las Page Objects que
el caso nuevo necesite. `playwright.config.ts`, `global-setup.ts` y `pos.fixture.ts` no se tocan.

### 2. VERIFICAR (estático)
`npm run typecheck` · `npx playwright test --list` · los greps de control · la rúbrica de 12.
Nada de esto toca el POS: corre sin permiso. Copiá comandos y salidas **literales**.

### 3. GATE — pará y pedí permiso
**Siempre, en cada intento.** Un "sí" vale para **una** corrida, no para las tres. Decí:

- el comando exacto: `npx playwright test -g "Caso N:" --headed`
- **qué datos reales mueve**: stock, caja, cupo de crédito, qué cédula usa
- que `pretest` → `clean` **borra `evidencias/` de la corrida anterior**
- el resultado de la rúbrica, para que la QA decida con eso a la vista

**Esperá la respuesta.** Si la rúbrica no llegó a 12/12, **no pidas la corrida**: corregí primero.
Si la QA dice que no, entregá `PENDIENTE DE CORRIDA` con todo lo estático hecho y terminá ahí.

### 4. EJECUTAR
Solo con el permiso dado, **exactamente el comando anunciado**. Un caso, nunca `npm test`.
Copiá comando, exit code, pasados, fallidos y duración, literales.

### 5. OBSERVAR Y DECIDIR

| Qué pasó | Qué hacés |
|---|---|
| **12/12 y exit code 0** | No hay otro intento. Estado `CANDIDATO`, decisión humana `PENDIENTE`. Pasá a CIERRE |
| **Exit code 0 con rúbrica < 12** | El caso pasa pero no terminó: corrección mínima en la línea que cita la rúbrica, y otro intento |
| **Rojo** | `diagnosticar-fallo-pos` **antes** de tocar nada. Según la causa: |
| → causa `SUITE` | corrección mínima que la evidencia respalda, y otro intento |
| → causa `DATO` | **escalá ya**: el arreglo está en `.env` / `centros.ts` / `explorar-skus`, no en el código. O falta un `test.skip` fuera del fixture — si es eso, corregilo y otro intento |
| → causa `ENTORNO` | **escalá ya**, aunque queden intentos. Tocar la suite no arregla un túnel caído |
| → causa `POS` | **escalá ya**: es un defecto del producto. El test queda reflejando el comportamiento correcto. **No ablandes la aserción para obtener verde** |

### 6. LÍMITE
Si el intento 3 no llega a `12/12 + exit code 0`, estado `ESCALADO`: los tres resultados, la causa
pendiente y qué dato o decisión necesitás de la QA.

### 7. CIERRE
Con `CANDIDATO`, llamá a `actualizar-context` y entregá el parche propuesto. **No lo apliques.**

## Lo que este agente nunca hace

- Ejecutar contra el POS sin permiso explícito **de esa corrida**.
- Correr `npm test` (la suite entera).
- Subir `retries`, `timeout` o `workers`; pasar a `mode: 'parallel'`; agregar `waitForTimeout`.
- Ablandar o quitar una aserción para obtener verde.
- Editar `context.md`, `README.md` o `ARQUITECTURA.md`.
- Escribir un valor real de credencial, cédula, trama o cupón.
- Escribir `ACEPTADO` o marcar ✅ en §Estado conocido. Esa decisión es de la QA.

## Respuesta final

Estado (`CANDIDATO` | `ESCALADO` | `PENDIENTE DE CORRIDA`) · intentos usados de 3 · archivos
modificados y confirmación de que ningún otro · rúbrica por criterio · comando y exit code
literales · pasados y fallidos · locators `SIN FUENTE` y `TODO: confirmar selector` · qué datos
reales se movieron · parche propuesto a `context.md` · **decisión humana pendiente**.

---

*Primer recorrido de `posclick-e2e` que cierra su propio ciclo, con un gate humano en cada vuelta.*
