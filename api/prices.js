/**
 * GET /api/prices
 * Devuelve los precios vigentes y la hora del servidor, para que el contador
 * del frontend no dependa del reloj de la PC del visitante.
 */

import { PROMO_END, isPromoActive, getPrices, REGULAR_PRICES } from './_pricing.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const now = Date.now();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    serverNow: now,
    promoEnd: PROMO_END,
    promoActive: isPromoActive(now),
    prices: getPrices(now),
    regularPrices: REGULAR_PRICES,
  });
}
