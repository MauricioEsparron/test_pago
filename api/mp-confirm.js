/**
 * POST /api/mp-confirm  { payment_id }
 * La tienda la llama al volver de Mercado Pago, para entregar la licencia
 * al momento aunque el webhook tarde o no llegue. Es seguro llamarla varias
 * veces: cada pago genera una sola licencia.
 */

import { procesarPagoMP } from './_mp.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const out = await procesarPagoMP((req.body || {}).payment_id);
    return res.status(200).json(out);
  } catch (err) {
    console.error('[MP] mp-confirm error:', err);
    return res.status(500).json({ error: 'No se pudo confirmar el pago' });
  }
}
