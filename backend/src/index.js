import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import express from "express";
import { isPlaceholder, settings } from "./config.js";
import { requireAdmin, signAdminToken } from "./auth.js";
import { emailEnabled, sendThankYouEmail } from "./email.js";
import {
  capturePaypalOrder,
  createPaypalOrder,
  verifyWebhookSignature,
} from "./paypal.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  claimEmailSend,
  ensureAdminUser,
  ensureSiteProducts,
  findUserByLogin,
  getSiteProduct,
  insertFeedback,
  insertOrder,
  listFeedbacks,
  listOrders,
  deleteOrders,
  deleteSiteProduct,
  listSiteProducts,
  markOrderStatus,
  markOrderCompletedIfPending,
  updateOrderContact,
  updateOrderItems,
  upsertSiteProduct,
  ensureSiteSettings,
  getSiteSettings,
  upsertSiteSettings,
} from "./supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDefaultProducts() {
  try {
    const raw = readFileSync(
      path.join(__dirname, "data", "site_products.defaults.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    // Mầm Xôi is the sole product offered on the public storefront.
    return Array.isArray(parsed)
      ? parsed.filter((product) => product?.id === "mam-xoi")
      : [];
  } catch (error) {
    console.warn("[PRODUCTS] could not load defaults:", error.message || error);
    return [];
  }
}

const DEFAULT_PRODUCTS = loadDefaultProducts();

function loadDefaultSettings() {
  try {
    return JSON.parse(readFileSync(path.join(__dirname, "data", "site_settings.defaults.json"), "utf8"));
  } catch (error) {
    console.warn("[SETTINGS] could not load defaults:", error.message || error);
    return {};
  }
}
const DEFAULT_SETTINGS = loadDefaultSettings();

function mergeSettings(defaults, persisted) {
  const merged = { ...defaults, ...(persisted || {}) };
  for (const key of ["hero", "footer"]) {
    merged[key] = { ...(defaults[key] || {}), ...(persisted?.[key] || {}) };
  }
  return merged;
}

function mergeProductCatalog(dbRows, defaults) {
  const byId = new Map();
  for (const product of defaults || []) {
    if (product?.id) byId.set(product.id, { ...product });
  }
  for (const row of dbRows || []) {
    if (!row?.id) continue;
    if (row.deleted === true) {
      byId.delete(row.id);
      continue;
    }
    const prev = byId.get(row.id) || {};
    byId.set(row.id, {
      ...prev,
      ...row,
      id: row.id,
      content: {
        ...(prev.content || {}),
        ...(row.content || {}),
        gallery:
          Array.isArray(row.content?.gallery) && row.content.gallery.length
            ? row.content.gallery
            : prev.content?.gallery || [],
      },
    });
  }
  return [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

const app = express();
app.use(cors());
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

function error(res, status, message) {
  return res.status(status).json({ status: "error", message });
}

function isValidEmail(candidate) {
  if (!candidate || candidate.length > 254 || /\s/.test(candidate)) return false;
  const [local, domain] = candidate.split("@");
  return Boolean(
    local &&
      domain &&
      !domain.includes("@") &&
      domain.includes(".") &&
      !domain.startsWith(".") &&
      !domain.endsWith(".") &&
      !domain.includes(".."),
  );
}

function isValidPhone(candidate) {
  const digits = [...candidate].filter((c) => /\d/.test(c)).length;
  return (
    digits >= 8 &&
    digits <= 15 &&
    candidate.length <= 40 &&
    [...candidate].every((c) => /[\d+\s().-]/.test(c))
  );
}

function parseAmount(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function trimOrEmpty(value) {
  return String(value ?? "").trim();
}

function isValidProductId(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120;
}

function normalizeOrderItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const productId = trimOrEmpty(item?.product_id || item?.productId);
      const name = trimOrEmpty(item?.name) || productId || "Product";
      const tag = trimOrEmpty(item?.tag);
      const qty = Math.max(1, Math.min(99, Number(item?.qty) || 1));
      const price = Number(item?.price);
      if (!productId && !name) return null;
      return {
        product_id: productId || name,
        name,
        tag: tag || null,
        qty,
        price: Number.isFinite(price) ? Math.round(price * 100) / 100 : null,
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

function boxesInOrderItem(item) {
  return Math.max(1, Number(item?.qty) || 1) *
    (/2\s*box/i.test(String(item?.tag || "")) ? 2 : 1);
}

function stockNeededByProduct(items) {
  const needed = new Map();
  for (const item of items || []) {
    const id = trimOrEmpty(item?.product_id || item?.productId);
    if (!id) continue;
    needed.set(id, (needed.get(id) || 0) + boxesInOrderItem(item));
  }
  return needed;
}

async function assertStockAvailable(items) {
  for (const [id, boxes] of stockNeededByProduct(items)) {
    const product = await getSiteProduct(id);
    if (!product || product.deleted === true) {
      throw new Error(`Product '${id}' is no longer available.`);
    }
    if (typeof product.stock === "number" && product.stock < boxes) {
      throw new Error(`Only ${product.stock} box(es) of '${product.name || id}' remain.`);
    }
  }
}

async function decrementProductStock(items) {
  for (const [id, boxes] of stockNeededByProduct(items)) {
    const product = await getSiteProduct(id);
    if (!product || typeof product.stock !== "number") continue;
    if (product.stock < boxes) {
      throw new Error(`Stock changed before payment completed for '${product.name || id}'.`);
    }
    await upsertSiteProduct(id, { ...product, stock: product.stock - boxes });
  }
}

async function completeOrderAndQueueEmail(paypalOrderId, source) {
  let completedOrder = null;
  try {
    completedOrder = await markOrderCompletedIfPending(paypalOrderId);
    if (!completedOrder) {
      console.log(
        `[ORDERS] (${source}) ${paypalOrderId} was already completed or no order record was found`,
      );
    } else {
      console.log(`[ORDERS] (${source}) ${paypalOrderId} → COMPLETED`);
    }
  } catch (error) {
    console.error(
      `[ORDERS] (${source}) failed to mark ${paypalOrderId} COMPLETED:`,
      error.message || error,
    );
  }

  if (completedOrder?.items) {
    try {
      await decrementProductStock(completedOrder.items);
    } catch (error) {
      console.error(`[STOCK] (${source}) could not decrement stock for ${paypalOrderId}:`, error.message || error);
    }
  }

  try {
    const order = await claimEmailSend(paypalOrderId);
    if (!order) {
      console.log(
        `[EMAIL] (${source}) skipping email for ${paypalOrderId}: already sent or no order record`,
      );
      return;
    }

    const recipient = order.customer_email;
    const amount = order.total_amount;
    const currency = order.currency || "USD";
    console.log(
      `[EMAIL] (${source}) queueing thank-you email to ${recipient} (Order #${paypalOrderId})`,
    );
    sendThankYouEmail(recipient, paypalOrderId, amount, currency).catch((error) => {
      console.error(`[EMAIL] failed for ${paypalOrderId}:`, error.message || error);
    });
  } catch (error) {
    console.error(
      `[EMAIL] (${source}) could not claim email for ${paypalOrderId}:`,
      error.message || error,
    );
  }
}

app.get("/", (_req, res) => {
  res.type("text").send("Ok!");
});

app.post("/api/feedback", async (req, res) => {
  try {
    const topic = trimOrEmpty(req.body?.topic);
    const content = trimOrEmpty(req.body?.content);
    if (!topic) return error(res, 400, "Topic is required.");
    if ([...topic].length > 100) {
      return error(res, 400, "Topic must not exceed 100 characters.");
    }
    if (!content) return error(res, 400, "Content is required.");
    if ([...content].length > 5000) {
      return error(res, 400, "Content must not exceed 5000 characters.");
    }

    const feedbackId = await insertFeedback({ topic, content });
    return res.status(201).json({
      status: "success",
      message: "Thank you for your feedback!",
      data: { feedback_id: feedbackId },
    });
  } catch (err) {
    console.error("Failed to save feedback:", err.message || err);
    return error(res, 500, "Unable to save feedback right now.");
  }
});

app.post("/api/orders/manual", async (req, res) => {
  try {
    const customerEmail = trimOrEmpty(req.body?.email);
    const customerName = trimOrEmpty(req.body?.name);
    const customerPhone = trimOrEmpty(req.body?.phone);
    const customerAddress = trimOrEmpty(req.body?.address);

    if (!customerEmail) return error(res, 400, "Email is required.");
    if (!isValidEmail(customerEmail)) {
      return error(res, 400, "Please provide a valid email address.");
    }
    if ([...customerName].length < 2 || [...customerName].length > 120) {
      return error(res, 400, "name must be between 2 and 120 characters.");
    }
    if (!isValidPhone(customerPhone)) {
      return error(res, 400, "Please provide a valid phone number.");
    }
    if ([...customerAddress].length < 5 || [...customerAddress].length > 500) {
      return error(res, 400, "address must be between 5 and 500 characters.");
    }

    const amount = parseAmount(req.body?.amount);
    if (!(amount > 0 && amount <= 9999.99)) {
      return error(res, 400, "amount must be greater than 0 and at most 9999.99.");
    }
    const currency = trimOrEmpty(req.body?.currency || "USD").toUpperCase();
    if (currency.length !== 3) {
      return error(res, 400, "currency must be a 3-letter ISO-4217 code.");
    }

    const items = normalizeOrderItems(req.body?.items);

    let orderId = `manual-${Date.now()}${Math.floor(Math.random() * 1000)}`;

    try {
      await insertOrder({
        paypal_order_id: orderId,
        customer_email: customerEmail,
        total_amount: amount,
        currency,
        status: "PENDING",
        ...(items.length ? { items } : {}),
      });
      if (items.length) {
        const patched = await updateOrderItems(orderId, items);
        if (!patched) {
          console.warn(
            `[ORDERS] items not confirmed on ${orderId} — check docs/ORDERS_ITEMS.sql`,
          );
        }
      }
    } catch (orderError) {
      console.error(`[ORDERS] core insert failed for ${orderId}:`, orderError.message);
      try {
        const itemLines = items.length
          ? [
              "Items:",
              ...items.map(
                (item) =>
                  `- ${item.name}${item.tag ? ` (${item.tag})` : ""} ×${item.qty}` +
                  (item.price != null ? ` @ ${item.price}` : ""),
              ),
            ]
          : ["Items: (none)"];
        const feedbackId = await insertFeedback({
          topic: `Order · ${amount.toFixed(2)} ${currency}`,
          content: [
            "ORDER LEAD",
            `Name: ${customerName}`,
            `Email: ${customerEmail}`,
            `Phone: ${customerPhone}`,
            `Address: ${customerAddress}`,
            `Amount: ${amount.toFixed(2)} ${currency}`,
            ...itemLines,
            `Orders insert error: ${orderError.message}`,
          ].join("\n"),
        });
        orderId = `feedback-${feedbackId}`;
        console.log(`[ORDERS] MANUAL order stored via feedbacks as ${orderId}`);
        return res.status(201).json({
          status: "success",
          message: "Order saved.",
          order_id: orderId,
        });
      } catch (feedbackError) {
        console.error("[ORDERS] feedback fallback also failed:", feedbackError.message);
        return error(res, 500, `Unable to save order: ${orderError.message}`);
      }
    }

    try {
      await updateOrderContact(orderId, {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
      });
    } catch (contactError) {
      console.warn(
        `[ORDERS] contact update skipped for ${orderId}:`,
        contactError.message,
      );
    }

    console.log(
      `[ORDERS] MANUAL order ${orderId} stored for ${customerEmail} (${items.length} item lines)`,
    );
    return res.status(201).json({
      status: "success",
      message: "Order saved.",
      order_id: orderId,
    });
  } catch (err) {
    console.error("[ORDERS] manual unexpected error:", err.message || err);
    return error(res, 500, "Unable to save order right now.");
  }
});

app.post("/api/orders/paypal/create", async (req, res) => {
  try {
    const email = trimOrEmpty(req.body?.email);
    if (email && !isValidEmail(email)) {
      return error(res, 400, "Please provide a valid email address.");
    }

    let amount = parseAmount(req.body?.amount);
    if (amount == null && req.body?.product_id) amount = 1;
    if (!(amount > 0 && amount <= 9999.99)) {
      return error(res, 400, "amount is required.");
    }

    const currency = trimOrEmpty(req.body?.currency || "USD").toUpperCase();
    if (currency.length !== 3) {
      return error(res, 400, "currency must be a 3-letter ISO-4217 code.");
    }

    const items = normalizeOrderItems(req.body?.items);
    await assertStockAvailable(items);
    console.log(`Initiating PayPal checkout: ${amount.toFixed(2)} ${currency}`);
    const order = await createPaypalOrder(amount, currency);

    if (email) {
      try {
        await insertOrder({
          paypal_order_id: order.id,
          customer_email: email,
          customer_name: trimOrEmpty(req.body?.name) || undefined,
          customer_phone: trimOrEmpty(req.body?.phone) || undefined,
          customer_address: trimOrEmpty(req.body?.address) || undefined,
          total_amount: amount,
          currency,
          status: "PENDING",
          ...(items.length ? { items } : {}),
        });
        if (items.length) {
          await updateOrderItems(order.id, items);
        }
        console.log(
          `[ORDERS] PENDING order ${order.id} stored for ${email} (${items.length} item lines)`,
        );
      } catch (error) {
        console.error(`[ORDERS] failed to store PENDING order ${order.id}:`, error.message);
      }
    }

    const approveUrl =
      (order.links || []).find((link) => link.rel === "approve")?.href || "";

    return res.json({
      paypal_order_id: order.id,
      approve_url: approveUrl,
    });
  } catch (err) {
    console.error("PayPal Create Error:", err.message || err);
    const message = String(err.message || err);
    if (/^(Only \d+ box\(es\)|Product '.+' is no longer available)/.test(message)) {
      return error(res, 409, message);
    }
    return error(res, 500, "Failed to communicate with PayPal");
  }
});

app.post("/api/orders/paypal/capture", async (req, res) => {
  try {
    const paypalOrderId = trimOrEmpty(req.body?.paypal_order_id);
    if (!paypalOrderId) return error(res, 400, "paypal_order_id is required.");

    const capture = await capturePaypalOrder(paypalOrderId);
    if (capture.status === "COMPLETED") {
      await completeOrderAndQueueEmail(paypalOrderId, "capture");
      return res.json({
        status: "success",
        message: "Order captured successfully.",
        paypal_order_id: capture.id,
      });
    }

    if (capture.status === "FAILED") {
      try {
        await markOrderStatus(paypalOrderId, "FAILED");
      } catch (error) {
        console.error("[ORDERS] failed to mark FAILED:", error.message);
      }
    }

    return error(res, 400, `Order status is not COMPLETED: ${capture.status}`);
  } catch (err) {
    console.error("PayPal Capture Error:", err.message || err);
    return error(res, 500, "Failed to capture payment via PayPal");
  }
});

app.post("/api/webhooks/paypal", async (req, res) => {
  try {
    const raw = req.rawBody || JSON.stringify(req.body);
    const event = typeof req.body === "object" ? req.body : JSON.parse(raw);

    const headers = {
      "paypal-auth-algo": req.header("paypal-auth-algo"),
      "paypal-cert-url": req.header("paypal-cert-url"),
      "paypal-transmission-id": req.header("paypal-transmission-id"),
      "paypal-transmission-sig": req.header("paypal-transmission-sig"),
      "paypal-transmission-time": req.header("paypal-transmission-time"),
    };

    if (
      !headers["paypal-auth-algo"] ||
      !headers["paypal-cert-url"] ||
      !headers["paypal-transmission-id"] ||
      !headers["paypal-transmission-sig"] ||
      !headers["paypal-transmission-time"]
    ) {
      // Allow mock mode without headers when webhook id unset
      if (!isPlaceholder(settings.paypalWebhookId)) {
        return error(res, 400, "Missing PayPal webhook signature headers.");
      }
    } else {
      const ok = await verifyWebhookSignature(headers, raw);
      if (!ok) return error(res, 401, "Webhook signature verification failed.");
    }

    const eventType = event.event_type || "";
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId =
        event?.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        await completeOrderAndQueueEmail(orderId, "webhook");
        return res.json({ status: "processed", paypal_order_id: orderId });
      }
      return res.json({ status: "ignored" });
    }

    if (
      eventType === "PAYMENT.CAPTURE.DENIED" ||
      eventType === "PAYMENT.CAPTURE.FAILED"
    ) {
      const orderId =
        event?.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        try {
          await markOrderStatus(orderId, "FAILED");
        } catch (error) {
          console.error(`[ORDERS] webhook failed to mark FAILED:`, error.message);
        }
      }
      return res.json({ status: "processed" });
    }

    console.log(`[WEBHOOK] ignored event type: ${eventType}`);
    return res.json({ status: "ignored" });
  } catch (err) {
    console.error("[WEBHOOK] error:", err.message || err);
    return error(res, 500, "Webhook verification error.");
  }
});

app.post("/api/admin/login", async (req, res) => {
  const username = trimOrEmpty(req.body?.username);
  const password = trimOrEmpty(req.body?.password);
  if (!username || !password) {
    return error(res, 400, "Username and password are required.");
  }

  try {
    const user = await findUserByLogin(username);
    if (user) {
      const role = String(user.role || "").toLowerCase();
      if (role !== "admin") {
        return error(res, 403, "Account is not an admin.");
      }
      if (!verifyPassword(password, user.password_hash)) {
        return error(res, 401, "Invalid username or password.");
      }
      const subject = user.username || user.email || user.id;
      return res.json({
        status: "success",
        token: signAdminToken(String(subject)),
      });
    }

    // Fallback: env credentials (before users table is seeded / SQL applied).
    if (
      !isPlaceholder(settings.adminUsername) &&
      !isPlaceholder(settings.adminPassword) &&
      username === settings.adminUsername &&
      password === settings.adminPassword
    ) {
      return res.json({
        status: "success",
        token: signAdminToken(username),
      });
    }

    return error(res, 401, "Invalid username or password.");
  } catch (err) {
    console.error("[ADMIN] login failed:", err.message || err);
    return error(res, 500, "Unable to sign in right now.");
  }
});

app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
  try {
    const orders = await listOrders(100);
    return res.json(orders);
  } catch (err) {
    console.error("[ADMIN] list orders failed:", err.message || err);
    return error(res, 500, "Unable to load orders right now.");
  }
});

app.get("/api/admin/feedbacks", requireAdmin, async (_req, res) => {
  try {
    const feedbacks = await listFeedbacks(200);
    return res.json(Array.isArray(feedbacks) ? feedbacks : []);
  } catch (err) {
    console.error("[ADMIN] list feedbacks failed:", err.message || err);
    return error(res, 500, "Unable to load feedbacks right now.");
  }
});

app.post("/api/admin/orders/delete", requireAdmin, async (req, res) => {
  try {
    const raw = req.body?.order_ids ?? req.body?.ids ?? [];
    const orderIds = Array.isArray(raw)
      ? [...new Set(raw.map((id) => trimOrEmpty(id)).filter(Boolean))]
      : [];
    if (!orderIds.length) {
      return error(res, 400, "Select at least one order to delete.");
    }
    if (orderIds.length > 100) {
      return error(res, 400, "You can delete at most 100 orders at once.");
    }

    const deleted = await deleteOrders(orderIds);
    console.log(`[ADMIN] deleted ${deleted} order(s)`);
    return res.json({ status: "success", deleted, order_ids: orderIds });
  } catch (err) {
    console.error("[ADMIN] delete orders failed:", err.message || err);
    return error(res, 500, "Unable to delete orders right now.");
  }
});

app.get("/api/products", async (_req, res) => {
  try {
    const rows = await listSiteProducts();
    return res.json(mergeProductCatalog(rows, DEFAULT_PRODUCTS));
  } catch (err) {
    console.warn("[PRODUCTS] list failed, serving defaults:", err.message || err);
    return res.json(DEFAULT_PRODUCTS);
  }
});

app.get("/api/settings", async (_req, res) => {
  try {
    return res.json(mergeSettings(DEFAULT_SETTINGS, await getSiteSettings()));
  } catch (err) {
    console.warn("[SETTINGS] read failed, serving defaults:", err.message || err);
    return res.json(DEFAULT_SETTINGS);
  }
});

app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return error(res, 400, "Settings body is required.");
  }
  const arrays = ["heroSlides", "announcementBar"];
  if (arrays.some((key) => key in incoming && !Array.isArray(incoming[key]))) {
    return error(res, 400, "heroSlides and announcementBar must be arrays.");
  }
  if ("footer" in incoming && (!incoming.footer || typeof incoming.footer !== "object" || Array.isArray(incoming.footer))) {
    return error(res, 400, "footer must be an object.");
  }
  const hasBadUrl = [...(incoming.heroSlides || [])].some((slide) =>
    !slide || typeof slide.image !== "string" || !slide.image.trim(),
  );
  if (hasBadUrl) return error(res, 400, "Each hero slide requires an image URL/path.");
  if ((incoming.heroSlides || []).some((slide) => typeof slide.alt !== "string")) {
    return error(res, 400, "Each hero slide requires alt text.");
  }
  if ((incoming.announcementBar || []).some((item) => !item || typeof item.text !== "string" || typeof item.glyph !== "string")) {
    return error(res, 400, "Each announcement requires icon and text.");
  }
  // Normalize empty glyph to a safe default so UI clears don't block save.
  if (Array.isArray(incoming.announcementBar)) {
    incoming.announcementBar = incoming.announcementBar.map((item) => ({
      ...item,
      glyph: String(item.glyph || "campaign").trim() || "campaign",
      text: String(item.text || "").trim(),
      enabled: item.enabled !== false,
    }));
  }
  if (Array.isArray(incoming.heroSlides)) {
    incoming.heroSlides = incoming.heroSlides.map((slide) => ({
      ...slide,
      image: String(slide.image || "").trim(),
      alt: String(slide.alt ?? ""),
    }));
  }
  try {
    const saved = await upsertSiteSettings(incoming);
    return res.json({ status: "success", settings: mergeSettings(DEFAULT_SETTINGS, saved) });
  } catch (err) {
    console.error("[ADMIN] save settings failed:", err.message || err);
    return error(
      res,
      500,
      `Unable to save settings: ${String(err.message || err).slice(0, 180)}`,
    );
  }
});

app.get("/api/products/:id", async (req, res) => {
  const id = trimOrEmpty(req.params.id);
  if (!id) return error(res, 400, "Product id is required.");
  try {
    const row = await getSiteProduct(id);
    if (row?.deleted !== true) {
      if (row) return res.json(row);
    } else {
      return error(res, 404, "Product not found.");
    }
  } catch (err) {
    console.warn("[PRODUCTS] get failed:", err.message || err);
  }
  const fallback = DEFAULT_PRODUCTS.find((p) => p.id === id);
  if (fallback) return res.json(fallback);
  return error(res, 404, "Product not found.");
});

app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const id = trimOrEmpty(req.params.id);
  if (!id) return error(res, 400, "Product id is required.");
  if (!isValidProductId(id)) {
    return error(res, 400, "Product id may contain lowercase letters, numbers, and hyphens only.");
  }

  try {
    await deleteSiteProduct(id);
    console.log(`[ADMIN] deleted product '${id}'`);
    return res.json({ status: "success", id });
  } catch (err) {
    console.error("[ADMIN] delete product failed:", err.message || err);
    return error(res, 500, "Unable to delete product.");
  }
});

app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const id = trimOrEmpty(req.params.id);
  if (!id) return error(res, 400, "Product id is required.");
  if (!isValidProductId(id)) {
    return error(res, 400, "Product id may contain lowercase letters, numbers, and hyphens only.");
  }

  const patch = req.body && typeof req.body === "object" ? req.body : null;
  if (!patch) return error(res, 400, "Product body is required.");

  try {
    let current = null;
    try {
      current = await getSiteProduct(id);
    } catch {
      current = null;
    }
    const baseline =
      current || DEFAULT_PRODUCTS.find((p) => p.id === id) || { id };

    const next = {
      ...baseline,
      ...patch,
      id,
      content: {
        ...(baseline.content || {}),
        ...(patch.content || {}),
      },
    };

    if (Array.isArray(patch.content?.gallery)) {
      next.content.gallery = patch.content.gallery;
    }
    if (Array.isArray(patch.compareParas)) {
      next.compareParas = patch.compareParas;
    }

    const contentArrays = ["gallery", "features", "steps", "stories", "benefits", "stats", "miniReviews", "accordions", "faq"];
    if (patch.content && contentArrays.some((key) => key in patch.content && !Array.isArray(patch.content[key]))) {
      return error(res, 400, "Product content lists must be arrays.");
    }

    const price = Number(next.price);
    const twoBoxPrice = Number(next.twoBoxPrice);
    if (!(price > 0 && price <= 9999.99)) {
      return error(res, 400, "price must be greater than 0 and at most 9999.99.");
    }
    if (!(twoBoxPrice > 0 && twoBoxPrice <= 9999.99)) {
      return error(
        res,
        400,
        "twoBoxPrice must be greater than 0 and at most 9999.99.",
      );
    }
    next.price = Math.round(price * 100) / 100;
    next.twoBoxPrice = Math.round(twoBoxPrice * 100) / 100;
    if (next.stock === undefined || next.stock === null || next.stock === "") {
      next.stock = null;
    } else {
      const stock = Number(next.stock);
      if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
        return error(res, 400, "stock must be a whole number from 0 to 1000000.");
      }
      next.stock = stock;
    }
    delete next.regularPrice;
    delete next.twoBoxRegularPrice;
    next.name = trimOrEmpty(next.name) || baseline.name || id;

    const saved = await upsertSiteProduct(id, next);
    return res.json({ status: "success", product: saved });
  } catch (err) {
    console.error("[ADMIN] save product failed:", err.message || err);
    return error(
      res,
      500,
      `Unable to save product: ${String(err.message || err).slice(0, 180)}`,
    );
  }
});

if (emailEnabled()) {
  console.log("Email: Resend API enabled");
} else {
  console.log(
    "[MOCK EMAIL] Resend API not configured — thank-you emails will be logged to stdout",
  );
}

async function bootstrapAdminUser() {
  if (
    isPlaceholder(settings.adminUsername) ||
    isPlaceholder(settings.adminPassword)
  ) {
    console.log(
      "[ADMIN] skip users seed — set ADMIN_USERNAME / ADMIN_PASSWORD to seed default admin",
    );
    return;
  }

  try {
    const result = await ensureAdminUser({
      username: settings.adminUsername,
      password: settings.adminPassword,
      hashPassword,
    });
    if (result.created) {
      console.log(
        `[ADMIN] seeded users row '${settings.adminUsername}' (role=Admin)`,
      );
    } else if (result.promoted) {
      console.log(
        `[ADMIN] promoted '${settings.adminUsername}' to Admin in users`,
      );
    } else {
      console.log(
        `[ADMIN] users login ready for '${settings.adminUsername}'`,
      );
    }
  } catch (err) {
    console.warn(
      "[ADMIN] could not seed/read users table — run docs/USERS_TABLE.sql. Env login still works.",
      err.message || err,
    );
  }
}

async function bootstrapSiteProducts() {
  if (!DEFAULT_PRODUCTS.length) {
    console.log("[PRODUCTS] no defaults file — skip seed");
    return;
  }
  try {
    const result = await ensureSiteProducts(DEFAULT_PRODUCTS);
    console.log(
      `[PRODUCTS] site_products ready (seeded ${result.created}, total ~${result.total})`,
    );
  } catch (err) {
    console.warn("[PRODUCTS]", err.message || err);
  }
}

async function bootstrapSiteSettings() {
  try {
    const result = await ensureSiteSettings(DEFAULT_SETTINGS);
    console.log(`[SETTINGS] site_settings ready${result.created ? " (seeded global row)" : " (existing global row preserved)"}`);
  } catch (err) {
    console.warn("[SETTINGS]", err.message || err);
  }
}

await bootstrapAdminUser();
await bootstrapSiteProducts();
await bootstrapSiteSettings();

app.listen(settings.port, settings.host, () => {
  console.log(`Starting Express server on ${settings.host}:${settings.port}`);
});
