import type { ReactNode } from "react";

export interface AdminFeedbackRow {
  id: string;
  topic: string;
  content: string;
  created_at?: string | null;
}

const TOPIC_COLORS = [
  "#08814a",
  "#f59e0b",
  "#2563eb",
  "#7c3aed",
  "#dc2626",
  "#0d9488",
  "#ca8a04",
  "#64748b",
];

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

function truncate(text: string, max = 120) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildTopicCounts(rows: AdminFeedbackRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const topic = String(row.topic || "Khác").trim() || "Khác";
    map.set(topic, (map.get(topic) || 0) + 1);
  }
  return [...map.entries()]
    .map(([topic, count], index) => ({
      topic,
      count,
      color: TOPIC_COLORS[index % TOPIC_COLORS.length],
    }))
    .sort((a, b) => b.count - a.count)
    .map((item, index) => ({
      ...item,
      color: TOPIC_COLORS[index % TOPIC_COLORS.length],
    }));
}

function buildDailyCounts(rows: AdminFeedbackRow[], days = 14) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    keys.push(dayKey(d));
  }
  const totals = new Map(keys.map((key) => [key, 0]));
  for (const row of rows) {
    if (!row.created_at) continue;
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const key = dayKey(created);
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  return keys.map((key) => ({
    key,
    label: shortLabel(key),
    total: totals.get(key) || 0,
  }));
}

function countLastDays(rows: AdminFeedbackRow[], days: number) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return rows.filter((row) => {
    if (!row.created_at) return false;
    const created = new Date(row.created_at);
    return !Number.isNaN(created.getTime()) && created >= cutoff;
  }).length;
}

function IconFeedback() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M6 8h36v24H18l-12 10V8zm6 8h24v4H12zm0 8h16v4H12z" />
    </svg>
  );
}

function IconTopics() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 10h32v6H8zm0 11h24v6H8zm0 11h28v6H8z" />
    </svg>
  );
}

function IconWeek() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 10h32v30H8zm6 8h20v4H14zm0 8h20v4H14zm0 8h12v4H14z" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="m24 4 5.6 14.4L44 20l-11 9.4L36.4 44 24 35.8 11.6 44 15 29.4 4 20l14.4-1.6z" />
    </svg>
  );
}

function MetricCard({
  tone,
  title,
  value,
  icon,
}: {
  tone?: "blue" | "amber" | "red";
  title: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <article className={`dash-metric${tone ? ` ${tone}` : ""}`}>
      <div className="dash-metric-icon">{icon}</div>
      <div className="dash-metric-main">
        <div className="dash-metric-title">{title}</div>
        <div className="dash-metric-value">{value}</div>
      </div>
    </article>
  );
}

function TopicPanel({
  items,
}: {
  items: { topic: string; count: number; color: string }[];
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const gradient =
    total === 0
      ? "#e8eef1"
      : items
          .filter((row) => row.count > 0)
          .reduce((acc, row, index, list) => {
            const start = list
              .slice(0, index)
              .reduce((sum, item) => sum + (item.count / total) * 100, 0);
            const end = start + (row.count / total) * 100;
            return `${acc}${index ? ", " : ""}${row.color} ${start}% ${end}%`;
          }, "");

  return (
    <article className="dash-panel">
      <div className="dash-panel-header">
        <div className="dash-panel-heading">
          <div className="dash-panel-icon">
            <IconTopics />
          </div>
          <div>
            <h2>Theo hạng mục</h2>
            <p>Số feedback theo topic</p>
          </div>
        </div>
        <span className="dash-range">Tất cả</span>
      </div>
      {total === 0 ? (
        <p className="dash-empty">Chưa có feedback theo hạng mục.</p>
      ) : (
        <div className="dash-status-content">
          <div
            className="dash-donut"
            style={{
              background: `conic-gradient(${gradient || "#e8eef1"} 0 100%)`,
            }}
            role="img"
            aria-label={`${total} feedbacks by topic`}
          >
            <div className="dash-donut-label">
              <strong>{total}</strong>
              <span>feedback</span>
            </div>
          </div>
          <div className="dash-legend">
            {items.map((item) => {
              const pct = Math.round((item.count / total) * 100);
              return (
                <div className="dash-legend-row" key={item.topic}>
                  <i
                    className="dash-dot"
                    style={{ background: item.color }}
                    aria-hidden
                  />
                  <span>{item.topic}</span>
                  <b>{item.count}</b>
                  <span className="dash-pct">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

function DailyPanel({
  points,
}: {
  points: { key: string; label: string; total: number }[];
}) {
  const max = Math.max(...points.map((p) => p.total), 0);
  const width = 560;
  const height = 220;
  const padL = 28;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const gap = 4;
  const barW = (innerW - gap * (points.length - 1)) / points.length;

  return (
    <article className="dash-panel">
      <div className="dash-panel-header">
        <div className="dash-panel-heading">
          <div className="dash-panel-icon">
            <IconWeek />
          </div>
          <div>
            <h2>Theo ngày</h2>
            <p>Feedback 14 ngày gần nhất</p>
          </div>
        </div>
        <span className="dash-range">14 ngày</span>
      </div>
      {max <= 0 ? (
        <p className="dash-empty">Chưa có feedback trong 14 ngày.</p>
      ) : (
        <svg
          className="dash-revenue-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Feedback by day"
        >
          {[0, 0.5, 1].map((ratio) => {
            const y = padT + innerH * (1 - ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padL}
                  x2={width - padR}
                  y1={y}
                  y2={y}
                  stroke="#e4eadf"
                  strokeWidth={1}
                />
                <text x={padL - 6} y={y + 3} textAnchor="end" fill="#677486" fontSize="11">
                  {Math.round(max * ratio)}
                </text>
              </g>
            );
          })}
          {points.map((point, index) => {
            const h = max > 0 ? (point.total / max) * innerH : 0;
            const x = padL + index * (barW + gap);
            const y = padT + innerH - h;
            return (
              <g key={point.key}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, point.total > 0 ? 2 : 0)}
                  rx={3}
                  fill="#08814a"
                >
                  <title>
                    {point.key}: {point.total}
                  </title>
                </rect>
                {index % 2 === 0 && (
                  <text
                    x={x + barW / 2}
                    y={height - 8}
                    textAnchor="middle"
                    fill="#677486"
                    fontSize="11"
                  >
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </article>
  );
}

export function FeedbackCharts({
  feedbacks,
  isLoading,
}: {
  feedbacks: AdminFeedbackRow[];
  isLoading?: boolean;
}) {
  const topics = buildTopicCounts(feedbacks);
  const daily = buildDailyCounts(feedbacks, 14);
  const last7 = countLastDays(feedbacks, 7);

  return (
    <div className="dash-view">
      <div className="dash-metric-grid">
        <MetricCard
          title="TỔNG GÓP Ý"
          value={String(feedbacks.length)}
          icon={<IconFeedback />}
        />
        <MetricCard
          tone="blue"
          title="HẠNG MỤC"
          value={String(topics.length)}
          icon={<IconTopics />}
        />
        <MetricCard
          tone="amber"
          title="7 NGÀY"
          value={String(last7)}
          icon={<IconWeek />}
        />
        <MetricCard
          tone="red"
          title="TOPIC TOP"
          value={topics[0]?.topic || "—"}
          icon={<IconStar />}
        />
      </div>

      <div className="dash-panels">
        <TopicPanel items={topics} />
        <DailyPanel points={daily} />
      </div>

      <h2 className="admin-section-title">Góp ý gần đây</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Hạng mục</th>
              <th>Nội dung</th>
            </tr>
          </thead>
          <tbody>
            {feedbacks.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={3}>Chưa có góp ý.</td>
              </tr>
            ) : (
              feedbacks.slice(0, 50).map((row) => (
                <tr key={row.id}>
                  <td>{formatWhen(row.created_at)}</td>
                  <td>{row.topic || "—"}</td>
                  <td title={row.content}>{truncate(row.content)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
