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

  private readonly botonSSO = this.page.getByRole('button', { name: /Iniciar Sesi[oó]n con Microsoft/i });
  private readonly msEmail = this.page.locator('input[type=email]');
  private readonly msNext = this.page.getByRole('button', { name: /^Next$|^Siguiente$/i });
  private readonly msPassword = this.page.locator('input[type=password]');
  private readonly msSignIn = this.page.getByRole('button', { name: /^Sign in$|^Iniciar sesi[oó]n$/i });
  private readonly msStaySignedIn = this.page.getByRole('button', { name: /^Yes$|^S[ií]$/i });
  /** El dashboard se considera listo cuando el primer "IR" (Facturación) es visible. */
  private readonly dashboardReady = this.page.locator('button:has-text("IR")').first();

  async loginSSO(): Promise<void> {
    await this.page.goto('/login', { waitUntil: 'networkidle' });
    await this.botonSSO.first().waitFor({ state: 'visible', timeout: 60_000 });
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
    const listo = await this.dashboardReady
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!listo) throw new Error(await this.diagnosticoDashboard());
    await expect(this.dashboardReady).toBeVisible();
  }

  /**
   * Explica por qué el dashboard no cargó leyendo el encabezado del POS
   * (estado de conexión, centro y versión de FE). Visto el 2026-10-19 tras un
   * redespliegue: "Fuera de línea", centro "—" y dashboard sin módulos.
   */
  private async diagnosticoDashboard(): Promise<string> {
    const cabecera = await this.page.locator('body').innerText().catch(() => '');
    const fueraDeLinea = /Fuera de l[ií]nea/i.test(cabecera);
    const centro = /CENTRO\s+(\d{3}-\d{3})/.exec(cabecera)?.[1];
    const fe = /FE\s+(\S+)/.exec(cabecera)?.[1] ?? '?';
    const estado = [
      fueraDeLinea ? 'Fuera de línea' : null,
      centro ? `CENTRO ${centro}` : 'sin centro asignado',
      `FE ${fe}`,
    ]
      .filter(Boolean)
      .join(', ');
    const causa =
      fueraDeLinea || !centro
        ? 'Revisa el despliegue del servidor (conexión con central y caja asignada a esta IP).'
        : 'El dashboard no mostró los módulos a tiempo; revisa si hay un modal bloqueando.';
    return `El dashboard del POS no cargó tras el login (${estado}). ${causa}`;
  }
}
