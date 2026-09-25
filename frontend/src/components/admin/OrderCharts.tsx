import type { ReactNode } from "react";

export interface AdminOrderItem {
  product_id?: string;
  name?: string;
  tag?: string | null;
  qty?: number;
  price?: number | null;
}

export interface AdminOrderRow {
  paypal_order_id: string;
  customer_email: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  total_amount: number;
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
  items?: AdminOrderItem[] | null;
}

const RANGE_DAYS = 14;

const STATUS_ORDER = ["PENDING", "PAID", "PROCESSING", "CANCELLED"] as const;

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#d5a846",
  PAID: "#36a46d",
  PROCESSING: "#0876ea",
  CANCELLED: "#e91c35",
  COMPLETED: "#36a46d",
};

function money(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shortLabel(key: string) {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function formatDatePill(from: Date, to: Date) {
  const fmt = (date: Date) =>
    `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  const end = `${fmt(to)}/${to.getFullYear()}`;
  return `${fmt(from)} - ${end}`;
}

function normalizeStatus(status?: string | null) {
  const value = (status || "PENDING").toUpperCase();
  if (value === "COMPLETED") return "PAID";
  if (value === "FAILED") return "CANCELLED";
  if ((STATUS_ORDER as readonly string[]).includes(value)) return value;
  return "PENDING";
}

function inRange(order: AdminOrderRow, from: Date, to: Date) {
  if (!order.created_at) return false;
  const created = new Date(order.created_at);
  if (Number.isNaN(created.getTime())) return false;
  return created >= from && created <= to;
}

function pctChange(current: number, previous: number) {
  if (previous <= 0) {
    return { pct: current > 0 ? 100 : 0, hasPrev: previous > 0 || current > 0 };
  }
  return {
    pct: Math.round(((current - previous) / previous) * 100),
    hasPrev: true,
  };
}

function buildStatusRows(orders: AdminOrderRow[]) {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<
    string,
    number
  >;
  for (const order of orders) {
    const status = normalizeStatus(order.status);
    counts[status] = (counts[status] || 0) + 1;
  }
  const total = orders.length;
  return STATUS_ORDER.map((status) => ({
    status,
    count: counts[status] || 0,
    pct: total ? Math.round(((counts[status] || 0) / total) * 100) : 0,
    color: STATUS_COLORS[status],
  }));
}

function buildRevenueSeries(orders: AdminOrderRow[], days = RANGE_DAYS) {
  const today = startOfDay(new Date());
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(dayKey(addDays(today, -i)));
  }
  const totals = new Map(keys.map((key) => [key, 0]));
  for (const order of orders) {
    if (!order.created_at) continue;
    const created = new Date(order.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const key = dayKey(created);
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) || 0) + Number(order.total_amount || 0));
  }
  return keys.map((key) => ({
    key,
    label: shortLabel(key),
    total: totals.get(key) || 0,
  }));
}

function niceMax(value: number) {
  if (value <= 0) return 10;
  const padded = value * 1.15;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function IconBars() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 20h20v2H2zm3-5h4v4H5zm5-5h4v9h-4zm5-6h4v15h-4z" />
    </svg>
  );
}

function IconPie() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 2a10 10 0 1 0 10 11H11zm2 0v9h9a10 10 0 0 0-9-9" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 2v6M17 2v6M3 10h18M8 15h3m-3 3h3" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12 3h17l9 9v31a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm16 3v8h8zM16 22v3h16v-3zm0 7v3h12v-3z" />
    </svg>
  );
}

function IconRevenue() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M17 3h14l-3 8H20zM17 13h14c9 9 14 19 12 27-1 5-7 7-19 7S6 45 5 40c-2-8 3-18 12-27zm9 6h-4v3c-3 1-5 3-5 6 0 7 9 5 9 9 0 2-4 2-7 0l-2 3c2 2 4 3 5 3v2h4v-3c7-2 8-9 2-12-5-2-7-2-7-4 0-2 3-2 6-1l2-3c-1-1-2-1-3-2z" />
    </svg>
  );
}

function IconPending() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 3h28v5h-3v4c0 6-4 9-8 12 4 3 8 6 8 12v4h3v5H10v-5h3v-4c0-6 4-9 8-12-4-3-8-6-8-12V8h-3zm8 5v4c0 5 3 7 6 9 3-2 6-4 6-9V8zm6 19c-3 2-6 4-6 9v4h12v-4c0-5-3-7-6-9z" />
    </svg>
  );
}

function IconPaid() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3a21 21 0 1 0 0 42 21 21 0 0 0 0-42zm-3 30-9-9 3-3 6 6 12-12 3 3z" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="m24 3 21 10-21 10L3 13zm-18 17 18 9 18-9 3 4-21 11L3 24zm0 11 18 9 18-9 3 4-21 11L3 35z" />
    </svg>
  );
}

function IconChartBars() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M4 41h40v4H4zM8 28h8v10H8zm12-11h8v21h-8zm12-12h8v33h-8z" />
    </svg>
  );
}

export function AdminDashboardChrome({
  tab,
  onTabChange,
  rangeLabel,
  showContentTab,
}: {
  tab: "overview" | "charts" | "feedback" | "content";
  onTabChange: (tab: "overview" | "charts" | "feedback" | "content") => void;
  rangeLabel: string;
  showContentTab?: boolean;
}) {
  return (
    <header className="dash-topbar">
      <nav className="dash-tabs" role="tablist" aria-label="Chế độ xem">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          className={`dash-tab${tab === "overview" ? " is-active" : ""}`}
          onClick={() => onTabChange("overview")}
        >
          <IconBars />
          Tổng quan
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "charts"}
          className={`dash-tab${tab === "charts" ? " is-active" : ""}`}
          onClick={() => onTabChange("charts")}
        >
          <IconPie />
          Biểu đồ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "feedback"}
          className={`dash-tab${tab === "feedback" ? " is-active" : ""}`}
          onClick={() => onTabChange("feedback")}
        >
          Góp ý
        </button>
        {showContentTab && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "content"}
            className={`dash-tab${tab === "content" ? " is-active" : ""}`}
            onClick={() => onTabChange("content")}
          >
            Nội dung
          </button>
        )}
      </nav>
      {tab !== "content" && (
        <div className="dash-date-pill" aria-label={`Khoảng ngày ${rangeLabel}`}>
          <IconCalendar />
          <span>{rangeLabel}</span>
          <span className="dash-date-divider" />
          <span aria-hidden="true">⌄</span>
        </div>
      )}
    </header>
  );
}

function MetricCard({
  tone,
  title,
  value,
  trendPct,
  icon,
}: {
  tone?: "blue" | "amber" | "red";
  title: string;
  value: string;
  trendPct: number;
  icon: ReactNode;
}) {
  const up = trendPct > 0;
  const flat = trendPct === 0;
  const trendClass = up
    ? tone === "blue"
      ? "up-dark"
      : "up"
    : flat
      ? ""
      : "down";

  return (
    <article className={`dash-metric${tone ? ` ${tone}` : ""}`}>
      <div className="dash-metric-icon">{icon}</div>
      <div className="dash-metric-main">
        <div className="dash-metric-title">{title}</div>
        <div className="dash-metric-value">{value}</div>
      </div>
      <div className={`dash-trend${trendClass ? ` ${trendClass}` : ""}`}>
        <div className="dash-trend-top">
          {up ? "⌁ " : flat ? "-- " : "⌄ "}
          {Math.abs(trendPct)}%
        </div>
        So với 14 ngày trước
      </div>
    </article>
  );
}

function StatusPanel({
  orders,
  large,
}: {
  orders: AdminOrderRow[];
  large?: boolean;
}) {
  const rows = buildStatusRows(orders);
  const total = orders.length;
  const gradient =
    total === 0
      ? "#e8eef1"
      : rows
          .filter((row) => row.count > 0)
          .reduce((acc, row, index, list) => {
            const start = list
              .slice(0, index)
              .reduce((sum, item) => sum + (item.count / total) * 100, 0);
            const end = start + (row.count / total) * 100;
            return `${acc}${index ? ", " : ""}${row.color} ${start}% ${end}%`;
          }, "");

  return (
    <article className={`dash-panel${large ? " dash-panel--large" : ""}`}>
      <div className="dash-panel-header">
        <div className="dash-panel-heading">
          <div className="dash-panel-icon">
            <IconLayers />
          </div>
          <div>
            <h2>Orders by status</h2>
            <p>Tổng số đơn hàng theo trạng thái</p>
          </div>
        </div>
        <span className="dash-range">
          14 ngày qua <span>⌄</span>
        </span>
      </div>
      <div className="dash-status-content">
        <div
          className="dash-donut"
          style={{
            background: `conic-gradient(${gradient || "#e8eef1"} 0 100%)`,
          }}
          role="img"
          aria-label={`${total} orders by status`}
        >
          <div className="dash-donut-label">
            <strong>{total}</strong>
            <span>orders</span>
          </div>
        </div>
        <div className="dash-legend">
          {rows.map((row) => (
            <div className="dash-legend-row" key={row.status}>
              <i
                className="dash-dot"
                style={{ background: row.color }}
                aria-hidden
              />
              <span>{row.status}</span>
              <b>{row.count}</b>
              <span className="dash-pct">{row.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function RevenuePanel({
  orders,
  currency,
  large,
}: {
  orders: AdminOrderRow[];
  currency: string;
  large?: boolean;
}) {
  const points = buildRevenueSeries(orders, RANGE_DAYS);
  const maxValue = niceMax(Math.max(...points.map((p) => p.total), 0));
  const width = 900;
  const height = large ? 320 : 250;
  const padL = 68;
  const padR = 12;
  const padT = 24;
  const padB = 42;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const barW = Math.max(18, plotW / points.length - 18);
  const step = plotW / points.length;

  const areaPoints = points.map((point, index) => {
    const x = padL + step * index + step / 2;
    const y =
      padT + plotH - (maxValue > 0 ? (point.total / maxValue) * plotH : 0);
    return { x, y, ...point };
  });

  const areaPath =
    areaPoints.length === 0
      ? ""
      : [
          `M ${areaPoints[0].x} ${padT + plotH}`,
          ...areaPoints.map(
            (p, i) =>
              `${i === 0 ? "L" : "L"} ${p.x.toFixed(1)} ${Math.min(p.y + 20, padT + plotH - 4).toFixed(1)}`,
          ),
          `L ${areaPoints[areaPoints.length - 1].x} ${padT + plotH}`,
          "Z",
        ].join(" ");

  const yTicks = [maxValue, maxValue / 2, 0];
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <article className={`dash-panel${large ? " dash-panel--large" : ""}`}>
      <div className="dash-panel-header">
        <div className="dash-panel-heading">
          <div className="dash-panel-icon">
            <IconChartBars />
          </div>
          <div>
            <h2>Revenue · last 14 days</h2>
            <p>Doanh thu trong 14 ngày gần nhất</p>
          </div>
        </div>
        <span className="dash-range">
          14 ngày qua <span>⌄</span>
        </span>
      </div>
      <svg
        className={`dash-revenue-chart${large ? " dash-revenue-chart--large" : ""}`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Revenue last 14 days"
      >
        {yTicks.map((tick, index) => {
          const y = padT + (plotH * index) / 2;
          return (
            <g key={tick}>
              <line
                className={index === 2 ? "dash-axis" : "dash-gridline"}
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
              />
              <text x={padL - 12} y={y + 5} textAnchor="end">
                {money(tick, currency).replace(/\.00$/, "")}
              </text>
            </g>
          );
        })}
        <line
          className="dash-axis"
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + plotH}
        />
        {areaPath && <path className="dash-area" d={areaPath} />}
        {areaPoints.map((point) => {
          const h = maxValue > 0 ? (point.total / maxValue) * plotH : 0;
          if (point.total <= 0) return null;
          return (
            <rect
              key={point.key}
              className="dash-bar"
              x={point.x - barW / 2}
              y={padT + plotH - h}
              width={barW}
              height={Math.max(h, 2)}
              rx={4}
            >
              <title>
                {point.key}: {money(point.total, currency)}
              </title>
            </rect>
          );
        })}
        {areaPoints.map((point, index) =>
          index % labelEvery === 0 || index === areaPoints.length - 1 ? (
            <text
              key={`${point.key}-lbl`}
              x={point.x}
              y={height - 12}
              textAnchor="middle"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
    </article>
  );
}

function buildDashboardStats(orders: AdminOrderRow[]) {
  const today = startOfDay(new Date());
  const currentFrom = addDays(today, -(RANGE_DAYS - 1));
  const currentTo = addDays(today, 1);
  const prevFrom = addDays(currentFrom, -RANGE_DAYS);
  const prevTo = currentFrom;

  const current = orders.filter((o) => inRange(o, currentFrom, currentTo));
  const previous = orders.filter((o) => inRange(o, prevFrom, prevTo));
  const currency =
    current.find((o) => o.currency)?.currency ||
    orders.find((o) => o.currency)?.currency ||
    "USD";

  const totalOrders = current.length;
  const prevOrders = previous.length;
  const revenue = current.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0,
  );
  const prevRevenue = previous.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0,
  );
  const pending = current.filter(
    (o) => normalizeStatus(o.status) === "PENDING",
  ).length;
  const prevPending = previous.filter(
    (o) => normalizeStatus(o.status) === "PENDING",
  ).length;
  const paid = current.filter((o) => normalizeStatus(o.status) === "PAID")
    .length;
  const prevPaid = previous.filter(
    (o) => normalizeStatus(o.status) === "PAID",
  ).length;

  return {
    currency,
    rangeLabel: formatDatePill(currentFrom, today),
    current,
    metrics: {
      orders: { value: totalOrders, ...pctChange(totalOrders, prevOrders) },
      revenue: { value: revenue, ...pctChange(revenue, prevRevenue) },
      pending: { value: pending, ...pctChange(pending, prevPending) },
      paid: { value: paid, ...pctChange(paid, prevPaid) },
    },
  };
}

export function OrderOverviewCharts({ orders }: { orders: AdminOrderRow[] }) {
  const { currency, current, metrics } = buildDashboardStats(orders);

  return (
    <div className="dash-view">
      <div className="dash-metric-grid">
        <MetricCard
          title="TOTAL ORDERS"
          value={String(metrics.orders.value)}
          trendPct={metrics.orders.pct}
          icon={<IconOrders />}
        />
        <MetricCard
          tone="blue"
          title="REVENUE"
          value={money(metrics.revenue.value, currency)}
          trendPct={metrics.revenue.pct}
          icon={<IconRevenue />}
        />
        <MetricCard
          tone="amber"
          title="PENDING"
          value={String(metrics.pending.value)}
          trendPct={metrics.pending.pct}
          icon={<IconPending />}
        />
        <MetricCard
          tone="red"
          title="PAID"
          value={String(metrics.paid.value)}
          trendPct={metrics.paid.pct}
          icon={<IconPaid />}
        />
      </div>
      <div className="dash-panels">
        <StatusPanel orders={current} />
        <RevenuePanel orders={current} currency={currency} />
      </div>
    </div>
  );
}

export function OrderAnalyticsCharts({ orders }: { orders: AdminOrderRow[] }) {
  const { currency, current } = buildDashboardStats(orders);

  return (
    <div className="dash-view dash-view--charts">
      <div className="dash-panels">
        <StatusPanel orders={current} large />
        <RevenuePanel orders={current} currency={currency} large />
      </div>
    </div>
  );
}

export function getDashboardRangeLabel() {
  const today = startOfDay(new Date());
  const from = addDays(today, -(RANGE_DAYS - 1));
  return formatDatePill(from, today);
}

/** @deprecated use OrderOverviewCharts */
export function OrderCharts({ orders }: { orders: AdminOrderRow[] }) {
  return <OrderOverviewCharts orders={orders} />;
}
