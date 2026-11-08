---
name: actualizar-context
description: Genera el parche para context.md después de un caso verde, un hallazgo de exploración o un defecto nuevo, en el formato exacto de cada sección (Selectores clave, Trucos no obvios, Estado conocido, Defectos, Datos de prueba). Es el paso de cierre del ciclo RAG. Úsala cuando un caso pase, cuando el DOM cambie tras un despliegue del FE o cuando aparezca un truco de interacción nuevo. Propone el parche; no lo aplica ni marca nada como aceptado.
---

# Actualizar la base de conocimiento (`context.md`)

> `context.md` es el RAG de la suite: cuanto más denso y actualizado, menos exploración en vivo
> necesita el próximo caso. **Este es el paso que casi siempre se olvida**, y sin él el archivo se
> desactualiza y la IA genera código que falla en `click` o `fill`.
>
> Esta skill **propone el parche; no edita el archivo.** Lo pega la QA.

## 1. Entrada

| Qué | De dónde viene |
|---|---|
| `HALLAZGO` · qué se descubrió | corrida verde, `mapear-pantalla-mcp`, `diagnosticar-fallo-pos` |
| `EVIDENCIA` · qué lo respalda | snapshot, salida del runner, respuesta HTTP, video |
| `FECHA` · cuándo se verificó | la fecha real de la corrida, no la de hoy por defecto |
| `ENTORNO` · versión de FE y centro | encabezado del POS: `FE <versión>` · `CENTRO xxx-xxx` |

Sin `EVIDENCIA` y sin `ENTORNO`, **pará y pedilos**. Una línea de `context.md` sin fecha ni versión
no se puede auditar después, y este archivo ya tiene historial de cambios de FE entre centros.

## 2. A qué sección va cada cosa

| Hallazgo | Sección de `context.md` |
|---|---|
| Selector que vas a usar más de una vez | §Selectores clave — fila `selector \| vive en <Page>.ts` |
| Comportamiento de UI que un modelo no adivinaría (PrimeNG, modal, secuencia) | §Trucos no obvios |
| Comportamiento propio de una versión de FE | §FE `<rama/versión>` (subsección por versión) |
| Caso que pasó, se saltó o falló | §Estado conocido — tabla del entorno correspondiente |
| Defecto del producto nuevo | §Estado conocido → párrafo **Defectos**, como `D-0N` |
| Dato de prueba nuevo (cédula, cupón, SKU, centro) | §Datos de prueba — **solo la variable, nunca el valor** |
| Regla de ejecución nueva e invariante | §Reglas críticas — y avisá: probablemente también va a `CLAUDE.md` |

**Si no encaja en ninguna, no inventes una sección.** Decilo y dejá que la QA decida dónde va.

## 3. Procedimiento

1. **Comprobá que no está ya.** Buscá antes de proponer:
   ```bash
   grep -n "<selector o palabra clave>" context.md ARQUITECTURA.md README.md
   ```
   Si ya está y **coincide**, no hay parche: decilo. Si ya está y **contradice** lo observado, el
   parche es un **reemplazo**, y se muestran las dos versiones lado a lado.
2. **Escribí en el formato de la sección destino**, no en uno propio. Cada sección tiene su forma:
   §Selectores clave es una tabla de dos columnas; §Trucos no obvios son viñetas que empiezan en
   **negrita** con el tema; §Estado conocido es una tabla `Caso | Estado | Notas` con ✅ / ❌ / ⏭.
3. **Fechá y versioná todo.** El estilo del archivo es `(verificado 2026-10-27)`, `2026-10-19:`,
   `FE 1.13.0`, `caja 004-150`. Un hallazgo sin fecha envejece sin que nadie lo note.
4. **Decí qué NO se verificó.** Si el selector se vio en 004-112 y no en 004-150, eso va escrito.
   El archivo ya distingue por centro porque la suite es agnóstica al centro y los datos no.
5. **Un parche por hallazgo.** No mezcles un selector nuevo con un cambio de estado de tres casos:
   la QA tiene que poder aceptar uno y rechazar otro.

## 4. Límites

- **No edita `context.md`, `README.md` ni `ARQUITECTURA.md`.** Entrega el bloque listo para pegar.
- **No escribe un valor real** de cédula, credencial, trama de supervisor, cupón ni código de
  vendedor. En §Datos de prueba va el **nombre de la variable** de `.env` y la nota, nunca el valor.
  Las cédulas de ejemplo, enmascaradas (`******1234`).
- **No marca un caso como ✅** en §Estado conocido por su cuenta: lo propone con su evidencia, y lo
  firma la QA. Lo mismo para pasar un defecto a `~~D-0N~~ resuelto`.
- **No numera un defecto nuevo** sin revisar D-01…D-07 primero. Si el síntoma ya está descrito, es
  una nota al defecto existente, no un `D-08`.
- **No borra historial.** `context.md` conserva el estado de corridas anteriores y los cambios de
  FE a propósito. Si algo queda obsoleto, se tacha (`~~…~~`) con la fecha, no se elimina.
- **No propone un hallazgo que no vio con evidencia propia.** Nada por inferencia del patrón `mf_*`.

## 5. Salida

En la conversación, en este orden:

1. **Qué ya estaba** — qué parte del hallazgo ya figura en `context.md` y en qué línea.
2. **Parche propuesto** — un bloque por sección destino, en el formato de esa sección, listo para
   pegar, encabezado por la sección y la línea donde va:

   ````
   ### context.md → §Trucos no obvios (después de la línea 142)
   ```markdown
   - **<Tema en negrita>:** <qué pasa y qué hacer>. Visto el <fecha> en FE <versión>, CENTRO <xxx-xxx>.
   ```
   ````

3. **Reemplazos** — si algo contradice lo documentado: `ANTES` / `DESPUÉS` lado a lado, con la línea.
4. **Evidencia por línea del parche** — qué respalda cada afirmación. Sin esto el parche no se pega.
5. **No verificado** — qué queda fuera del alcance de la evidencia (otro centro, otra versión de FE,
   otro rol de usuario).
6. **Decisiones para la QA** — numeradas, para que las firme una por una: marcar ✅, abrir `D-0N`,
   tachar un obsoleto, sumar una variable a `.env.example`.

---

*Skill de `posclick-e2e`. Cierra el ciclo que abren `mapear-pantalla-mcp`, `generar-caso-posclick`
y `diagnosticar-fallo-pos`: lo aprendido vuelve al RAG y la próxima vuelta necesita menos exploración.*
