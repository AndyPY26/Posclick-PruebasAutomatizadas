/* ============================================================================
 * CENTROS — datos de prueba por centro POS.
 *
 * Cada caja tiene su propio catálogo, stock, ofertas y clientes con cupo. La
 * suite detecta el centro en el encabezado del POS ("CENTRO 004-150") y toma
 * de aquí los datos correspondientes.
 *
 * Las cédulas y cupones NO van en este archivo (son datos de clientes reales):
 * se leen del .env con el prefijo del centro, p.ej. E2E_004_150_CREDITO.
 * Para agregar un centro: nuevo bloque aquí + sus variables en .env.example.
 * ==========================================================================*/

export interface OfertaCentro {
  readonly cupon: string;
  readonly cedula: string;
  /** false → el Caso 2 se salta (cupón vencido o inexistente en el centro). */
  readonly vigente: boolean;
}

export interface DatosCentro {
  /** SKUs que existen y tienen stock en el centro. */
  readonly skus: readonly string[];
  readonly oferta: OfertaCentro | null;
  /** Cédulas con cupo de Crédito PYCCA (Caso 5); vacío → el Caso 5 se salta. */
  readonly credito: readonly string[];
}

/** Prefijo de variables del centro: '004-150' → 'E2E_004_150_'. */
function prefijo(centro: string): string {
  return `E2E_${centro.replace(/-/g, '_')}_`;
}

function envCentro(centro: string, clave: string): string {
  return process.env[prefijo(centro) + clave]?.trim() ?? '';
}

function listaEnv(centro: string, clave: string): string[] {
  return envCentro(centro, clave)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function ofertaEnv(centro: string, vigente: boolean): OfertaCentro | null {
  const cupon = envCentro(centro, 'OFERTA_CUPON');
  const cedula = envCentro(centro, 'OFERTA_CEDULA');
  return cupon && cedula ? { cupon, cedula, vigente } : null;
}

export const CENTROS_DATA: Record<string, DatosCentro> = {
  '004-150': {
    skus: [
    // Pool original (familias O / D)
    'O22652', 'O22654', 'O22655', 'O22657', 'O22955', 'O22976', 'O22977', 'O22978',
    'O22979', 'O23546', 'O23553', 'O24144', 'O28268', 'O48324', 'O48357', 'O60832',
    'O60854', 'O78081', 'D01461', 'D01463', 'D01848', 'D02228', 'D02229', 'D02352',
    'D02411', 'D02427', 'D02429', 'D02431', 'D02656', 'D03247', 'D04736', 'D04827',
    // Familia M (muebles)
    'M02754', 'M03024', 'M03128', 'M03159', 'M03146', 'M03176', 'M03219', 'M03187',
    'M03194', 'M03174', 'M03201', 'M03209', 'M03267', 'M03274', 'M03250', 'M03266',
    'M03322', 'M03348', 'M03433', 'M03434', 'M03425', 'M03477', 'M03474', 'M03472',
    'M03473', 'M03478', 'M03480', 'M03476', 'M03493', 'M03492', 'M03507', 'M03526',
    'M03543', 'M03612', 'M03618', 'M03619', 'M03623', 'M03626', 'M03630', 'M03636',
    'M03633', 'M03614', 'M03628', 'M03625', 'M03640', 'M03620', 'M03653', 'M03642',
    'M03654', 'M03670', 'M03647', 'M03659', 'M03661', 'M03674', 'M03662', 'M03652',
    'M03664', 'M03665', 'M03667', 'M03686', 'M03641', 'M03643', 'M03656', 'M03672',
    'M03707', 'M03691', 'M03694', 'M03700', 'M03717', 'M03718', 'M03711', 'M03712',
    'M03713', 'M03710', 'M03763', 'M03758', 'M03779', 'M03760', 'M03762', 'M03781',
    'M03784', 'M03785', 'M03775', 'M03768', 'M03769', 'M03776', 'M03770', 'M03771',
    'M03773', 'M03774', 'M03782', 'M03803', 'M03788', 'M03808', 'M03810', 'M03811',
    'M03812', 'M03813', 'M03815', 'M03787', 'M03821', 'M03805', 'M03807', 'M03824',
    'M03809', 'M03791', 'M03793', 'M03816', 'M03820', 'M03822', 'M03826', 'M03856',
    'M03834', 'M03835', 'M03836', 'M03827', 'M03829', 'M03830', 'M03850', 'M03837',
    'M03838',
    // Familia L (línea blanca)
    'L00217', 'L00441', 'L00442', 'L00507', 'L00669', 'L00672', 'L00676', 'L00680',
    'L00682', 'L00825', 'L00949', 'L00950', 'L00953', 'L01029', 'L01036', 'L01037',
    'L01042', 'L01043', 'L01046', 'L01258', 'L01397', 'L01402', 'L01408', 'L01416',
    'L01418', 'L01421', 'L01422', 'L01429', 'L01431', 'L01450', 'L01477', 'L01487',
    'L01489', 'L01492', 'L01493',
    // Familia A (audio/elec)
    'A00032', 'A00151', 'A00339', 'A00340', 'A00342', 'A00448', 'A00449', 'A00524',
    'A00706', 'A00708', 'A00709', 'A00722', 'A00761', 'A00782', 'A00850', 'A00852',
    'A00862', 'A00982', 'A01108', 'A01147', 'A01210', 'A01332', 'A01372', 'A01373',
    'A01390', 'A01419', 'A01421', 'A01473', 'A01474', 'A01483', 'A01500', 'A01505',
    'A01507', 'A01517', 'A01531', 'A01535', 'A01552', 'A01571', 'A01573', 'A01575',
    'A01597', 'A01599', 'A01630', 'A01631', 'A01632', 'A01633', 'A01636',
    // Familia Y (surtidos)
    'Y01417', 'Y02982', 'Y03047', 'Y03228', 'Y03459', 'Y04813', 'Y05035', 'Y05036',
    'Y05053', 'Y05064', 'Y05195', 'Y05256', 'Y05316', 'Y06069', 'Y07484', 'Y07493',
    'Y08772', 'Y09126', 'Y09222', 'Y09279', 'Y09285', 'Y09472', 'Y09560', 'Y10974',
    'Y10977', 'Y11126', 'Y12553', 'Y12566', 'Y12567', 'Y12570', 'Y12577', 'Y12578',
],
    // BG961 responde 404 desde el 2026-10-16.
    get oferta() {
      return ofertaEnv('004-150', false);
    },
    get credito() {
      return listaEnv('004-150', 'CREDITO');
    },
  },
  '004-112': {
    // SKUs que cargaron en la corrida del 2026-10-19. M03781 y Y10974 se
    // perdieron al recuperar la suspendida en el Caso 1: vigilar.
    skus: [
      'M03781', 'M03762', 'O22977', 'O24144', 'L01477',
      'A01507', 'A01505', 'A01517', 'Y07484', 'Y10974',
      // Cosechados con `npm run explorar:skus` el 2026-10-26 desde el pool de 004-150.
      'O22652', 'O22654', 'O22655', 'O22657', 'O22955',
      'O22976', 'O22978', 'O22979', 'O23546', 'O23553',
      'O28268', 'O48324', 'O48357', 'O60832', 'O60854',
    ],
    get oferta() {
      return ofertaEnv('004-112', false);
    },
    get credito() {
      return listaEnv('004-112', 'CREDITO');
    },
  },
};

export const CENTROS_SOPORTADOS = Object.keys(CENTROS_DATA);
