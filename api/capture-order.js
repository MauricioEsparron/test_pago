/**
 * POST /api/capture-order
 * Captura el pago aprobado por el usuario.
 * Solo si el capture es COMPLETED → genera clave → guarda en BD vía Render → envía email.
 * Si el pago NO fue aprobado → no se envía nada.
 */

import { randomBytes } from 'crypto';

const PAYPAL_BASE =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const PLAN_LABELS = {
  pro:     'Pro',
  founder: 'Founder',
};

// Mapeo plan → tipo en la BD
const PLAN_TIPOS = {
  pro:     'pro',
  founder: 'support',
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

/** Genera una clave de activación con formato VAL-XXXXXXXX (hex, igual que Render) */
function generateActivationKey() {
  return 'VAL-' + randomBytes(4).toString('hex').toUpperCase();
}

/** Guarda la clave en la BD llamando al backend de Render */
async function saveKeyViaRender(clave, plan) {
  const tipo = PLAN_TIPOS[plan] || 'pro';
  const renderUrl = process.env.RENDER_BACKEND_URL || 'https://val-backend-or4y.onrender.com';

  const res = await fetch(`${renderUrl}/crear-licencia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admin_key: process.env.ADMIN_KEY,
      clave: clave,
      tipo: tipo,
      minutos: 0,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Render API error: ${err}`);
  }

  const data = await res.json();
  console.log(`💾 Clave guardada en BD vía Render: ${clave} | tipo: ${tipo}`);
  return data;
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
      from: process.env.FROM_EMAIL,
      to: [to],
      subject: `🎮 Tu clave de activación VAL_Config Pro — Licencia ${planLabel}`,
      html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <style>
    body { background:#0d1117; color:#c9d1d9; font-family:Arial,sans-serif; margin:0; padding:0; }
    .container { max-width:520px; margin:40px auto; background:#161b22; border:1px solid #21262d; border-radius:16px; overflow:hidden; }
    .header { background:linear-gradient(135deg,#1a0a0a,#2d0f0f); padding:32px; text-align:center; border-bottom:1px solid rgba(255,70,85,.2); }
    .header h1 { font-size:28px; color:#ff4655; margin:0 0 6px; letter-spacing:2px; }
    .header p { font-size:13px; color:#8b949e; margin:0; }
    .body { padding:32px; }
    .body > p { color:#c9d1d9; margin-bottom:20px; }
    .key-box {
      background:rgba(255,70,85,.08);
      border:1px solid rgba(255,70,85,.5);
      border-radius:12px;
      padding:24px;
      text-align:center;
      margin:24px 0;
    }
    .key-label { font-size:11px; color:#6b7280; letter-spacing:3px; text-transform:uppercase; margin-bottom:12px; }
    .key-value { font-size:28px; font-weight:700; color:#ff4655; letter-spacing:4px; font-family:monospace; }
    .plan-badge {
      display:inline-block;
      background:rgba(255,70,85,.15);
      color:#ff4655;
      border:1px solid rgba(255,70,85,.4);
      font-size:11px;
      font-weight:600;
      padding:4px 14px;
      border-radius:20px;
      text-transform:uppercase;
      letter-spacing:1px;
      margin-bottom:20px;
    }
    .info-row { display:flex; gap:8px; margin-bottom:8px; font-size:13px; }
    .info-label { color:#8b949e; }
    .info-value { color:#c9d1d9; font-weight:600; }
    .steps { background:rgba(255,255,255,.03); border:1px solid #21262d; border-radius:10px; padding:18px; margin:20px 0; }
    .steps h3 { font-size:13px; color:#ff4655; margin:0 0 12px; }
    .steps ol { margin:0; padding-left:20px; }
    .steps li { font-size:13px; color:#8b949e; margin-bottom:8px; line-height:1.5; }
    .steps li strong { color:#c9d1d9; }
    .warning { font-size:12px; color:#8b949e; margin-top:20px; border-top:1px solid #21262d; padding-top:16px; }
    .warning a { color:#ff4655; text-decoration:none; }
    .footer { border-top:1px solid #21262d; padding:20px 32px; text-align:center; font-size:11px; color:#4b5563; }
    .footer a { color:#ff4655; text-decoration:none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>VAL Configurator</h1>
      <p>Tu herramienta de configuración para Valorant</p>
    </div>
    <div class="body">
      <p>¡Gracias por tu compra! Aquí está tu clave de activación:</p>
      <div style="text-align:center;">
        <span class="plan-badge">Licencia ${planLabel}</span>
      </div>
      <div class="key-box">
        <div class="key-label">Clave de Activación</div>
        <div class="key-value">${activationKey}</div>
      </div>
      <div class="info-row"><span class="info-label">Tipo:</span><span class="info-value">Licencia Permanente</span></div>
      <div class="info-row"><span class="info-label">Duración:</span><span class="info-value">Permanente</span></div>
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
        Esta clave está vinculada a <strong>un solo equipo</strong>. Si cambias de PC contáctanos a
        <a href="mailto:mauriciodev.support@gmail.com">mauriciodev.support@gmail.com</a>
      </div>
    </div>
    <div class="footer">
      VAL_Config Pro · Desarrollado por Mauricio Ramirez<br/>
      Este correo se envió a <a href="mailto:${to}">${to}</a> tras confirmar tu compra.
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
      return res.status(200).json({
        success: false,
        message: `Pago en estado: ${captureStatus}. No se enviará la clave.`,
      });
    }

    // 3. Pago OK → generar clave (formato VAL-XXXXXXXX igual que Render)
    const activationKey = generateActivationKey();
    console.log(`✅ Pago COMPLETADO para ${email} | Plan: ${plan} | Clave: ${activationKey}`);

    // 4. Guardar clave en BD vía Render (no bloqueante — si falla, igual se envía el email)
    try {
      await saveKeyViaRender(activationKey, plan);
    } catch (renderErr) {
      console.error('⚠️ Error al guardar en BD vía Render (el email se enviará igual):', renderErr.message);
    }

    // 5. Enviar email con la clave
    await sendActivationEmail(email, activationKey, plan);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('capture-order error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
