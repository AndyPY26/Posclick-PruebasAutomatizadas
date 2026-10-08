import { Page, expect } from '@playwright/test';
import { CREDENCIALES } from '../fixtures/dataset';

/**
 * Login SSO (Azure AD / MSAL).
 *
 * El navegador DEBE correr en la misma máquina que la app:
 * `redirect_uri=http://localhost:4200`.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  private readonly botonSSO = this.page.locator('text=Iniciar Sesión con Microsoft');
  private readonly msEmail = this.page.locator('input[type=email]');
  private readonly msNext = this.page.locator('text=Next');
  private readonly msPassword = this.page.locator('input[type=password]');
  private readonly msSignIn = this.page.locator('text=Sign in');
  private readonly msStaySignedIn = this.page.locator('text=Yes');
  /** El dashboard se considera listo cuando el primer "IR" (Facturación) es visible. */
  private readonly dashboardReady = this.page.locator('text=IR >> nth=0');

  async loginSSO(): Promise<void> {
    await this.page.goto('/login', { waitUntil: 'load' });
    await this.botonSSO.first().click();
    await this.msEmail.first().waitFor({ state: 'visible' });
    await this.msEmail.first().fill(CREDENCIALES.sso.email);
    await this.msNext.first().click();
    await this.msPassword.first().waitFor({ state: 'visible' });
    await this.msPassword.first().fill(CREDENCIALES.sso.password);
    await this.msSignIn.first().click();
    await this.msStaySignedIn.first().click({ timeout: 8_000 }).catch(() => undefined);
    await this.page.waitForURL(/localhost:4200/, { timeout: 90_000 });
    // El modal "Inicio de día — Verificando actualizaciones pendientes" se cierra solo.
    await this.page.waitForTimeout(4_000);
    await expect(this.dashboardReady).toBeVisible({ timeout: 30_000 });
  }
}
