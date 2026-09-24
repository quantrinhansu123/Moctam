import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, wakeApi } from "../lib/api";

const TOKEN_KEY = "moc_tam_admin_token";

interface AdminOrder {
  paypal_order_id: string;
  customer_email: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  total_amount: number;
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
}

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

export function AdminScreen() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersError, setOrdersError] = useState("");
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setOrders([]);
    setOrdersError("");
  };

  const loadOrders = async (authToken: string) => {
    setIsLoadingOrders(true);
    setOrdersError("");
    try {
      await wakeApi();
      const rows = await apiGet<AdminOrder[]>("/api/admin/orders", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setOrders(rows);
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

  if (!token) {
    return (
      <div className="admin-shell">
        <section className="admin-card" aria-labelledby="admin-login-title">
          <p className="admin-eyebrow">Mộc Tâm</p>
          <h1 id="admin-login-title">Admin sign in</h1>
          <p className="admin-note">Sign in to view recent orders.</p>
          <form className="admin-form" onSubmit={handleLogin}>
            <label htmlFor="admin-username">Username</label>
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
        <div>
          <p className="admin-eyebrow">Mộc Tâm</p>
          <h1>Orders</h1>
        </div>
        <div className="admin-topbar-actions">
          <button
            type="button"
            className="admin-secondary"
            onClick={() => void loadOrders(token)}
            disabled={isLoadingOrders}
          >
            {isLoadingOrders ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="admin-secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {ordersError && (
        <p className="admin-error" role="alert">
          {ordersError}
        </p>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Created</th>
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
                <td colSpan={8}>No orders yet.</td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.paypal_order_id}>
                  <td>{formatWhen(order.created_at)}</td>
                  <td>{order.customer_name || "—"}</td>
                  <td>{order.customer_email}</td>
                  <td>{order.customer_phone || "—"}</td>
                  <td>{order.customer_address || "—"}</td>
                  <td>{money(order.total_amount, order.currency || "USD")}</td>
                  <td>{order.status || "—"}</td>
                  <td className="admin-mono">{order.paypal_order_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
