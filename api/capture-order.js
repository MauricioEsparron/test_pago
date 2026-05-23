/**
 * POST /api/capture-order
 * Captura el pago aprobado por el usuario.
 * Solo si el capture es COMPLETED → genera clave → envía email.
 * Si el pago NO fue aprobado → no se envía nada.
 */

const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const PLAN_LABELS = {
  pro:     'Pro',
  founder: 'Founder',
};

/* ── Helpers ── */

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

/** Genera una clave de activación con formato VAL-XXXXXX-XXXXXX */
function generateActivationKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (len) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `VAL-${segment(6)}-${segment(6)}`;
}

/** Envía el email con la clave vía Resend */
async function sendActivationEmail(to, activationKey, plan) {
  const planLabel = PLAN_LABELS[plan] || plan;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,        // ej: "VAL_Config Pro <noreply@tudominio.com>"
      to: [to],
      subject: `🎮 Tu clave de activación VAL_Config Pro — Licencia ${planLabel}`,
      html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <style>
    body { background:#0a0a0f; color:#e8e6f0; font-family:Arial,sans-serif; margin:0; padding:0; }
    .container { max-width:520px; margin:40px auto; background:#111118; border:1px solid rgba(120,80,255,.3); border-radius:16px; overflow:hidden; }
    .header { background:linear-gradient(135deg,#12101f,#1a0e3d); padding:32px; text-align:center; }
    .header h1 { font-size:28px; color:#fff; margin:0 0 6px; }
    .header p { font-size:13px; color:#9ca3af; margin:0; }
    .body { padding:32px; }
    .key-box {
      background:rgba(120,80,255,.12);
      border:1px solid rgba(120,80,255,.4);
      border-radius:12px;
      padding:20px;
      text-align:center;
      margin:24px 0;
    }
    .key-label { font-size:11px; color:#6b7280; letter-spacing:2px; text-transform:uppercase; margin-bottom:10px; }
    .key-value { font-size:26px; font-weight:700; color:#a78bfa; letter-spacing:3px; font-family:monospace; }
    .plan-badge {
      display:inline-block;
      background:#7c3aed;
      color:#fff;
      font-size:11px;
      font-weight:600;
      padding:3px 12px;
      border-radius:20px;
      text-transform:uppercase;
      letter-spacing:1px;
      margin-bottom:16px;
    }
    .steps { background:rgba(255,255,255,.03); border-radius:10px; padding:18px; margin:20px 0; }
    .steps h3 { font-size:13px; color:#e0d9ff; margin:0 0 12px; }
    .steps ol { margin:0; padding-left:20px; }
    .steps li { font-size:13px; color:#9ca3af; margin-bottom:8px; line-height:1.5; }
    .steps li strong { color:#e0d9ff; }
    .warning { background:rgba(251,191,36,.1); border:1px solid rgba(251,191,36,.3); border-radius:8px; padding:14px; font-size:12px; color:#fbbf24; margin-top:20px; }
    .footer { border-top:1px solid rgba(255,255,255,.06); padding:20px 32px; text-align:center; font-size:11px; color:#4b5563; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>VAL_Config<span style="color:#8b5cf6">Pro</span></h1>
      <p>Tu herramienta de configuración competitiva</p>
    </div>
    <div class="body">
      <p>¡Gracias por tu compra! Tu pago fue procesado correctamente.</p>
      <div style="text-align:center;">
        <span class="plan-badge">Licencia ${planLabel}</span>
      </div>
      <div class="key-box">
        <div class="key-label">Clave de Activación</div>
        <div class="key-value">${activationKey}</div>
      </div>
      <div class="steps">
        <h3>¿Cómo activar?</h3>
        <ol>
          <li>Descarga e instala <strong>VAL_Config Pro</strong> en tu PC.</li>
          <li>Al abrir la app, se te pedirá tu <strong>clave de activación</strong>.</li>
          <li>Copia y pega la clave de arriba.</li>
          <li>La clave queda vinculada a <strong>tu equipo</strong> — guárdala.</li>
        </ol>
      </div>
      <div class="warning">
        ⚠️ <strong>Importante:</strong> Esta clave es válida para un solo equipo. No la compartas.
        Si cambias de PC, contacta soporte en Discord: <strong>maxpredator</strong>
      </div>
    </div>
    <div class="footer">
      VAL_Config Pro · Desarrollado por Mauricio Ramirez<br/>
      Este correo se envió a ${to} tras confirmar tu compra.
    </div>
  </div>
</body>
</html>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }

  return await res.json();
}

/* ── Handler principal ── */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderID, email, plan } = req.body;

  if (!orderID || !email || !plan) {
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
      console.warn('Capture NO completado:', captureStatus, capture);
      // Pago no completado → NO enviamos clave
      return res.status(200).json({
        success: false,
        message: `Pago en estado: ${captureStatus}. No se enviará la clave.`,
      });
    }

    // 3. Pago OK → generar clave y enviar email
    const activationKey = generateActivationKey();

    console.log(`✅ Pago COMPLETADO para ${email} | Plan: ${plan} | Clave: ${activationKey}`);

    await sendActivationEmail(email, activationKey, plan);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('capture-order error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
