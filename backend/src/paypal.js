import { settings } from "./config.js";

let tokenCache = null;

function paypalBaseUrl() {
  const mode = settings.paypalMode;
  if (mode === "live" || mode === "production") return "https://api-m.paypal.com";
  if (mode === "sandbox" || mode === "test") return "https://api-m.sandbox.paypal.com";
  throw new Error(`PAYPAL_MODE must be "live" or "sandbox", got: "${mode}"`);
}

export async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const auth = Buffer.from(
    `${settings.paypalClientId}:${settings.paypalSecret}`,
  ).toString("base64");

  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PayPal Auth Error: ${text}`);
  }

  const data = JSON.parse(text);
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 0) * 1000,
  };
  return tokenCache.token;
}

export async function createPaypalOrder(amount, currency) {
  const token = await getAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: Number(amount).toFixed(2),
          },
        },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PayPal Create Order Error: ${text}`);
  }
  return JSON.parse(text);
}

export async function capturePaypalOrder(paypalOrderId) {
  const token = await getAccessToken();
  const response = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PayPal Capture Error: ${text}`);
  }
  return JSON.parse(text);
}

export async function verifyWebhookSignature(headers, rawBody) {
  if (isWebhookMockMode()) {
    console.log("[WEBHOOK] PAYPAL_WEBHOOK_ID unset — accepting webhook (mock)");
    return true;
  }

  const token = await getAccessToken();
  const response = await fetch(
    `${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: settings.paypalWebhookId,
        webhook_event: typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody,
      }),
    },
  );

  const data = await response.json().catch(() => ({}));
  return data.verification_status === "SUCCESS";
}

function isWebhookMockMode() {
  const value = settings.paypalWebhookId.trim().toLowerCase();
  return (
    !value ||
    value.startsWith("your_") ||
    value.includes("placeholder") ||
    value === "changeme"
  );
}

console.log(`PayPal mode: ${settings.paypalMode} -> ${paypalBaseUrl()}`);
