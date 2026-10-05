/**
 * Utilidades de Mercado Pago (Checkout Pro). Los archivos con prefijo "_"
 * no se publican como endpoints en Vercel.
 *
 * Seguridad: nunca confiamos en lo que diga el navegador ni el aviso de
 * Mercado Pago. Con el ID del pago volvemos a pedirlo a la API de Mercado Pago
 * con nuestro token y solo si está "approved", en soles y por el monto
 * correcto, se genera la licencia. El plan y el email salen de
 * external_reference, que fija nuestro servidor al crear el cobro.
 */

import { PROMO_PRICES_PEN, REGULAR_PRICES_PEN } from './_pricing.js';

export const MP_API = 'https://api.mercadopago.com';
const BACKEND_URL = process.env.RENDER_BACKEND_URL || 'https://val-backend-vercel.vercel.app';
export const PLANES_MP = ['pro', 'founder'];

export function mpToken() {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error('Falta la variable de entorno MP_ACCESS_TOKEN');
  return t;
}

export function parseReferencia(ref) {
  const i = String(ref || '').indexOf('|');
  if (i === -1) return null;
  const plan = ref.slice(0, i);
  const email = ref.slice(i + 1);
  if (!PLANES_MP.includes(plan) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { plan, email };
}

/**
 * Verifica un pago contra la API de Mercado Pago y, si está aprobado,
 * genera la licencia (una sola vez por pago gracias a la referencia).
 * Devuelve { status, email? }.
 */
export async function procesarPagoMP(paymentId) {
  if (!/^\d+$/.test(String(paymentId || ''))) return { status: 'invalid' };

  const r = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpToken()}` },
  });
  if (r.status === 404) return { status: 'not_found' };
  if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status} al consultar el pago`);
  const pago = await r.json();

  if (pago.status !== 'approved') return { status: pago.status || 'unknown' };

  const ref = parseReferencia(pago.external_reference);
  if (!ref) {
    console.error('[MP] external_reference inválida en pago', pago.id, pago.external_reference);
    return { status: 'invalid_reference' };
  }

  // El monto debe ser al menos el precio más bajo del plan (promo o regular)
  const minimo = Math.min(Number(PROMO_PRICES_PEN[ref.plan]), Number(REGULAR_PRICES_PEN[ref.plan]));
  if (pago.currency_id !== 'PEN' || Number(pago.transaction_amount) + 0.001 < minimo) {
    console.error('[MP] Monto o moneda inesperados en pago', pago.id, pago.currency_id, pago.transaction_amount);
    return { status: 'invalid_amount' };
  }

  const res = await fetch(`${BACKEND_URL}/procesar-pago`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admin_key: process.env.ADMIN_KEY,
      email: ref.email,
      plan: ref.plan,
      referencia: `mp:${pago.id}`,
    }),
  });
  if (!res.ok) throw new Error(`Backend /procesar-pago: ${await res.text()}`);
  const out = await res.json();
  console.log(`[MP] Pago ${pago.id} aprobado → ${ref.plan} para ${ref.email}${out.duplicado ? ' (ya procesado antes)' : ` → ${out.clave}`}`);
  return { status: 'approved', email: ref.email };
}
