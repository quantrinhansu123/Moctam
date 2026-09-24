import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiPost, wakeApi } from "../lib/api";
import { AdminContentPanel } from "../components/admin/AdminContentPanel";
import {
  FeedbackCharts,
  type AdminFeedbackRow,
} from "../components/admin/FeedbackCharts";
import {
  AdminDashboardChrome,
  OrderAnalyticsCharts,
  OrderOverviewCharts,
  getDashboardRangeLabel,
  type AdminOrderRow,
} from "../components/admin/OrderCharts";

const TOKEN_KEY = "moc_tam_admin_token";

type AdminOrder = AdminOrderRow;
type AdminTab = "overview" | "charts" | "feedback" | "content";

function money(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatProducts(order: AdminOrder) {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return <span className="admin-products-empty">Chưa có sản phẩm</span>;
  }
  return order.items.map((item, index) => {
    const name = item.name || item.product_id || "Product";
    const tag = item.tag ? ` · ${item.tag}` : "";
    const qty = Math.max(1, Number(item.qty) || 1);
    return (
      <div key={`${item.product_id || name}-${index}`} className="admin-product-line">
        <span className="admin-product-name">
          {name}
          {tag}
        </span>
        <span className="admin-product-qty">×{qty}</span>
      </div>
    );
  });
}

export function AdminScreen() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersError, setOrdersError] = useState("");
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [feedbacks, setFeedbacks] = useState<AdminFeedbackRow[]>([]);
  const [feedbacksError, setFeedbacksError] = useState("");
  const [isLoadingFeedbacks, setIsLoadingFeedbacks] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tab, setTab] = useState<AdminTab>("overview");

  const allSelected =
    orders.length > 0 && selectedIds.length === orders.length;
  const someSelected =
    selectedIds.length > 0 && selectedIds.length < orders.length;
  const selectedCount = selectedIds.length;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setOrders([]);
    setFeedbacks([]);
    setSelectedIds([]);
    setOrdersError("");
    setFeedbacksError("");
  };

  const loadFeedbacks = async (authToken: string) => {
    setIsLoadingFeedbacks(true);
    setFeedbacksError("");
    try {
      await wakeApi();
      const rows = await apiGet<AdminFeedbackRow[]>("/api/admin/feedbacks", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setFeedbacks(Array.isArray(rows) ? rows : []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load feedbacks.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        logout();
        setLoginError("Session expired. Please sign in again.");
      } else {
        setFeedbacksError(message);
      }
    } finally {
      setIsLoadingFeedbacks(false);
    }
  };

  const loadOrders = async (authToken: string) => {
    setIsLoadingOrders(true);
    setOrdersError("");
    try {
      await wakeApi();
      const rows = await apiGet<AdminOrder[]>("/api/admin/orders", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const next = Array.isArray(rows) ? rows : [];
      setOrders(next);
      setSelectedIds((prev) =>
        prev.filter((id) => next.some((order) => order.paypal_order_id === id)),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load orders.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        logout();
        setLoginError("Session expired. Please sign in again.");
      } else {
        setOrdersError(message);
      }
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    document.title = "Admin – Mộc Tâm";
    document.body.dataset.page = "admin";
  }, []);

  useEffect(() => {
    if (token) {
      void loadOrders(token);
    }
  }, [token]);

  useEffect(() => {
    if (token && tab === "feedback") {
      void loadFeedbacks(token);
    }
  }, [token, tab]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      await wakeApi();
      const result = await apiPost<{ status: string; token: string }>(
        "/api/admin/login",
        { username: username.trim(), password },
      );
      if (!result.token) {
        throw new Error("Login succeeded but no token was returned.");
      }
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setPassword("");
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Could not sign in.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(orders.map((order) => order.paypal_order_id));
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length || !token) return;
    const ok = window.confirm(
      `Xóa ${selectedIds.length} đơn đã chọn? Thao tác này không hoàn tác.`,
    );
    if (!ok) return;

    setIsDeleting(true);
    setOrdersError("");
    try {
      await wakeApi();
      await apiPost<{ status: string; deleted: number }>(
        "/api/admin/orders/delete",
        { order_ids: selectedIds },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSelectedIds([]);
      await loadOrders(token);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete orders.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        logout();
        setLoginError("Session expired. Please sign in again.");
      } else {
        setOrdersError(message);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (!token) {
    return (
      <div className="admin-shell">
        <section className="admin-card" aria-labelledby="admin-login-title">
          <div className="admin-brand">
            <img
              className="admin-logo"
              src="/assets/images/moc-tam-logo.png"
              alt="Mộc Tâm"
              width={96}
              height={96}
            />
          </div>
          <h1 id="admin-login-title">Admin sign in</h1>
          <p className="admin-note">Sign in to view recent orders.</p>
          <form className="admin-form" onSubmit={handleLogin}>
            <label htmlFor="admin-username">Username or email</label>
            <input
              id="admin-username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {loginError && (
              <p className="admin-error" role="alert">
                {loginError}
              </p>
            )}
            <button type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-shell admin-shell--wide">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <img
            className="admin-logo admin-logo--compact"
            src="/assets/images/moc-tam-logo.png"
            alt="Mộc Tâm"
            width={56}
            height={56}
          />
          <h1>Orders</h1>
        </div>
        <div className="admin-topbar-actions">
          <button
            type="button"
            className="admin-secondary"
            onClick={() => {
              if (tab === "feedback") {
                void loadFeedbacks(token);
              } else {
                void loadOrders(token);
              }
            }}
            disabled={
              tab === "feedback" ? isLoadingFeedbacks : isLoadingOrders
            }
          >
            {(tab === "feedback" ? isLoadingFeedbacks : isLoadingOrders)
              ? "Refreshing…"
              : "Refresh"}
          </button>
          <button type="button" className="admin-secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <AdminDashboardChrome
        tab={tab}
        onTabChange={setTab}
        rangeLabel={getDashboardRangeLabel()}
        showContentTab
      />

      {ordersError && tab !== "feedback" && tab !== "content" && (
        <p className="admin-error" role="alert">
          {ordersError}
        </p>
      )}
      {feedbacksError && tab === "feedback" && (
        <p className="admin-error" role="alert">
          {feedbacksError}
        </p>
      )}

      {tab === "overview" ? (
        <>
          <OrderOverviewCharts orders={orders} />
          <div className="admin-section-bar">
            <h2 className="admin-section-title">Order records</h2>
            <button
              type="button"
              className="admin-danger"
              disabled={!selectedCount || isDeleting}
              onClick={() => void handleDeleteSelected()}
            >
              {isDeleting
                ? "Deleting…"
                : selectedCount
                  ? `Xóa đã chọn (${selectedCount})`
                  : "Xóa đã chọn"}
            </button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-check-col">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      aria-label="Chọn tất cả đơn"
                      disabled={!orders.length}
                    />
                  </th>
                  <th>Created</th>
                  <th>Products</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Order ID</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && !isLoadingOrders ? (
                  <tr>
                    <td colSpan={10}>No orders yet.</td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr
                      key={order.paypal_order_id}
                      className={
                        selectedSet.has(order.paypal_order_id)
                          ? "is-selected"
                          : undefined
                      }
                    >
                      <td className="admin-check-col">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(order.paypal_order_id)}
                          onChange={() => toggleOne(order.paypal_order_id)}
                          aria-label={`Chọn đơn ${order.paypal_order_id}`}
                        />
                      </td>
                      <td>{formatWhen(order.created_at)}</td>
                      <td className="admin-products">{formatProducts(order)}</td>
                      <td>{order.customer_name || "—"}</td>
                      <td>{order.customer_email}</td>
                      <td>{order.customer_phone || "—"}</td>
                      <td
                        className="admin-address"
                        title={order.customer_address || undefined}
                      >
                        {order.customer_address || "—"}
                      </td>
                      <td>
                        {money(
                          Number(order.total_amount) || 0,
                          order.currency || "USD",
                        )}
                      </td>
                      <td>{order.status || "—"}</td>
                      <td className="admin-mono">{order.paypal_order_id}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "charts" ? (
        <OrderAnalyticsCharts orders={orders} />
      ) : tab === "feedback" ? (
        <FeedbackCharts
          feedbacks={feedbacks}
          isLoading={isLoadingFeedbacks}
        />
      ) : (
        <AdminContentPanel
          token={token}
          onAuthExpired={() => {
            logout();
            setLoginError("Session expired. Please sign in again.");
          }}
        />
      )}
    </div>
  );
}
