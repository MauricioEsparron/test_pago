# VAL_Config Pro — Storefront (Vercel)

Página de venta y procesamiento de pagos de VAL_Config Pro. Desplegada en [Vercel](https://vercel.com) en el dominio `valconfig.store`.

---

## Stack

| Tecnología | Uso |
|---|---|
| HTML/CSS/JS | Frontend estático |
| Vercel Serverless Functions | API de pago (Node.js, ESM) |
| PayPal Orders API v2 | Procesamiento de pagos |
| Render Backend | Generación de claves y envío de correos |

---

## Estructura

```
test_pago/
├── index.html          # Página principal de venta
├── favicon.ico
├── package.json        # { "type": "module" }
├── vercel.json         # Configuración de rutas en Vercel
└── api/
    ├── create-order.js # POST /api/create-order
    └── capture-order.js# POST /api/capture-order
```

---

## Variables de entorno (Vercel)

| Variable | Descripción |
|---|---|
| `PAYPAL_CLIENT_ID` | Client ID de PayPal Live |
| `PAYPAL_CLIENT_SECRET` | Secret de PayPal Live |
| `PAYPAL_MODE` | `"live"` en producción |
| `RENDER_BACKEND_URL` | URL del backend en Render |
| `ADMIN_KEY` | Clave de administración compartida con Render |

---

## API Serverless

### `POST /api/create-order`
Crea una orden en PayPal y devuelve el `orderID` al frontend.

```json
// Request
{ "plan": "pro", "email": "cliente@email.com" }

// Response
{ "id": "PAYPAL_ORDER_ID" }
```

Planes disponibles:

| Plan | Precio | Tipo de licencia |
|---|---|---|
| `pro` | $4.99 USD | Pro (Permanente) |
| `founder` | $9.99 USD | Founder/Supporter (Permanente) |

---

### `POST /api/capture-order`
Captura el pago aprobado en PayPal y delega a Render para generar la clave y enviar el correo.

```json
// Request
{ "orderID": "PAYPAL_ORDER_ID", "email": "cliente@email.com", "plan": "pro" }

// Response
{ "success": true }
```

Flujo interno:
1. Obtiene token de acceso de PayPal
2. Captura la orden (`COMPLETED`)
3. Llama a `RENDER_BACKEND_URL/procesar-pago`
4. Render genera la clave, la guarda en BD y envía el correo

---

## Flujo de pago en el frontend

```
1. Usuario selecciona plan (Pro / Founder)
2. Ingresa su email y es validado
3. Hace clic en el botón de PayPal
4. PayPal abre su popup de pago
5. /api/create-order  → obtiene orderID
6. Usuario autoriza el pago en PayPal
7. /api/capture-order → captura y delega a Render
8. Se muestra mensaje de éxito al usuario
9. Usuario recibe correo con clave + botón de descarga
```

---

## Deploy

La página se redeploya automáticamente en Vercel al hacer push a `main`.

```bash
git add .
git commit -m "feat: descripción del cambio"
git push
```

El dominio `valconfig.store` está conectado a Vercel via DNS en Namecheap:
- `A @ → 216.198.79.1`
- `CNAME www → 0312bb1424fcf46c.vercel-dns-017.com.`
