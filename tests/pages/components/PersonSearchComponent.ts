import { Page, Locator } from '@playwright/test';

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

  /** find/clear son <lib-button>: el ngClick vive en el <button> interno. */
  private async clickCustom(locator: Locator): Promise<void> {
    await locator.evaluate((el: HTMLElement) => {
      const btn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') as HTMLElement | null);
      btn?.click();
    });
  }

  /**
   * Asigna una persona. Si ya hay una asignada hay que limpiarla primero,
   * o el campo de búsqueda no existe.
   */
  async asignar(doc: string, tipo: 'CC' | 'RUC' = 'CC'): Promise<void> {
    if (await this.limpiar.isVisible().catch(() => false)) {
      await this.clickCustom(this.limpiar).catch(() => this.limpiar.click({ force: true }));
      await this.page.waitForTimeout(1_500);
    }
    if (tipo === 'RUC') {
      await this.tipoDoc.click();
      await this.page.locator('text=RUC').first().click({ force: true });
    }
    await this.documento.fill(doc);
    await this.clickCustom(this.buscar).catch(() => this.documento.press('Enter'));
    await this.page.waitForTimeout(2_500);
  }
}
