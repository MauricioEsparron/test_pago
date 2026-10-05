/**
 * POST /api/mp-webhook
 * Aviso automático de Mercado Pago cuando cambia un pago. Acepta el formato
 * de Webhooks (?type=payment&data.id=…, o body { type, data: { id } }) y el
 * de IPN (?topic=payment&id=…). La verificación real la hace procesarPagoMP
 * consultando el pago a la API, así que un aviso falso no genera licencias.
 */

import { procesarPagoMP } from './_mp.js';

export default async function handler(req, res) {
  const q = req.query || {};
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const tipo = q.type || q.topic || b.type || b.topic;
  const id = q['data.id'] || b?.data?.id || (q.topic === 'payment' ? q.id : null);

  // Otros avisos (merchant_order, etc.) no nos interesan: responder 200 para que no se reintenten
  if (tipo !== 'payment' || !id) return res.status(200).json({ ignorado: true });

  try {
    const out = await procesarPagoMP(id);
    return res.status(200).json({ status: out.status });
  } catch (err) {
    // 500 → Mercado Pago reintentará más tarde
    console.error('[MP] webhook error:', err);
    return res.status(500).json({ error: 'Error procesando el pago' });
  }
}
