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

export async function listFeedbacks(limit = 200) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  return supabaseFetch(
    `/rest/v1/feedbacks?select=id,topic,content,created_at&order=created_at.desc&limit=${safeLimit}`,
  );
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
  if (payload.items == null) delete payload.items;

  const post = (body) =>
    supabaseFetch("/rest/v1/orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });

  const isItemsColumnError = (message) =>
    /\bitems\b/i.test(message) &&
    /pgrst204|could not find|schema cache|does not exist|unknown/i.test(message);

  const isContactColumnError = (message) =>
    /customer_name|customer_phone|customer_address/i.test(message) &&
    /pgrst204|could not find|schema cache|does not exist|unknown/i.test(message);

  try {
    await post(payload);
    return;
  } catch (firstError) {
    const message = String(firstError.message || firstError);
    let next = { ...payload };

    // Only drop items when the error is specifically about the items column.
    if (payload.items != null && isItemsColumnError(message)) {
      console.warn(
        "[ORDERS] items column missing — retrying without items. Run docs/ORDERS_ITEMS.sql",
        message,
      );
      delete next.items;
      try {
        await post(next);
        return;
      } catch (secondError) {
        const secondMessage = String(secondError.message || secondError);
        if (!isContactColumnError(secondMessage)) {
          throw secondError;
        }
        console.warn(
          "[ORDERS] contact columns missing — retrying without name/phone/address:",
          secondMessage,
        );
        delete next.customer_name;
        delete next.customer_phone;
        delete next.customer_address;
        await post(next);
        return;
      }
    }

    if (!isContactColumnError(message)) {
      throw firstError;
    }

    console.warn(
      "[ORDERS] contact columns missing — retrying without name/phone/address:",
      message,
    );
    delete next.customer_name;
    delete next.customer_phone;
    delete next.customer_address;
    await post(next);
  }
}

export async function updateOrderItems(paypalOrderId, items) {
  if (!paypalOrderId || !Array.isArray(items) || !items.length) return 0;
  try {
    const rows = await supabaseFetch(
      `/rest/v1/orders?paypal_order_id=eq.${encodeURIComponent(paypalOrderId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          items,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    return Array.isArray(rows) ? rows.length : 0;
  } catch (error) {
    console.warn(
      "[ORDERS] could not patch items (run docs/ORDERS_ITEMS.sql):",
      error.message || error,
    );
    return 0;
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
  const base =
    "paypal_order_id,customer_email,customer_name,customer_phone,customer_address,total_amount,currency,status,email_sent,created_at";
  try {
    return await supabaseFetch(
      `/rest/v1/orders?select=${base},items&order=created_at.desc&limit=${safeLimit}`,
    );
  } catch (error) {
    console.warn(
      "[ORDERS] list without items (run docs/ORDERS_ITEMS.sql):",
      error.message || error,
    );
    return supabaseFetch(
      `/rest/v1/orders?select=${base}&order=created_at.desc&limit=${safeLimit}`,
    );
  }
}

/** Delete orders by paypal_order_id. Returns number of deleted rows. */
export async function deleteOrders(orderIds = []) {
  const ids = [...new Set((orderIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return 0;

  // PostgREST: in.("a","b") — quote values that may contain special chars.
  const filter = ids
    .map((id) => `"${id.replace(/"/g, '\\"')}"`)
    .join(",");

  const rows = await supabaseFetch(
    `/rest/v1/orders?paypal_order_id=in.(${filter})`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    },
  );
  return Array.isArray(rows) ? rows.length : ids.length;
}

const USER_COLUMNS = "id,username,email,password_hash,role";

/** Find a user by username or email (case-insensitive exact match). */
export async function findUserByLogin(login) {
  const value = String(login || "").trim();
  if (!value) return null;

  const lower = value.toLowerCase();

  for (const column of ["username", "email"]) {
    try {
      const rows = await supabaseFetch(
        `/rest/v1/users?${column}=ilike.${encodeURIComponent(value)}&select=${USER_COLUMNS}&limit=5`,
      );
      if (!Array.isArray(rows) || !rows.length) continue;
      const exact = rows.find(
        (row) => String(row[column] || "").toLowerCase() === lower,
      );
      if (exact) return exact;
    } catch (error) {
      console.warn(`[USERS] ${column} lookup failed:`, error.message || error);
    }
  }
  return null;
}

export async function createUser({ username, email, password_hash, role }) {
  const body = {
    username: username || null,
    email: email || null,
    password_hash,
    role: role || "Buyer",
  };
  const rows = await supabaseFetch("/rest/v1/users", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function ensureAdminUser({ username, password, hashPassword }) {
  const existing = await findUserByLogin(username);
  if (existing) {
    const role = String(existing.role || "").toLowerCase();
    const hash = String(existing.password_hash || "");
    const needsHashFix = !hash.startsWith("scrypt$");
    const needsPromote = role !== "admin";

    if (needsHashFix || needsPromote) {
      const rows = await supabaseFetch(
        `/rest/v1/users?id=eq.${encodeURIComponent(existing.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            role: "Admin",
            password_hash: needsHashFix ? hashPassword(password) : existing.password_hash,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      return {
        created: false,
        promoted: needsPromote,
        repaired: needsHashFix,
        user: Array.isArray(rows) ? rows[0] : existing,
      };
    }

    return { created: false, user: existing };
  }

  const user = await createUser({
    username,
    email: `${username}@moctam.local`,
    password_hash: hashPassword(password),
    role: "Admin",
  });
  return { created: true, user };
}

export async function listSiteProducts() {
  const rows = await supabaseFetch(
    "/rest/v1/site_products?select=id,data,updated_at&order=id.asc",
  );
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    ...(row.data && typeof row.data === "object" ? row.data : {}),
    id: row.id,
    updated_at: row.updated_at,
  }));
}

export async function getSiteProduct(id) {
  const rows = await supabaseFetch(
    `/rest/v1/site_products?id=eq.${encodeURIComponent(id)}&select=id,data,updated_at&limit=1`,
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows[0];
  return {
    ...(row.data && typeof row.data === "object" ? row.data : {}),
    id: row.id,
    updated_at: row.updated_at,
  };
}

export async function upsertSiteProduct(id, data) {
  const payload = {
    id,
    data,
    updated_at: new Date().toISOString(),
  };
  const rows = await supabaseFetch("/rest/v1/site_products", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    ...(row?.data && typeof row.data === "object" ? row.data : data),
    id: row?.id || id,
    updated_at: row?.updated_at,
  };
}

export async function ensureSiteProducts(defaults = []) {
  let existing = [];
  try {
    existing = await listSiteProducts();
  } catch (error) {
    throw new Error(
      `site_products unavailable — run docs/SITE_PRODUCTS.sql (${error.message || error})`,
    );
  }

  const have = new Set(existing.map((p) => p.id));
  let created = 0;
  for (const product of defaults) {
    if (!product?.id || have.has(product.id)) continue;
    await upsertSiteProduct(product.id, product);
    created += 1;
  }
  return { created, total: have.size + created };
}

export async function getSiteSettings() {
  const rows = await supabaseFetch(
    "/rest/v1/site_settings?key=eq.global&select=key,data,updated_at&limit=1",
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows[0];
  return {
    ...(row.data && typeof row.data === "object" ? row.data : {}),
    updated_at: row.updated_at,
  };
}

export async function upsertSiteSettings(data) {
  const rows = await supabaseFetch("/rest/v1/site_settings", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key: "global", data, updated_at: new Date().toISOString() }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { ...(row?.data && typeof row.data === "object" ? row.data : data), updated_at: row?.updated_at };
}

/** Seed exactly once. Existing admin edits always win. */
export async function ensureSiteSettings(defaults = {}) {
  const current = await getSiteSettings();
  if (current) return { created: false, settings: current };
  const settings = await upsertSiteSettings(defaults);
  return { created: true, settings };
}
