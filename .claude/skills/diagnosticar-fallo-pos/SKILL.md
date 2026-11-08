---
name: diagnosticar-fallo-pos
description: Diagnostica un rojo, un verde sospechoso o un flake de la suite E2E POSCLICK leyendo la salida del runner, el trace y el video, y clasifica la causa en POS (defecto del producto), ENTORNO (túnel, SSO, fuera de línea), DATO (SKU sin stock, cupo agotado, oferta vencida) o SUITE (selector o Page Object). Propone el cambio mínimo con evidencia. Úsala ante cualquier fallo de la suite antes de corregir nada. No fuerza el verde ni arregla a ciegas.
---

# Diagnosticar un fallo de la suite POSCLICK

> En este proyecto un rojo **casi nunca es un bug del código de prueba**. Las cuatro causas pesan
> parecido, y la más cara es confundirlas: "arreglar" la suite por un problema de entorno deja un
> parche que esconde el síntoma. Esta skill clasifica antes de tocar.

## 1. Entrada

| Qué | Dónde está |
|---|---|
| `SALIDA` · la salida **completa** del runner, sin recortar | la terminal |
| `TEST` · el caso que falló, completo | `tests/pos-flujos-avanzados.spec.ts` |
| `PAGES` · las Page Objects que el caso usa en el paso que falló | `tests/pages/*.ts` |
| `ESPERADO` · qué debía pasar, según el criterio de aceptación | el caso / la HU |
| *(opcional)* `TRACE` | `evidencias/test-results/<caso>/trace.zip` |
| *(opcional)* `VIDEO` | `evidencias/test-results/<caso>/video.webm` (se graba **siempre**) |
| *(opcional)* `CAPTURAS` | `evidencias/casoN-*.png` |

Si `SALIDA` llega recortada, **pedila entera**. El mensaje de Playwright trae el locator exacto, el
timeout y el "Call log" con los reintentos: recortarlo borra justo la evidencia.

**Antes de leer nada: no corras el test de nuevo "a ver si pasa".** Una segunda corrida mueve datos
reales otra vez y `clean` borra el trace que necesitás para diagnosticar.

## 2. Procedimiento

1. **Ubicá el paso exacto.** Los casos loguean `[CasoN] i/X → <paso>`. El último log impreso dice
   dónde se cortó. Citá esa línea.
2. **Leé el encabezado del POS** en el video o la captura: `Fuera de línea`, `CENTRO xxx-xxx` y la
   versión de FE. Tres datos que resuelven la mitad de los diagnósticos sin abrir el trace.
3. **Clasificá la causa** con la tabla de §3. Si dos cuadran, **decilo**: no elijas por descarte.
4. **Reuní la evidencia** que respalda la causa: la línea de la salida, el minuto del video, el paso
   del trace, la respuesta HTTP. Una causa sin evidencia es una conjetura y se declara como tal.
5. **Contrastá con lo conocido**: tabla de defectos `context.md` (D-01…D-07), §Estado conocido
   (ese caso, ¿estaba en verde?), §FE `pbd-9-sync-develop` (catálogo de fallos de entorno ya vistos).
   Un comportamiento ya catalogado **no es un hallazgo nuevo**. Recordá que D-06 fue un falso
   positivo: el POM llenaba contadores con `fill()` y nunca consultaba inventario.
6. **Proponé el cambio mínimo**, con archivo y línea. Mínimo significa: el menor cambio que ataca
   **esa** causa. No aprovechar para refactorizar.

## 3. Las cuatro causas

| Causa | Señales típicas | Qué se hace |
|---|---|---|
| **ENTORNO** | `Fuera de línea` en el encabezado · `connection-status → 500` · `/login` ofrece "Iniciar Sesión Local" · `POST sales/v1/transaction → 500` y modal "No se pudo generar la transacción" · `curl localhost:4200` ≠ 200 · `Target page, context or browser has been closed` a los ~2 s · el calendario de entrega no despliega | **Se escala ya. No se toca la suite.** Revisar túneles (4200 **y** 3000), matar `ssh` zombis, reintentar. Tocar un selector acá esconde el síntoma |
| **DATO** | `Advertencia – No se encontraron datos.` (oferta vencida/404) · SKU inexistente en el centro · carrito bajo el mínimo de efectivo · cupo de crédito agotado o sobregirado · `El id de la transacción no corresponde al posId` (se cambió de caja con carrito abierto) | Se corrige el **dato**, no el código: `.env`, `centros.ts`, `npm run explorar:skus`. Si el caso debía saltarse, falta el `test.skip` **fuera** del fixture |
| **SUITE** | `strict mode violation: resolved to N elements` · `locator.click: Timeout` con el elemento visible en el video · `was called with undefined` (falta un método o campo en la Page) · `fill()` no sincronizó un `p-inputnumber` · click interceptado por un overlay | Se corrige la **Page Object**, nunca el spec: locator, `clickCustom`, teclear en vez de `fill`, `getByRole('dialog')` en vez de `.p-dialog` |
| **POS** | la UI hace algo distinto de lo que exige el criterio de aceptación, con el entorno sano y el dato correcto · un endpoint responde 400/500 con mensaje de negocio (ej. `/pos/v1/open` rechaza la apertura) | **Es un defecto del producto.** Se documenta como D-0N con su evidencia. El test refleja el comportamiento correcto, **no se ablanda la aserción para que pase** |

## 4. Límites — lo que nunca se hace para que pase

- **No agregar `waitForTimeout`, `sleep` ni milisegundos sueltos.** Si hay una carrera, se espera
  por la condición real (aserción con autoespera, `expect.poll`, respuesta HTTP).
- **No subir `timeout` ni `expect.timeout`** para tapar un fallo. Ya están en 15 min y 20 s.
- **No subir `retries`.** Vale para toda la suite y duplica transacciones reales.
- **No pasar a `mode: 'parallel'`** ni subir `workers`.
- **No ablandar una aserción** (quitarla, cambiarla por `toBeTruthy`, bajar un umbral) para obtener
  verde. Si la aserción está mal, se explica por qué y **decide la QA**.
- **No usar `.catch(() => undefined)` nuevo** para silenciar el paso que falla. Los que hay cubren
  casos declarados y documentados.
- **No volver a correr el test** sin permiso, y nunca como primer movimiento.
- **No tocar el caso ni su título** si la causa es ENTORNO o DATO.
- **No declarar defecto nuevo** sin pasar por D-01…D-07 primero.

## 5. Cuándo se para y se pregunta

- Cuando la evidencia **no distingue** entre POS y SUITE: ¿el POS está mal o la expectativa estaba mal?
- Cuando dos causas cuadran igual de bien.
- Cuando el arreglo exige un dato que no está en el repositorio (si hay cupo, si hay stock, si la
  oferta sigue vigente) o algo que tiene que preparar el equipo.
- Cuando el fallo contradice §Estado conocido: ese caso estaba en ✅ y algo cambió fuera de la suite.

## 6. Salida

En la conversación, en este orden:

1. **Dónde se cortó** — el `[CasoN] i/X → <paso>` y la línea de la salida.
2. **Causa** — `POS` | `ENTORNO` | `DATO` | `SUITE`, una sola, o dos con el empate declarado.
3. **Evidencia** — qué lo respalda: línea de la salida, encabezado del POS, respuesta HTTP, minuto
   del video, paso del trace. Literal, copiada, no parafraseada.
4. **Ya conocido** — fila de D-01…D-07 o de §FE que aplica, o `NUEVO`.
5. **Cambio mínimo** — archivo y línea, con el diff. Para `ENTORNO` y `DATO`: qué hacer **fuera** de
   la suite, y por qué no se toca el código.
6. **Cómo se comprueba** — el comando exacto, y **qué datos reales mueve**. No lo ejecutes: pedí
   permiso y esperá.
7. **Qué queda sin resolver** — lo que la evidencia no alcanzó a determinar, y qué haría falta.
8. **Parche a `context.md`** — si apareció un truco o un selector nuevo, se señala, no se aplica:
   lo produce `actualizar-context` y lo firma la QA.

---

*Skill de `posclick-e2e`. La llama `generar-caso-posclick` cuando una corrida da rojo, y se usa
suelta ante cualquier fallo de la suite.*
