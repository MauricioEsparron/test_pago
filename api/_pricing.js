/**
 * Fuente única de precios (servidor). Los archivos con prefijo "_" dentro de
 * /api no se publican como endpoints en Vercel, solo se importan.
 *
 * La promo termina el 15 oct 2026 a las 23:59:59 UTC; desde el 16 oct 00:00 UTC
 * create-order.js cobra automáticamente el precio regular.
 */

export const PROMO_END = Date.UTC(2026, 9, 16, 0, 0, 0); // mes 9 = octubre

const PROMO_PRICES   = { pro: '1.99',  founder: '4.99'  };
const REGULAR_PRICES = { pro: '20.00', founder: '21.99' };

// Mercado Pago (cuenta de Perú) cobra en soles: precios redondos equivalentes
const PROMO_PRICES_PEN   = { pro: '7.50',  founder: '18.90' };
const REGULAR_PRICES_PEN = { pro: '75.00', founder: '82.50' };

export function isPromoActive(now = Date.now()) {
  return now < PROMO_END;
}

export function getPrices(now = Date.now()) {
  return isPromoActive(now) ? PROMO_PRICES : REGULAR_PRICES;
}

export function getPricesPEN(now = Date.now()) {
  return isPromoActive(now) ? PROMO_PRICES_PEN : REGULAR_PRICES_PEN;
}

export { REGULAR_PRICES, PROMO_PRICES_PEN, REGULAR_PRICES_PEN };
