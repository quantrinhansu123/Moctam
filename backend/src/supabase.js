import { settings } from "./config.js";

async function supabaseFetch(pathname, init = {}) {
  const response = await fetch(`${settings.supabaseUrl}${pathname}`, {
    ...init,
    headers: {
      apikey: settings.supabaseKey,
      Authorization: `Bearer ${settings.supabaseKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
    );
  }

  return data;
}

export async function insertFeedback({ topic, content, user_id }) {
  const body = { topic, content };
  if (user_id) body.user_id = user_id;

  const rows = await supabaseFetch("/rest/v1/feedbacks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });

  const id = Array.isArray(rows) ? rows[0]?.id : rows?.id;
  if (!id) throw new Error("Supabase returned no row for the inserted feedback.");
  return id;
}

export async function insertOrder(row) {
  const payload = { ...row };
  // Never send user_id for guest checkout — column may be NOT NULL + FK to users.
  // Run docs/ORDERS_FIX.sql to DROP FK and allow NULL.
  for (const key of [
    "customer_name",
    "customer_phone",
    "customer_address",
    "user_id",
  ]) {
    if (payload[key] == null) delete payload[key];
  }
  delete payload.user_id;

  try {
    await supabaseFetch("/rest/v1/orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = String(error.message || error);
    const missingContact =
      /customer_name|customer_phone|customer_address|pgrst204|could not find/i.test(
        message,
      );
    if (!missingContact) throw error;

    console.warn(
      "[ORDERS] contact columns missing — retrying without name/phone/address:",
      message,
    );
    const fallback = { ...payload };
    delete fallback.customer_name;
    delete fallback.customer_phone;
    delete fallback.customer_address;
    await supabaseFetch("/rest/v1/orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(fallback),
    });
  }
}

export async function updateOrderContact(paypalOrderId, contact) {
  const body = { updated_at: new Date().toISOString() };
  if (contact.customer_name) body.customer_name = contact.customer_name;
  if (contact.customer_phone) body.customer_phone = contact.customer_phone;
  if (contact.customer_address) body.customer_address = contact.customer_address;

  await supabaseFetch(
    `/rest/v1/orders?paypal_order_id=eq.${encodeURIComponent(paypalOrderId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body),
    },
  );
}

export async function markOrderStatus(paypalOrderId, status) {
  const rows = await supabaseFetch(
    `/rest/v1/orders?paypal_order_id=eq.${encodeURIComponent(paypalOrderId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return Array.isArray(rows) ? rows.length : 0;
}

export async function claimEmailSend(paypalOrderId) {
  const columns =
    "paypal_order_id,customer_email,total_amount,currency,status,email_sent";
  const rows = await supabaseFetch(
    `/rest/v1/orders?paypal_order_id=eq.${encodeURIComponent(paypalOrderId)}&email_sent=eq.false&select=${columns}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        email_sent: true,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function listOrders(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const columns =
    "paypal_order_id,customer_email,customer_name,customer_phone,customer_address,total_amount,currency,status,email_sent,created_at";
  return supabaseFetch(
    `/rest/v1/orders?select=${columns}&order=created_at.desc&limit=${safeLimit}`,
  );
}
