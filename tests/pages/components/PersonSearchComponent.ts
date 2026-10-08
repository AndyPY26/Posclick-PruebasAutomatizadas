import { Page } from '@playwright/test';

/**
 * Componente reutilizable "búsqueda / asignación de persona".
 *
 * Se usa en dos lugares con IDs idénticos:
 *  - /pos-ui/invoice  → cliente de facturación.
 *  - /pos-ui/delivery → "Envío a" (persona de retiro).
 */
export class PersonSearchComponent {
  constructor(private readonly page: Page) {}

  private readonly tipoDoc = this.page.locator('#mf_person_customer_search_document_type');
  private readonly documento = this.page.locator('#mf_person_customer_search_document_number');
  private readonly buscar = this.page.locator('#mf_person_customer_search_find_button');
  private readonly limpiar = this.page.locator('#mf_person_customer_search_clear_button');

  /**
   * Asigna una persona. Si ya hay una asignada hay que limpiarla primero,
   * o el campo de búsqueda no existe.
   */
  async asignar(documento: string, tipo: 'CC' | 'RUC' = 'CC'): Promise<void> {
    if (await this.limpiar.isVisible().catch(() => false)) {
      await this.limpiar.click();
      await this.page.waitForTimeout(1_500);
    }
    if (tipo === 'RUC') {
      await this.tipoDoc.first().click();
      await this.page.locator('text=RUC').first().click();
    }
    await this.documento.fill(documento);
    await this.buscar.click();
    await this.page.waitForTimeout(2_500);
  }
}
