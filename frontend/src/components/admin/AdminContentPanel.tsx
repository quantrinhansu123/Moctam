import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiPut } from "../../lib/api";
import type { ComparePara, Product } from "../../types/product";
import { products as fallbackProducts } from "../../data/products";
import { useSiteSettings, type SiteSettings } from "../../lib/siteSettings";
import { useProductCatalog } from "../../products/ProductProvider";

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
  content: Product["content"];
};

/** Accept "9.96", "9,96", "1.234,56" so VN locale input does not corrupt price. */
function parseMoney(raw: string): number {
  let cleaned = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === ",") return NaN;

  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    cleaned = cleaned.replace(",", ".");
  }

  return Number(cleaned);
}

function formatMoneyInput(value: number | string | null | undefined): string {
  const amount =
    typeof value === "number" ? value : parseMoney(String(value ?? ""));
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return (Math.round(amount * 100) / 100).toFixed(2);
}

function moneyPreview(value: string) {
  const amount = parseMoney(value);
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

  const price = parseMoney(String(product.price ?? ""));
  const twoBoxPrice = parseMoney(String(product.twoBoxPrice ?? ""));

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
    price: formatMoneyInput(merged.price),
    twoBoxPrice: formatMoneyInput(merged.twoBoxPrice),
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
    content: structuredClone(merged.content || emptyContent()),
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
  const { reload: reloadSiteSettings } = useSiteSettings();
  const { reload: reloadProducts } = useProductCatalog();
  const [catalog, setCatalog] = useState<Product[]>(fallbackProducts);
  const [selectedId, setSelectedId] = useState(fallbackProducts[0]?.id || "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingSection, setSavingSection] = useState("");
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [savedSection, setSavedSection] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<SiteSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSavingSection, setSettingsSavingSection] = useState("");

  const selected = useMemo(
    () => catalog.find((p) => p.id === selectedId) || catalog[0],
    [catalog, selectedId],
  );

  const applyCatalog = (rows: Product[], preferredId?: string) => {
    const next = mergeCatalog(
      Array.isArray(rows) ? rows : [],
      fallbackProducts,
    );
    setCatalog(next);
    const id =
      (preferredId && next.some((p) => p.id === preferredId) && preferredId) ||
      (selectedId && next.some((p) => p.id === selectedId) && selectedId) ||
      next[0]?.id ||
      "";
    setSelectedId(id);
    const product = next.find((p) => p.id === id) || next[0];
    if (product) setDraft(toDraft(product));
    return next;
  };

  const load = async () => {
    setIsLoading(true);
    setError("");
    const errors: string[] = [];

    try {
      const rows = await apiGet<Product[]>("/api/products");
      applyCatalog(Array.isArray(rows) ? rows : []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không tải được sản phẩm.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        onAuthExpired();
        setHasLoaded(true);
        setIsLoading(false);
        return;
      }
      if (!draft) applyCatalog([], selectedId);
      errors.push(message);
    }

    try {
      const siteSettings = await apiGet<SiteSettings>("/api/settings");
      setSettingsDraft(siteSettings);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không tải được nội dung trang.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        onAuthExpired();
        setHasLoaded(true);
        setIsLoading(false);
        return;
      }
      errors.push(message);
    }

    if (errors.length) setError(errors.join(" · "));
    setHasLoaded(true);
    setIsLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const updateField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSavedAt("");
    setSavedSection("");
  };

  const updateListItem = (
    key: keyof Product["content"],
    index: number,
    field: string,
    value: string,
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const list = [
        ...(prev.content[key] as unknown as Record<string, unknown>[]),
      ];
      list[index] = {
        ...list[index],
        [field]: field === "image" && !value ? null : value,
      };
      return { ...prev, content: { ...prev.content, [key]: list } };
    });
    setSavedAt("");
    setSavedSection("");
  };

  const addListItem = (
    key: keyof Product["content"],
    item: Record<string, unknown>,
  ) =>
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            content: {
              ...prev.content,
              [key]: [...(prev.content[key] as unknown[]), item],
            },
          }
        : prev,
    );

  const removeListItem = (key: keyof Product["content"], index: number) =>
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            content: {
              ...prev.content,
              [key]: (prev.content[key] as unknown[]).filter(
                (_, i) => i !== index,
              ),
            },
          }
        : prev,
    );

  const saveProduct = async (section = "product") => {
    if (!draft || !selected) return;
    setIsSaving(true);
    setSavingSection(section);
    setError("");
    setSavedAt("");
    setSavedSection("");
    try {
      const gallery = draft.galleryText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const price = parseMoney(draft.price);
      const twoBoxPrice = parseMoney(draft.twoBoxPrice);
      if (!(price > 0)) {
        throw new Error(
          "Giá 1 hộp không hợp lệ — dùng dấu chấm hoặc phẩy (vd 9.96).",
        );
      }
      if (!(twoBoxPrice > 0)) {
        throw new Error(
          "Giá 2 hộp không hợp lệ — dùng dấu chấm hoặc phẩy (vd 19.90).",
        );
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
          features: draft.content.features,
          steps: draft.content.steps,
          stories: draft.content.stories,
          benefits: draft.content.benefits,
          stats: draft.content.stats,
          miniReviews: draft.content.miniReviews,
          accordions: draft.content.accordions,
          faq: draft.content.faq,
        },
      };

      const result = await apiPut<{ status: string; product: Product }>(
        `/api/admin/products/${encodeURIComponent(draft.id)}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const saved = mergeProduct(result.product || payload, payload);
      applyCatalog(
        [...catalog.filter((p) => p.id !== saved.id), saved],
        saved.id,
      );
      setDraft(toDraft(saved));
      setSavedAt(new Date().toLocaleTimeString());
      setSavedSection(section);

      try {
        const rows = await apiGet<Product[]>("/api/products");
        if (Array.isArray(rows) && rows.length) {
          applyCatalog(rows, saved.id);
        }
      } catch (reloadError) {
        console.warn("[admin] saved OK but refresh failed:", reloadError);
      }
      try {
        await reloadProducts();
      } catch (reloadError) {
        console.warn(
          "[admin] product saved but storefront reload failed:",
          reloadError,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không lưu được sản phẩm.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        onAuthExpired();
        return;
      }
      setError(message);
    } finally {
      setIsSaving(false);
      setSavingSection("");
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    await saveProduct("toàn bộ");
  };

  const saveSettings = async (section = "site") => {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    setSettingsSavingSection(section);
    setError("");
    try {
      const result = await apiPut<{ settings: SiteSettings }>(
        "/api/admin/settings",
        settingsDraft,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSettingsDraft(result.settings || settingsDraft);
      setSavedAt(new Date().toLocaleTimeString());
      setSavedSection(section);
      try {
        setSettingsDraft(await apiGet<SiteSettings>("/api/settings"));
      } catch (reloadError) {
        console.warn("[admin] settings saved but refresh failed:", reloadError);
      }
      try {
        await reloadSiteSettings();
      } catch (reloadError) {
        console.warn(
          "[admin] settings saved but storefront reload failed:",
          reloadError,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không lưu được nội dung trang.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) {
        onAuthExpired();
      } else {
        setError(message);
      }
    } finally {
      setSettingsSaving(false);
      setSettingsSavingSection("");
    }
  };

  const SectionSave = ({
    section,
    label,
  }: {
    section: string;
    label: string;
  }) => (
    <button
      type="button"
      className="admin-content-save"
      disabled={isSaving}
      onClick={() => void saveProduct(section)}
    >
      {isSaving && savingSection === section ? "Đang lưu…" : label}
    </button>
  );

  const SettingsSave = ({
    section,
    label,
  }: {
    section: string;
    label: string;
  }) => (
    <button
      type="button"
      className="admin-content-save"
      disabled={settingsSaving}
      onClick={() => void saveSettings(section)}
    >
      {settingsSaving && settingsSavingSection === section
        ? "Đang lưu…"
        : label}
    </button>
  );

  const ListEditor = ({
    title,
    field,
    fields,
    blank,
  }: {
    title: string;
    field: keyof Product["content"];
    fields: [string, string][];
    blank: Record<string, unknown>;
  }) => (
    <section className="admin-content-card">
      <h2>{title}</h2>
      {(
        (draft?.content[field] || []) as unknown as Record<string, unknown>[]
      ).map((item, index) => (
        <div className="admin-list-item" key={`${field}-${index}`}>
          <strong>
            {title} {index + 1}
          </strong>
          <div className="admin-content-row">
            {fields.map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  value={String(item[name] ?? "")}
                  onChange={(e) =>
                    updateListItem(field, index, name, e.target.value)
                  }
                />
              </label>
            ))}
          </div>
          <button
            className="admin-secondary"
            type="button"
            onClick={() => removeListItem(field, index)}
          >
            Xóa
          </button>
        </div>
      ))}
      <div className="admin-content-actions">
        <button
          className="admin-secondary"
          type="button"
          onClick={() => addListItem(field, blank)}
        >
          + Thêm mục
        </button>
        <SectionSave section={field} label={`Lưu ${title}`} />
      </div>
    </section>
  );

  if (!hasLoaded && (isLoading || !draft)) {
    return (
      <div className="admin-content">
        <p className="admin-note">Đang tải nội dung…</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="admin-content">
        <p className="admin-error">Không tải được sản phẩm.</p>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <div className="admin-content-toolbar">
        <div
          className="admin-content-picker"
          role="listbox"
          aria-label="Sản phẩm"
        >
          {catalog.map((product) => (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={selectedId === product.id}
              className={`admin-content-pick${selectedId === product.id ? " is-active" : ""}`}
              onClick={() => {
                setSelectedId(product.id);
                setDraft(toDraft(product));
                setSavedAt("");
                setSavedSection("");
              }}
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
          Tải lại
        </button>
      </div>
      <p className="admin-note">
        Đang quản trị {catalog.length} sản phẩm — chọn thẻ bên trên để sửa.
        {isLoading ? " · Đang tải lại…" : ""}
      </p>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {savedAt && (
        <p className="admin-save-ok">
          Đã lưu{savedSection ? ` “${savedSection}”` : ""} lúc {savedAt}.
          Giá/nội dung trên trang bán đã cập nhật — bấm “Về trang bán” để xem.
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
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="9.96"
                value={draft.price}
                onChange={(e) => updateField("price", e.target.value)}
                onBlur={() =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          price: formatMoneyInput(prev.price) || prev.price,
                        }
                      : prev,
                  )
                }
                required
              />
              <span className="admin-price-preview is-sale">
                {moneyPreview(draft.price)}
              </span>
            </label>
            <label>
              Giá 2 hộp (USD) *
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="19.90"
                value={draft.twoBoxPrice}
                onChange={(e) => updateField("twoBoxPrice", e.target.value)}
                onBlur={() =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          twoBoxPrice:
                            formatMoneyInput(prev.twoBoxPrice) ||
                            prev.twoBoxPrice,
                        }
                      : prev,
                  )
                }
                required
              />
              <span className="admin-price-preview is-sale">
                {moneyPreview(draft.twoBoxPrice)}
              </span>
            </label>
          </div>
          <SectionSave section="giá" label="Lưu giá" />
        </section>

        <section className="admin-content-card">
          <h2>Ảnh (URL / path)</h2>
          <p className="admin-note">
            Ví dụ: <code>/assets/images/tra-moc-tam-hero.png</code> hoặc URL
            tuyệt đối.
          </p>
          <div className="admin-content-row admin-content-row--images">
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
          </div>
          <label>
            Thư viện ảnh (mỗi URL một dòng)
            <textarea
              rows={5}
              value={draft.galleryText}
              onChange={(e) => updateField("galleryText", e.target.value)}
            />
          </label>
          <SectionSave section="ảnh" label="Lưu ảnh" />
        </section>

        <section className="admin-content-card">
          <h2>Nội dung chính</h2>
          <div className="admin-content-row">
            <label>
              Tiêu đề Stories
              <input
                value={draft.storiesTitle}
                onChange={(e) => updateField("storiesTitle", e.target.value)}
              />
            </label>
            <label>
              Tiêu đề Ritual
              <input
                value={draft.ritualTitle}
                onChange={(e) => updateField("ritualTitle", e.target.value)}
              />
            </label>
            <label>
              Tiêu đề so sánh
              <input
                value={draft.compareTitle}
                onChange={(e) => updateField("compareTitle", e.target.value)}
              />
            </label>
            <label>
              Tiêu đề lợi ích
              <input
                value={draft.benefitsTitle}
                onChange={(e) => updateField("benefitsTitle", e.target.value)}
              />
            </label>
          </div>
          <div className="admin-content-row">
            <label>
              So sánh 1 · in đậm
              <input
                value={draft.compareStrong0}
                onChange={(e) => updateField("compareStrong0", e.target.value)}
              />
            </label>
            <label>
              So sánh 1 · phần còn lại
              <input
                value={draft.compareRest0}
                onChange={(e) => updateField("compareRest0", e.target.value)}
              />
            </label>
          </div>
          <div className="admin-content-row">
            <label>
              So sánh 2 · in đậm
              <input
                value={draft.compareStrong1}
                onChange={(e) => updateField("compareStrong1", e.target.value)}
              />
            </label>
            <label>
              So sánh 2 · phần còn lại
              <input
                value={draft.compareRest1}
                onChange={(e) => updateField("compareRest1", e.target.value)}
              />
            </label>
          </div>
          <SectionSave section="nội dung chính" label="Lưu nội dung chính" />
        </section>

        <div className="admin-content-row admin-content-row--cards">
          <ListEditor
            title="Tính năng"
            field="features"
            fields={[
              ["glyph", "Biểu tượng"],
              ["title", "Tiêu đề"],
              ["desc", "Mô tả"],
            ]}
            blank={{ glyph: "flower", title: "", desc: "" }}
          />
          <ListEditor
            title="Các bước"
            field="steps"
            fields={[
              ["title", "Tiêu đề"],
              ["body", "Mô tả"],
            ]}
            blank={{ title: "", body: "" }}
          />
          <ListEditor
            title="Câu chuyện"
            field="stories"
            fields={[
              ["image", "URL ảnh (tuỳ chọn)"],
              ["title", "Tiêu đề"],
              ["body", "Nội dung"],
              ["author", "Tác giả"],
            ]}
            blank={{ image: null, title: "", body: "", author: "" }}
          />
          <ListEditor
            title="Lợi ích"
            field="benefits"
            fields={[
              ["glyph", "Biểu tượng"],
              ["title", "Tiêu đề"],
              ["body", "Mô tả"],
            ]}
            blank={{ glyph: "flower", title: "", body: "" }}
          />
          <ListEditor
            title="Số liệu"
            field="stats"
            fields={[
              ["num", "Số"],
              ["body", "Mô tả"],
            ]}
            blank={{ num: "", body: "" }}
          />
          <ListEditor
            title="Đánh giá ngắn"
            field="miniReviews"
            fields={[
              ["image", "URL ảnh"],
              ["quote", "Trích dẫn"],
              ["name", "Tên"],
            ]}
            blank={{ image: "", quote: "", name: "" }}
          />
          <ListEditor
            title="Accordion"
            field="accordions"
            fields={[
              ["glyph", "Biểu tượng"],
              ["title", "Tiêu đề"],
              ["body", "Nội dung"],
            ]}
            blank={{ glyph: "ritual", title: "", body: "" }}
          />
          <ListEditor
            title="Câu hỏi thường gặp"
            field="faq"
            fields={[
              ["glyph", "Biểu tượng"],
              ["title", "Câu hỏi"],
              ["body", "Trả lời"],
            ]}
            blank={{ glyph: "flower", title: "", body: "" }}
          />
        </div>

        <SectionSave section="toàn bộ" label="Lưu toàn bộ sản phẩm" />
      </form>

      {settingsDraft && (
        <>
          <section className="admin-content-card">
            <h2>Trang chủ · Hero</h2>
            <p className="admin-note">
              Ảnh slide và chữ hero trên trang bán.
            </p>
            <h3>Slide hero</h3>
            {settingsDraft.heroSlides.map((slide, index) => (
              <div className="admin-list-item" key={`slide-${index}`}>
                <div className="admin-content-row">
                  <label>
                    URL ảnh
                    <input
                      value={slide.image}
                      onChange={(e) =>
                        setSettingsDraft(
                          (s) =>
                            s && {
                              ...s,
                              heroSlides: s.heroSlides.map((x, i) =>
                                i === index
                                  ? { ...x, image: e.target.value }
                                  : x,
                              ),
                            },
                        )
                      }
                    />
                  </label>
                  <label>
                    Chữ thay thế (alt)
                    <input
                      value={slide.alt}
                      onChange={(e) =>
                        setSettingsDraft(
                          (s) =>
                            s && {
                              ...s,
                              heroSlides: s.heroSlides.map((x, i) =>
                                i === index ? { ...x, alt: e.target.value } : x,
                              ),
                            },
                        )
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="admin-secondary"
                  onClick={() =>
                    setSettingsDraft(
                      (s) =>
                        s && {
                          ...s,
                          heroSlides: s.heroSlides.filter((_, i) => i !== index),
                        },
                    )
                  }
                >
                  Xóa
                </button>
              </div>
            ))}
            <button
              type="button"
              className="admin-secondary"
              onClick={() =>
                setSettingsDraft(
                  (s) =>
                    s && {
                      ...s,
                      heroSlides: [...s.heroSlides, { image: "", alt: "" }],
                    },
                )
              }
            >
              + Thêm slide
            </button>
            <div className="admin-content-row">
              {(
                [
                  ["eyebrow", "Hero · dòng nhỏ"],
                  ["title", "Hero · tiêu đề"],
                  ["description", "Hero · mô tả"],
                  ["actionLabel", "Hero · nút CTA"],
                  ["actionHref", "Hero · link CTA"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={settingsDraft.hero[key]}
                    onChange={(e) =>
                      setSettingsDraft(
                        (s) =>
                          s && {
                            ...s,
                            hero: { ...s.hero, [key]: e.target.value },
                          },
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <SettingsSave section="hero" label="Lưu hero" />
          </section>

          <section className="admin-content-card">
            <h2>Thanh thông báo</h2>
            {settingsDraft.announcementBar.map((item, index) => (
              <div className="admin-list-item" key={`announcement-${index}`}>
                <div className="admin-content-row">
                  <label>
                    Biểu tượng
                    <input
                      value={item.glyph}
                      onChange={(e) =>
                        setSettingsDraft(
                          (s) =>
                            s && {
                              ...s,
                              announcementBar: s.announcementBar.map((x, i) =>
                                i === index
                                  ? { ...x, glyph: e.target.value }
                                  : x,
                              ),
                            },
                        )
                      }
                    />
                  </label>
                  <label>
                    Nội dung
                    <input
                      value={item.text}
                      onChange={(e) =>
                        setSettingsDraft(
                          (s) =>
                            s && {
                              ...s,
                              announcementBar: s.announcementBar.map((x, i) =>
                                i === index
                                  ? { ...x, text: e.target.value }
                                  : x,
                              ),
                            },
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={item.enabled !== false}
                    onChange={(e) =>
                      setSettingsDraft(
                        (s) =>
                          s && {
                            ...s,
                            announcementBar: s.announcementBar.map((x, i) =>
                              i === index
                                ? { ...x, enabled: e.target.checked }
                                : x,
                            ),
                          },
                      )
                    }
                  />{" "}
                  Bật
                </label>
                <button
                  type="button"
                  className="admin-secondary"
                  onClick={() =>
                    setSettingsDraft(
                      (s) =>
                        s && {
                          ...s,
                          announcementBar: s.announcementBar.filter(
                            (_, i) => i !== index,
                          ),
                        },
                    )
                  }
                >
                  Xóa
                </button>
              </div>
            ))}
            <div className="admin-content-actions">
              <button
                type="button"
                className="admin-secondary"
                onClick={() =>
                  setSettingsDraft(
                    (s) =>
                      s && {
                        ...s,
                        announcementBar: [
                          ...s.announcementBar,
                          { glyph: "redeem", text: "", enabled: true },
                        ],
                      },
                  )
                }
              >
                + Thêm thông báo
              </button>
              <SettingsSave section="announcement" label="Lưu thông báo" />
            </div>
          </section>

          <section className="admin-content-card">
            <h2>Footer</h2>
            <div className="admin-content-row">
              {(
                [
                  ["logo", "Footer · logo"],
                  ["brand", "Footer · thương hiệu"],
                  ["description", "Footer · mô tả"],
                  ["taxId", "Footer · mã số thuế"],
                  ["address", "Footer · địa chỉ"],
                  ["hours", "Footer · giờ mở cửa"],
                  ["copyright", "Footer · bản quyền"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={String(settingsDraft.footer[key] || "")}
                    onChange={(e) =>
                      setSettingsDraft(
                        (s) =>
                          s && {
                            ...s,
                            footer: { ...s.footer, [key]: e.target.value },
                          },
                      )
                    }
                  />
                </label>
              ))}
            </div>
            {(
              [
                ["quickLinks", "Footer · liên kết nhanh"],
                ["careLinks", "Footer · chăm sóc"],
              ] as const
            ).map(([key, heading]) => (
              <div key={key}>
                <h3>{heading}</h3>
                {(
                  (settingsDraft.footer[key] || []) as {
                    label: string;
                    target?: string;
                    productId?: string;
                  }[]
                ).map((link, index) => (
                  <div className="admin-list-item" key={`${key}-${index}`}>
                    <div className="admin-content-row">
                      <label>
                        Nhãn
                        <input
                          value={link.label}
                          onChange={(e) =>
                            setSettingsDraft((s) => {
                              if (!s) return s;
                              const links = [
                                ...((s.footer[key] || []) as typeof link[]),
                              ];
                              links[index] = {
                                ...links[index],
                                label: e.target.value,
                              };
                              return {
                                ...s,
                                footer: { ...s.footer, [key]: links },
                              };
                            })
                          }
                        />
                      </label>
                      <label>
                        Trang đích
                        <input
                          value={link.target || ""}
                          onChange={(e) =>
                            setSettingsDraft((s) => {
                              if (!s) return s;
                              const links = [
                                ...((s.footer[key] || []) as typeof link[]),
                              ];
                              links[index] = {
                                ...links[index],
                                target: e.target.value,
                                productId: "",
                              };
                              return {
                                ...s,
                                footer: { ...s.footer, [key]: links },
                              };
                            })
                          }
                        />
                      </label>
                      <label>
                        Mã sản phẩm (tuỳ chọn)
                        <input
                          value={link.productId || ""}
                          onChange={(e) =>
                            setSettingsDraft((s) => {
                              if (!s) return s;
                              const links = [
                                ...((s.footer[key] || []) as typeof link[]),
                              ];
                              links[index] = {
                                ...links[index],
                                productId: e.target.value,
                              };
                              return {
                                ...s,
                                footer: { ...s.footer, [key]: links },
                              };
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="admin-secondary"
                      onClick={() =>
                        setSettingsDraft(
                          (s) =>
                            s && {
                              ...s,
                              footer: {
                                ...s.footer,
                                [key]: (
                                  (s.footer[key] || []) as unknown[]
                                ).filter((_, i) => i !== index),
                              },
                            },
                        )
                      }
                    >
                      Xóa
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="admin-secondary"
                  onClick={() =>
                    setSettingsDraft(
                      (s) =>
                        s && {
                          ...s,
                          footer: {
                            ...s.footer,
                            [key]: [
                              ...((s.footer[key] || []) as unknown[]),
                              { label: "", target: "shop" },
                            ],
                          },
                        },
                    )
                  }
                >
                  + Thêm liên kết
                </button>
              </div>
            ))}
            <SettingsSave section="footer" label="Lưu footer" />
          </section>
        </>
      )}
    </div>
  );
}
