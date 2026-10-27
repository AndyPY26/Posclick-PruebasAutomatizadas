import fs from 'node:fs';
import { test } from '../fixtures/pos.fixture';
import { CENTROS_DATA } from '../fixtures/centros';
import { cajaActual, datosCaja } from '../fixtures/dataset';

/**
 * Utilidad (no es un caso de negocio): cosecha SKUs que existen y tienen stock
 * en el centro actual del POS, probando el pool de otro centro.
 *
 *   npm run explorar:skus                 → prueba el pool de 004-150
 *   E2E_EXPLORAR_ORIGEN=004-xxx  (opcional) → otro centro de origen
 *
 * Solo corre cuando se apunta a este archivo (ver playwright.config.ts), para
 * que `npm test` no lo incluya. Agrega cada SKU al carrito, lee su precio y lo
 * quita; no emite ninguna venta. El resultado queda en
 * evidencias/skus-<centro>.json para copiarlo a tests/fixtures/centros.ts.
 */
const OBJETIVO = 15;

// A nivel de archivo: se salta antes de hacer login en las corridas normales.
test.skip(!process.env.E2E_EXPLORAR_SKUS, 'Utilidad: correr con npm run explorar:skus');

test('Explorar SKUs disponibles en el centro actual', async ({ pos }) => {
  test.setTimeout(45 * 60 * 1000);
  const { invoice } = pos;

  const origen = process.env.E2E_EXPLORAR_ORIGEN || '004-150';
  test.skip(
    origen === cajaActual(),
    `El POS está en ${origen}, el mismo centro de origen: no hay SKUs nuevos que probar.`,
  );
  const conocidos = new Set(datosCaja().skus);
  const candidatos = (CENTROS_DATA[origen]?.skus ?? []).filter((s) => !conocidos.has(s));
  console.log(`[explorar] centro=${cajaActual()} origen=${origen} candidatos=${candidatos.length}`);

  const encontrados: { sku: string; precio: number }[] = [];
  for (const sku of candidatos) {
    if (encontrados.length >= OBJETIVO) break;
    const antes = await invoice.leerTotal();
    const ok = await invoice
      .cargarCarrito([{ sku, cantidad: 1 }])
      .then((c) => c.length > 0)
      .catch(() => false);
    if (!ok) continue;
    const precio = Math.round((await invoice.leerTotal() - antes) * 100) / 100;
    encontrados.push({ sku, precio });
    console.log(`[explorar] ✔ ${sku} $${precio} (${encontrados.length}/${OBJETIVO})`);
    await invoice.quitarProducto(sku);
  }

  const archivo = `./evidencias/skus-${cajaActual()}.json`;
  fs.writeFileSync(archivo, JSON.stringify(encontrados, null, 2));
  console.log(
    `[explorar] ${encontrados.length} SKUs nuevos → ${archivo}\n` +
      `[explorar] para centros.ts: ${encontrados.map((e) => `'${e.sku}'`).join(', ')}`,
  );
});
