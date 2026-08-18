/**
 * POST /api/create-order
 * Crea una orden PayPal y devuelve el orderID al frontend.
 * El plan y el email del comprador se guardan juntos en custom_id
 * ("plan|email"), codificados por el servidor en el momento en que se fija
 * el precio real — así, al capturar (ver capture-order.js), se puede leer
 * el plan REALMENTE pagado directo de PayPal en vez de confiar en lo que
 * mande el cliente en ese segundo request (evita pagar Pro y reclamar
 * Founder editando la llamada desde la consola del navegador).
 */

const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const PRICES = {
  pro:     { value: '1.99', description: 'VAL_Config Pro — Licencia Pro (Permanente)' },
  founder: { value: '4.99', description: 'VAL_Config Pro — Licencia Founder (Permanente)' },
};

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { plan, email } = req.body;

  if (!plan || !PRICES[plan]) {
    return res.status(400).json({ error: 'Plan inválido' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  try {
    const accessToken = await getAccessToken();
    const planData = PRICES[plan];

    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: `${plan}|${email}`,
            description: planData.description,
            amount: {
              currency_code: 'USD',
              value: planData.value,
            },
          },
        ],
        application_context: {
          brand_name: 'VAL_Config Pro',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
        },
      }),
    });

    const order = await orderRes.json();

    if (!order.id) {
      console.error('PayPal order error:', order);
      return res.status(500).json({ error: 'Error al crear orden en PayPal' });
    }

    return res.status(200).json({ id: order.id });
  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
