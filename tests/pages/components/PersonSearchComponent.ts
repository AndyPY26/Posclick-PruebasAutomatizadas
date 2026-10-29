import { Page } from '@playwright/test';
import { clickCustom } from '../../fixtures/dataset';

/**
 * Componente reutilizable "búsqueda / asignación de persona".
 *
 * Se usa en dos lugares con IDs idénticos:
 *  - /pos-ui/invoice  → cliente de facturación.
 *  - /pos-ui/delivery → "Envío a" (persona de retiro).
 *
 * En /delivery conviven ambas instancias en el DOM (la de facturación oculta),
 * por eso todos los locators se filtran con `:visible`.
 */
export class PersonSearchComponent {
  constructor(private readonly page: Page) {}

  private readonly tipoDoc = this.page.locator('#mf_person_customer_search_document_type:visible').first();
  private readonly documento = this.page.locator('#mf_person_customer_search_document_number:visible').first();
  private readonly buscar = this.page.locator('#mf_person_customer_search_find_button:visible').first();
  // `add_button` (siempre visible) es "agregar cliente nuevo", NO limpiar.
  private readonly limpiar = this.page.locator('#mf_person_customer_search_clear_button:visible').first();

  /**
   * Asigna una persona. Si ya hay una asignada hay que limpiarla primero,
   * o el campo de búsqueda no existe.
   */
  async asignar(doc: string, tipo: 'CC' | 'RUC' = 'CC'): Promise<void> {
    if (await this.limpiar.isVisible().catch(() => false)) {
      await clickCustom(this.limpiar).catch(() => this.limpiar.click({ force: true }));
      await this.page.waitForTimeout(1_500);
    }
    if (tipo === 'RUC') {
      await this.tipoDoc.click();
      await this.page.locator('text=RUC').first().click({ force: true });
    }
    await this.documento.fill(doc);
    await clickCustom(this.buscar).catch(() => this.documento.press('Enter'));
    await this.page.waitForTimeout(2_500);
    await this.cerrarDescuentosClienteSiAplica();
  }

  /**
   * FE 1.13.0: clientes con descuento permanente/colaborador abren el modal
   * informativo "Descuentos disponibles para el cliente" (solo botón Aceptar).
   * Si no se acepta, la asignación del cliente no se completa y bloquea
   * "Continuar" del carrito.
   */
  async cerrarDescuentosClienteSiAplica(): Promise<boolean> {
    const titulo = this.page.locator('text=Descuentos disponibles para el cliente');
    const visible = await titulo
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) return false;
    console.log('[PersonSearch] modal "Descuentos disponibles para el cliente" → Aceptar');
    await this.page.evaluate(() => {
      const d = Array.from(document.querySelectorAll('.p-dialog')).find((x) =>
        /Descuentos disponibles para el cliente/.test(x.textContent || ''),
      );
      const btn = Array.from(d?.querySelectorAll('button') ?? []).find((b) =>
        /Aceptar/.test(b.textContent || ''),
      ) as HTMLButtonElement | undefined;
      btn?.click();
    });
    await titulo.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    await this.page.waitForTimeout(1_500);
    return true;
  }
}
