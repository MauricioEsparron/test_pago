/**
 * Fuente única de precios (servidor). Los archivos con prefijo "_" dentro de
 * /api no se publican como endpoints en Vercel, solo se importan.
 *
 * La promo termina el 30 sep 2026 a las 23:59:59 UTC; desde el 1 oct 00:00 UTC
 * create-order.js cobra automáticamente el precio regular.
 */

export const PROMO_END = Date.UTC(2026, 9, 1, 0, 0, 0); // mes 9 = octubre

const PROMO_PRICES   = { pro: '1.99',  founder: '4.99'  };
const REGULAR_PRICES = { pro: '20.00', founder: '21.99' };

export function isPromoActive(now = Date.now()) {
  return now < PROMO_END;
}

export function getPrices(now = Date.now()) {
  return isPromoActive(now) ? PROMO_PRICES : REGULAR_PRICES;
}

export { REGULAR_PRICES };
