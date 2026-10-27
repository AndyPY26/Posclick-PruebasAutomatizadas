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
  /** Loader "Por favor, espere..." que tapa la pantalla de login mientras el POS arranca. */
  private readonly loader = this.page.locator('#loader-custom-description');
  /** Único botón que ofrece el POS cuando no tiene conexión con la nube. */
  private readonly botonLocal = this.page.getByRole('button', { name: /Iniciar Sesi[oó]n Local/i });
  /** Error de Microsoft cuando el campo llegó vacío al presionar "Sign in". */
  private readonly msPasswordVacio = this.page.getByText(/Please enter your password|Ingrese su contrase[ñn]a/i);
  private readonly msStaySignedIn =this.page.getByRole('button', { name: /^Yes$|^S[ií]$/i });
  /** El dashboard se considera listo cuando el primer "IR" (Facturación) es visible. */
  private readonly dashboardReady = this.page.locator('button:has-text("IR")').first();

  async loginSSO(): Promise<void> {
    await this.page.goto('/login', { waitUntil: 'networkidle' });
    await this.clickBotonSSO();
    await this.msEmail.first().waitFor({ state: 'visible' });
    await this.msEmail.first().fill(CREDENCIALES.sso.email);
    await this.msNext.first().click();
    await this.ingresarPassword();
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
   * Hace click en "Iniciar Sesión con Microsoft", esperando a que se vaya el
   * loader. Visto el 2026-10-26: con el loader aún visible, el POS reemplazó el
   * botón por "Iniciar Sesión Local" (sin conexión a la nube). En ese caso
   * recarga /login hasta 3 veces antes de fallar con el motivo.
   */
  private async clickBotonSSO(): Promise<void> {
    for (let intento = 1; intento <= 3; intento++) {
      await this.loader.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined);
      await this.botonSSO.or(this.botonLocal).first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined);
      const ok = await this.botonSSO
        .first()
        .click({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (ok) return;
      const local = await this.botonLocal.isVisible().catch(() => false);
      console.log(
        `[LoginPage] intento ${intento}: ` +
          (local ? 'el POS solo ofrece "Iniciar Sesión Local"' : 'el botón de Microsoft no respondió') +
          ' → recargar /login',
      );
      await this.page.waitForTimeout(5_000);
      await this.page.goto('/login', { waitUntil: 'networkidle' });
    }
    const local = await this.botonLocal.isVisible().catch(() => false);
    throw new Error(
      local
        ? 'El POS solo ofrece "Iniciar Sesión Local": perdió la conexión con la nube (Azure). ' +
            'Revisa la red y los túneles del servidor y vuelve a correr la suite.'
        : 'El botón "Iniciar Sesión con Microsoft" no respondió tras 3 intentos.',
    );
  }

  /**
   * Escribe la contraseña y presiona "Sign in", reintentando si Microsoft la
   * pierde. Visto el 2026-10-26: el campo se vació mientras la pantalla
   * "Enter password" terminaba de cargar y Microsoft respondió "Please enter
   * your password". Nunca se loguea el valor de la contraseña.
   */
  private async ingresarPassword(): Promise<void> {
    const password = this.msPassword.first();
    for (let intento = 1; intento <= 3; intento++) {
      await password.waitFor({ state: 'visible' });
      await this.page.waitForTimeout(1_000); // animación de la pantalla de Microsoft
      await password.fill(CREDENCIALES.sso.password);
      if ((await password.inputValue().catch(() => '')) !== CREDENCIALES.sso.password) {
        console.log(`[LoginPage] intento ${intento}: el campo de contraseña se vació → reescribir`);
        continue;
      }
      await this.msSignIn.first().click();
      const rechazada = await this.msPasswordVacio
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!rechazada) return;
      console.log(`[LoginPage] intento ${intento}: Microsoft pidió de nuevo la contraseña → reintentar`);
    }
    throw new Error(
      'Microsoft no aceptó la contraseña tras 3 intentos ("Please enter your password"). ' +
        'Revisa E2E_SSO_PASSWORD en el .env.',
    );
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
