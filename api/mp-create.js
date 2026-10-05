/**
 * POST /api/mp-create
 * Crea un cobro de Mercado Pago (preferencia de Checkout Pro) y devuelve la
 * URL de pago. El precio en soles lo decide el servidor (_pricing.js) y el
 * plan+email quedan en external_reference ("plan|email"), igual que el
 * custom_id de PayPal.
 */

import { getPricesPEN } from './_pricing.js';
import { MP_API, PLANES_MP, mpToken } from './_mp.js';

const TITULOS = {
  pro: 'VAL_Config Pro — Licencia Pro (Permanente)',
  founder: 'VAL_Config Pro — Licencia Founder (Permanente)',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { plan, email } = req.body || {};
  if (!PLANES_MP.includes(plan)) return res.status(400).json({ error: 'Plan inválido' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });

  // La misma URL desde la que se compra (producción o vista previa de Vercel)
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `https://${host}`;

  try {
    const r = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          id: plan,
          title: TITULOS[plan],
          quantity: 1,
          currency_id: 'PEN',
          unit_price: Number(getPricesPEN()[plan]),
        }],
        // Sin payer.email: si se prellena con el email real y las credenciales son de
        // prueba, Mercado Pago rechaza el pago. La clave va al email de la tienda,
        // que viaja en external_reference.
        external_reference: `${plan}|${email}`,
        back_urls: {
          success: `${origin}/?mp=ok`,
          pending: `${origin}/?mp=pendiente`,
          failure: `${origin}/?mp=error`,
        },
        auto_return: 'approved',
        notification_url: `${origin}/api/mp-webhook`,
        statement_descriptor: 'VALCONFIG',
        payment_methods: { installments: 1 },
      }),
    });
    const pref = await r.json();
    if (!r.ok || !pref.init_point) {
      console.error('[MP] Error al crear preferencia:', r.status, pref);
      return res.status(500).json({ error: 'No se pudo iniciar el pago con Mercado Pago' });
    }
    // Las credenciales antiguas de prueba (TEST-...) usan la URL de sandbox
    const url = mpToken().startsWith('TEST-') ? (pref.sandbox_init_point || pref.init_point) : pref.init_point;
    return res.status(200).json({ url });
  } catch (err) {
    console.error('[MP] mp-create error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
