import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiPut } from "../../lib/api";
import type { ComparePara, Product } from "../../types/product";
import { products as fallbackProducts } from "../../data/products";

interface AdminContentPanelProps {
  token: string;
  onAuthExpired: () => void;
}

type Draft = {
  id: string;
  name: string;
  price: string;
  twoBoxPrice: string;
  cardImage: string;
  ritualImage: string;
  compareImage: string;
  resultsImage: string;
  galleryText: string;
  storiesTitle: string;
  ritualTitle: string;
  compareTitle: string;
  benefitsTitle: string;
  compareStrong0: string;
  compareRest0: string;
  compareStrong1: string;
  compareRest1: string;
};

function moneyPreview(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function emptyContent(): Product["content"] {
  return {
    gallery: [],
    features: [],
    steps: [],
    stories: [],
    benefits: [],
    stats: [],
    miniReviews: [],
    accordions: [],
    faq: [],
  };
}

function mergeProduct(
  product: Product | undefined,
  fallback?: Product,
): Product {
  const base =
    fallback ||
    fallbackProducts.find((p) => p.id === product?.id) ||
    fallbackProducts[0];
  if (!product && base) return base;
  if (!product) {
    return {
      id: "",
      name: "",
      price: 0,
      twoBoxPrice: 0,
      rating: 0,
      reviews: 0,
      cardImage: "",
      storiesTitle: "",
      ritualImage: "",
      ritualTitle: "",
      compareImage: "",
      compareTitle: "",
      compareParas: [],
      benefitsTitle: "",
      resultsImage: "",
      content: emptyContent(),
    };
  }

  const price = Number(product.price);
  const twoBoxPrice = Number(product.twoBoxPrice);

  return {
    ...base,
    ...product,
    name: product.name || base?.name || product.id,
    price: Number.isFinite(price) && price > 0 ? price : base?.price || 1,
    twoBoxPrice:
      Number.isFinite(twoBoxPrice) && twoBoxPrice > 0
        ? twoBoxPrice
        : base?.twoBoxPrice || 2,
    content: {
      ...(base?.content || emptyContent()),
      ...(product.content || {}),
      gallery:
        Array.isArray(product.content?.gallery) && product.content.gallery.length
          ? product.content.gallery
          : base?.content?.gallery || [],
    },
  };
}

function toDraft(product: Product): Draft {
  const merged = mergeProduct(product);
  const paras = merged.compareParas || [];
  return {
    id: merged.id,
    name: merged.name || "",
    price: String(merged.price ?? ""),
    twoBoxPrice: String(merged.twoBoxPrice ?? ""),
    cardImage: merged.cardImage || "",
    ritualImage: merged.ritualImage || "",
    compareImage: merged.compareImage || "",
    resultsImage: merged.resultsImage || "",
    galleryText: (merged.content?.gallery || []).join("\n"),
    storiesTitle: merged.storiesTitle || "",
    ritualTitle: merged.ritualTitle || "",
    compareTitle: merged.compareTitle || "",
    benefitsTitle: merged.benefitsTitle || "",
    compareStrong0: paras[0]?.strong || "",
    compareRest0: paras[0]?.rest || "",
    compareStrong1: paras[1]?.strong || "",
    compareRest1: paras[1]?.rest || "",
  };
}

function buildCompareParas(draft: Draft): ComparePara[] {
  return [
    { strong: draft.compareStrong0.trim(), rest: draft.compareRest0 },
    { strong: draft.compareStrong1.trim(), rest: draft.compareRest1 },
  ].filter((p) => p.strong || p.rest.trim());
}

function mergeCatalog(remote: Product[], fallback: Product[]): Product[] {
  const byId = new Map<string, Product>();
  for (const product of fallback) {
    byId.set(product.id, product);
  }
  for (const row of remote) {
    if (!row?.id) continue;
    byId.set(
      row.id,
      mergeProduct(
        row,
        fallback.find((p) => p.id === row.id) || byId.get(row.id),
      ),
    );
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function AdminContentPanel({
  token,
  onAuthExpired,
}: AdminContentPanelProps) {
  const [catalog, setCatalog] = useState<Product[]>(fallbackProducts);
  const [selectedId, setSelectedId] = useState(fallbackProducts[0]?.id || "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");

  const selected = useMemo(
    () => catalog.find((p) => p.id === selectedId) || catalog[0],
    [catalog, selectedId],
  );

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const rows = await apiGet<Product[]>("/api/products");
      const next = mergeCatalog(
        Array.isArray(rows) ? rows : [],
        fallbackProducts,
      );
      setCatalog(next);
      const id =
        selectedId && next.some((p) => p.id === selectedId)
          ? selectedId
          : next[0]?.id || "";
      setSelectedId(id);
      const product = next.find((p) => p.id === id) || next[0];
      if (product) setDraft(toDraft(product));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load products.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        onAuthExpired();
        return;
      }
      setCatalog(fallbackProducts);
      setDraft(toDraft(fallbackProducts[0]));
      setSelectedId(fallbackProducts[0]?.id || "");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (selected) setDraft(toDraft(selected));
  }, [selected]);

  const updateField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSavedAt("");
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !selected) return;
    setIsSaving(true);
    setError("");
    setSavedAt("");
    try {
      const gallery = draft.galleryText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const price = Number(draft.price);
      const twoBoxPrice = Number(draft.twoBoxPrice);
      if (!(price > 0)) {
        throw new Error("Giá 1 hộp phải lớn hơn 0.");
      }
      if (!(twoBoxPrice > 0)) {
        throw new Error("Giá 2 hộp phải lớn hơn 0.");
      }

      const payload: Product = {
        ...selected,
        id: draft.id,
        name: draft.name.trim(),
        price: Math.round(price * 100) / 100,
        twoBoxPrice: Math.round(twoBoxPrice * 100) / 100,
        cardImage: draft.cardImage.trim(),
        ritualImage: draft.ritualImage.trim(),
        compareImage: draft.compareImage.trim(),
        resultsImage: draft.resultsImage.trim(),
        storiesTitle: draft.storiesTitle.trim(),
        ritualTitle: draft.ritualTitle.trim(),
        compareTitle: draft.compareTitle.trim(),
        benefitsTitle: draft.benefitsTitle.trim(),
        compareParas: buildCompareParas(draft),
        content: {
          ...selected.content,
          gallery,
        },
      };

      const result = await apiPut<{ status: string; product: Product }>(
        `/api/admin/products/${encodeURIComponent(draft.id)}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const saved = mergeProduct(result.product || payload, selected);
      setCatalog((prev) => {
        const others = prev.filter((p) => p.id !== saved.id);
        return [...others, saved].sort((a, b) => a.id.localeCompare(b.id));
      });
      setDraft(toDraft(saved));
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to save product.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        onAuthExpired();
        return;
      }
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !draft) {
    return (
      <div className="admin-content">
        <p className="admin-note">Loading content…</p>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <div className="admin-content-toolbar">
        <div className="admin-content-picker" role="listbox" aria-label="Sản phẩm">
          {catalog.map((product) => (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={selectedId === product.id}
              className={`admin-content-pick${selectedId === product.id ? " is-active" : ""}`}
              onClick={() => setSelectedId(product.id)}
            >
              <img src={product.cardImage} alt="" />
              <span>
                <strong>{product.name}</strong>
                <em>{product.id}</em>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="admin-secondary"
          onClick={() => void load()}
        >
          Reload
        </button>
      </div>
      <p className="admin-note">
        Đang quản trị {catalog.length} sản phẩm — chọn thẻ bên trên để sửa.
      </p>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {savedAt && (
        <p className="admin-save-ok">
          Đã lưu lúc {savedAt}. Storefront sẽ lấy bản mới qua API.
        </p>
      )}

      <form className="admin-content-form" onSubmit={handleSave}>
        <section className="admin-content-card admin-content-card--price">
          <h2>Giá bán</h2>
          <label>
            Tên sản phẩm
            <input
              value={draft.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
            />
          </label>
          <div className="admin-content-row">
            <label>
              Giá 1 hộp (USD) *
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={draft.price}
                onChange={(e) => updateField("price", e.target.value)}
                required
              />
              <span className="admin-price-preview is-sale">
                {moneyPreview(draft.price)}
              </span>
            </label>
            <label>
              Giá 2 hộp (USD) *
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={draft.twoBoxPrice}
                onChange={(e) => updateField("twoBoxPrice", e.target.value)}
                required
              />
              <span className="admin-price-preview is-sale">
                {moneyPreview(draft.twoBoxPrice)}
              </span>
            </label>
          </div>
        </section>

        <section className="admin-content-card">
          <h2>Ảnh (URL / path)</h2>
          <p className="admin-note">
            Ví dụ: <code>/assets/images/tra-moc-tam-hero.png</code> hoặc URL
            tuyệt đối.
          </p>
          {(
            [
              ["cardImage", "Ảnh card / shop"],
              ["ritualImage", "Ảnh ritual"],
              ["compareImage", "Ảnh compare"],
              ["resultsImage", "Ảnh results"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={draft[key]}
                onChange={(e) => updateField(key, e.target.value)}
              />
              {draft[key] && (
                <img
                  className="admin-content-thumb"
                  src={draft[key]}
                  alt=""
                />
              )}
            </label>
          ))}
          <label>
            Gallery (mỗi URL một dòng)
            <textarea
              rows={5}
              value={draft.galleryText}
              onChange={(e) => updateField("galleryText", e.target.value)}
            />
          </label>
        </section>

        <section className="admin-content-card">
          <h2>Nội dung chính</h2>
          <label>
            Stories title
            <input
              value={draft.storiesTitle}
              onChange={(e) => updateField("storiesTitle", e.target.value)}
            />
          </label>
          <label>
            Ritual title
            <input
              value={draft.ritualTitle}
              onChange={(e) => updateField("ritualTitle", e.target.value)}
            />
          </label>
          <label>
            Compare title
            <input
              value={draft.compareTitle}
              onChange={(e) => updateField("compareTitle", e.target.value)}
            />
          </label>
          <label>
            Benefits title
            <input
              value={draft.benefitsTitle}
              onChange={(e) => updateField("benefitsTitle", e.target.value)}
            />
          </label>
          <div className="admin-content-row">
            <label>
              Compare 1 · strong
              <input
                value={draft.compareStrong0}
                onChange={(e) => updateField("compareStrong0", e.target.value)}
              />
            </label>
            <label>
              Compare 1 · rest
              <input
                value={draft.compareRest0}
                onChange={(e) => updateField("compareRest0", e.target.value)}
              />
            </label>
          </div>
          <div className="admin-content-row">
            <label>
              Compare 2 · strong
              <input
                value={draft.compareStrong1}
                onChange={(e) => updateField("compareStrong1", e.target.value)}
              />
            </label>
            <label>
              Compare 2 · rest
              <input
                value={draft.compareRest1}
                onChange={(e) => updateField("compareRest1", e.target.value)}
              />
            </label>
          </div>
        </section>

        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save product"}
        </button>
      </form>
    </div>
  );
}
