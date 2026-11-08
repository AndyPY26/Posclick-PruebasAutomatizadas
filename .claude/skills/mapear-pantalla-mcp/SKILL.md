---
name: mapear-pantalla-mcp
description: Explora una pantalla del POS con el MCP de Playwright y propone locators con origen verificado, siguiendo la jerarquía de POSCLICK (id FE > id escapado > rol+filtro > texto). Es la "vuelta 1" antes de escribir un caso. Úsala cuando falte un selector en context.md, cuando el DOM haya cambiado tras un despliegue del FE, o cuando haya que mapear una pantalla nueva. NO escribe tests ni Page Objects.
---

# Mapear una pantalla del POS con el MCP

> Es la **vuelta 1** del flujo de dos vueltas (`README.md` §Flujo híbrido). Separar exploración de
> generación da mejores resultados que pedir todo junto. Esta skill **solo explora**: no escribe
> `.spec.ts`, no escribe Page Objects y no toca `context.md`.

## 1. Entrada

| Qué | Ejemplo |
|---|---|
| `PANTALLA` · ruta o nombre del módulo | `/pos-ui/pay` · "Entrega de Caja" |
| `OBJETIVO` · qué elementos hacen falta y para qué | "los 3 campos del modal de registro de efectivo" |
| `PRECONDICIÓN` · cómo se llega a esa pantalla | "caja abierta + carrito cargado + Continuar" |
| *(opcional)* `SOSPECHA` · qué dice hoy `context.md` sobre esa pantalla | §Selectores clave, fila N |

Si falta `PRECONDICIÓN` y la pantalla no es alcanzable desde `/login`, **pará y pedila**.
El POS no es navegable por URL directa: casi todo exige caja abierta y estado previo.

## 2. Antes de abrir el navegador

1. **Buscá primero en lo ya documentado.** En este orden: `context.md` §Selectores clave →
   `context.md` §Trucos no obvios → la Page Object correspondiente en `tests/pages/`.
   **Si ya está documentado, no lo busques en vivo: reutilizalo tal cual y decilo.**
   El MCP es solo para lo que NO está en ninguno de los tres.
2. **Comprobá que el POS responde:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4200/login   # → 200
   ```
   Distinto de 200 → los túneles SSH están caídos (`README.md` §Ejecución local). Pará ahí: sin
   app no hay exploración, y el puerto 3000 también tiene que estar arriba o la app queda en blanco.
3. **Avisá qué vas a tocar.** El MCP corre contra el **POS real**. Si la precondición implica
   abrir caja, cargar carrito, asignar cliente o usar cupo de crédito, **decilo antes de empezar**
   y esperá el OK.

## 3. Procedimiento

1. `browser_navigate` a `/login` y hacé el login SSO. El navegador debe correr en **esta** máquina
   (`redirect_uri=http://localhost:4200`).
2. `browser_snapshot` **y mostralo** antes de interactuar con nada. Sirve para confirmar que estás
   en la pantalla correcta, no para adivinarla.
3. Avanzá hasta `PANTALLA` siguiendo `PRECONDICIÓN`, con un `browser_snapshot` por pantalla.
4. Para **cada** elemento del `OBJETIVO`, elegí el locator por la jerarquía de `CLAUDE.md` §4:
   `id FE` → `id escapado` → `id + fallback` → `id parametrizado` → `rol + filtro` → `texto` →
   `contenedor por título`.
5. **Confirmá unicidad con `browser_evaluate`**, no a ojo:
   ```js
   () => document.querySelectorAll('<selector>').length
   ```
   Distinto de 1 → el locator no sirve como está. Anotá cuántos devolvió y buscá cómo acotarlo.
6. **Revisá los cuatro matices de PrimeNG** que ya están documentados, y decí cuáles aplican:
   `p-inputnumber` (hay que teclear), `p-select` (teclado, sin interrupciones),
   `lib-button`/`p-button` (`clickCustom`), modales sin `.p-dialog` (`modal_dialog_id_*` dinámico →
   `getByRole('dialog')` + título).
7. **Contrastá con `context.md`.** Si algo ya documentado **no coincide** con el DOM real, es un
   hallazgo de primer orden: decilo aparte y explícito.

## 4. Verificación — rúbrica, de 1 a 3 por criterio, total sobre 12

Todo puntaje menor a 3 cita **qué elemento** y **por qué**. Un número sin motivo no vale.
**No se compensa: solo `12/12` habilita pasar a la vuelta 2.**

| Criterio | 3 | 2 | 1 |
|---|---|---|---|
| Jerarquía | todos en los niveles 1-4 (id) | alguno en nivel 5-7, justificado | texto o posición sin justificar |
| Unicidad | `querySelectorAll().length === 1` en todos, con la salida copiada | alguno sin comprobar | alguno devuelve ≠ 1 |
| Origen | cada uno con su snapshot y la pantalla donde se vio | alguno sin pantalla | alguno propuesto de memoria |
| Contraste | se revisó `context.md` y se declaró coincide / contradice / no estaba | revisión parcial | no se revisó |

## 5. Límites

- **No escribe ni edita ningún archivo.** Ni `.spec.ts`, ni Page Objects, ni `context.md`.
- **No propone un selector que no vio en un snapshot.** De memoria no vale, aunque "suene" al
  patrón `mf_*` del resto del FE.
- **No usa XPath posicional** ni `nth()` sobre listas que el FE puede reordenar.
- **No deja el POS en estado sucio**: si cargó un carrito, lo vacía antes de terminar. Un carrito
  abierto bloquea la Apertura de caja de la próxima corrida con el modal "Factura en curso".
- **No explora de más.** Un objetivo = una sesión. Sin objetivo, el modelo inventa selectores de
  pantallas que no visitó.
- **Nunca escribe ni loguea** credenciales, cédulas completas, tramas de supervisor ni cupones.

## 6. Salida

En la conversación, en este orden:

1. **Ya documentado** — qué elementos del objetivo salieron de `context.md` / Page Object, sin tocar
   el navegador, y de qué fila o archivo.
2. **Mapa nuevo** — una fila por elemento:

   | Elemento | Locator propuesto | Nivel (1-7) | `querySelectorAll().length` | Pantalla / snapshot |
   |---|---|---|---|---|

3. **No resueltos** — elementos sin locator estable, con qué devolvió el `evaluate` y qué haría falta
   (p. ej. que el FE agregue un id). Nunca se rellenan con una conjetura.
4. **Matices de interacción** que aplican, de los cuatro de `CLAUDE.md` §5.
5. **Contradicciones con `context.md`** — qué dice el archivo, qué muestra el DOM. Si hay alguna,
   **el parche lo decide la QA** con la skill `actualizar-context`; esta skill no lo aplica.
6. **Rúbrica** con los cuatro puntajes y el total.
7. **Estado del POS al terminar** — carrito vaciado, modales cerrados, sesión abierta o cerrada.

---

*Skill de `posclick-e2e`. Alimenta a `generar-caso-posclick` y a `actualizar-context`.*
