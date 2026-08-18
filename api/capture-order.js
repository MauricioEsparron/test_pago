/**
 * POST /api/capture-order
 * 1. Captura el pago en PayPal
 * 2. Si COMPLETED → llama a Render /procesar-pago (genera clave + guarda BD + envía email)
 * 3. Render es la única fuente de verdad para claves
 */

const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const RENDER_URL = process.env.RENDER_BACKEND_URL || 'https://val-backend-vercel.vercel.app';

// Debe coincidir con las claves de PRICES en create-order.js.
const PLANES_VALIDOS = ['pro', 'founder'];

/* ── Helpers ── */

/**
 * Extrae {plan, email} desde el custom_id que devuelve PayPal al capturar
 * -- ese valor lo fijamos NOSOTROS en create-order.js ("plan|email") al
 * crear la orden, así que el comprador no puede alterarlo. A diferencia
 * del plan/email que venga en el body de este mismo request (que sí
 * podría editarse desde la consola del navegador), esto es lo que
 * realmente se cobró.
 */
function extraerPlanYEmailVerificados(capture) {
  const customId =
    capture?.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id ||
    capture?.purchase_units?.[0]?.custom_id ||
    '';

  const idxSeparador = customId.indexOf('|');
  if (idxSeparador === -1) return null;

  const plan = customId.slice(0, idxSeparador);
  const email = customId.slice(idxSeparador + 1);

  if (!PLANES_VALIDOS.includes(plan) || !email) return null;

  return { plan, email };
}

async function getAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('No se pudo obtener token de PayPal');
  return data.access_token;
}

/** Llama a Render para generar clave, guardarla en BD y enviar el email */
async function procesarPagoEnRender(email, plan) {
  const res = await fetch(`${RENDER_URL}/procesar-pago`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admin_key: process.env.ADMIN_KEY,
      email,
      plan,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Render /procesar-pago error: ${err}`);
  }

  return await res.json(); // { status: "ok", clave: "VAL-XXXXXXXX" }
}

/* ── Handler principal ── */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderID } = req.body;

  if (!orderID) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }

  try {
    const accessToken = await getAccessToken();

    // 1. Capturar el pago en PayPal
    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const capture = await captureRes.json();

    // 2. Verificar que el pago fue COMPLETADO
    const captureStatus = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.status;

    if (captureStatus !== 'COMPLETED') {
      console.warn('Capture NO completado:', captureStatus);
      return res.status(200).json({
        success: false,
        message: `Pago en estado: ${captureStatus}. No se enviará la clave.`,
      });
    }

    // 3. Determinar plan/email REALES a partir de lo que PayPal confirma,
    // no de lo que mande el cliente en este request (ver helper arriba).
    const verificado = extraerPlanYEmailVerificados(capture);
    if (!verificado) {
      console.error('No se pudo verificar plan/email desde PayPal. custom_id recibido:',
        capture?.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id
        ?? capture?.purchase_units?.[0]?.custom_id);
      return res.status(500).json({ error: 'No se pudo verificar la orden.' });
    }
    const { plan, email } = verificado;

    console.log(`✅ Pago COMPLETADO para ${email} | Plan verificado: ${plan} — llamando a Render...`);

    // 4. Delegar a Render: genera clave + guarda en BD + envía email
    const result = await procesarPagoEnRender(email, plan);

    console.log(`🔑 Render generó clave: ${result.clave} → ${email}`);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('capture-order error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
