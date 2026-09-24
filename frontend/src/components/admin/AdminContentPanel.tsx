import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiPut } from "../../lib/api";
import type { ComparePara, Product } from "../../types/product";
import { products as fallbackProducts } from "../../data/products";
import type { SiteSettings } from "../../lib/siteSettings";

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
  const [catalog, setCatalog] = useState<Product[]>(fallbackProducts);
  const [selectedId, setSelectedId] = useState(fallbackProducts[0]?.id || "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<SiteSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const selected = useMemo(
    () => catalog.find((p) => p.id === selectedId) || catalog[0],
    [catalog, selectedId],
  );

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const rows = await apiGet<Product[]>("/api/products");
      const siteSettings = await apiGet<SiteSettings>("/api/settings");
      setSettingsDraft(siteSettings);
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

  const updateListItem = (key: keyof Product["content"], index: number, field: string, value: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const list = [...(prev.content[key] as unknown as Record<string, unknown>[])];
      list[index] = { ...list[index], [field]: field === "image" && !value ? null : value };
      return { ...prev, content: { ...prev.content, [key]: list } };
    });
    setSavedAt("");
  };
  const addListItem = (key: keyof Product["content"], item: Record<string, unknown>) =>
    setDraft((prev) => prev ? { ...prev, content: { ...prev.content, [key]: [...(prev.content[key] as unknown[]), item] } } : prev);
  const removeListItem = (key: keyof Product["content"], index: number) =>
    setDraft((prev) => prev ? { ...prev, content: { ...prev.content, [key]: (prev.content[key] as unknown[]).filter((_, i) => i !== index) } } : prev);

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

  const saveSettings = async () => {
    if (!settingsDraft) return;
    setSettingsSaving(true); setError("");
    try {
      const result = await apiPut<{ settings: SiteSettings }>("/api/admin/settings", settingsDraft, { headers: { Authorization: `Bearer ${token}` } });
      setSettingsDraft(result.settings || settingsDraft); setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save settings.";
      if (/401|403|unauthorized|forbidden|invalid token/i.test(message)) onAuthExpired();
      else setError(message);
    }
    finally { setSettingsSaving(false); }
  };

  const ListEditor = ({ title, field, fields, blank }: { title: string; field: keyof Product["content"]; fields: [string, string][]; blank: Record<string, unknown> }) => (
    <section className="admin-content-card">
      <h2>{title}</h2>
      {((draft?.content[field] || []) as unknown as Record<string, unknown>[]).map((item, index) => (
        <div className="admin-list-item" key={`${field}-${index}`}>
          <strong>{title} {index + 1}</strong>
          {fields.map(([name, label]) => <label key={name}>{label}<input value={String(item[name] ?? "")} onChange={(e) => updateListItem(field, index, name, e.target.value)} /></label>)}
          <button className="admin-secondary" type="button" onClick={() => removeListItem(field, index)}>Remove</button>
        </div>
      ))}
      <button className="admin-secondary" type="button" onClick={() => addListItem(field, blank)}>+ Add {title.slice(0, -1)}</button>
    </section>
  );

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

        <ListEditor title="Features" field="features" fields={[["glyph", "Icon"], ["title", "Title"], ["desc", "Description"]]} blank={{ glyph: "flower", title: "", desc: "" }} />
        <ListEditor title="Steps" field="steps" fields={[["title", "Title"], ["body", "Description"]]} blank={{ title: "", body: "" }} />
        <ListEditor title="Stories" field="stories" fields={[["image", "Image URL (optional)"], ["title", "Title"], ["body", "Text"], ["author", "Author"]]} blank={{ image: null, title: "", body: "", author: "" }} />
        <ListEditor title="Benefits" field="benefits" fields={[["glyph", "Icon"], ["title", "Title"], ["body", "Description"]]} blank={{ glyph: "flower", title: "", body: "" }} />
        <ListEditor title="Stats" field="stats" fields={[["num", "Number"], ["body", "Description"]]} blank={{ num: "", body: "" }} />
        <ListEditor title="Mini reviews" field="miniReviews" fields={[["image", "Image URL"], ["quote", "Quote"], ["name", "Name"]]} blank={{ image: "", quote: "", name: "" }} />
        <ListEditor title="Accordions" field="accordions" fields={[["glyph", "Icon"], ["title", "Title"], ["body", "Text"]]} blank={{ glyph: "ritual", title: "", body: "" }} />
        <ListEditor title="FAQs" field="faq" fields={[["glyph", "Icon"], ["title", "Question"], ["body", "Answer"]]} blank={{ glyph: "flower", title: "", body: "" }} />

        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save product"}
        </button>
      </form>

      {settingsDraft && <section className="admin-content-card">
        <h2>Nội dung trang chính</h2>
        <p className="admin-note">Hero, thông báo và footer hiển thị trực tiếp trên storefront.</p>
        <h3>Hero slides</h3>
        {settingsDraft.heroSlides.map((slide, index) => <div className="admin-list-item" key={`slide-${index}`}><label>Image URL<input value={slide.image} onChange={(e) => setSettingsDraft((s) => s && ({ ...s, heroSlides: s.heroSlides.map((x, i) => i === index ? { ...x, image: e.target.value } : x) }))} /></label><label>Alt text<input value={slide.alt} onChange={(e) => setSettingsDraft((s) => s && ({ ...s, heroSlides: s.heroSlides.map((x, i) => i === index ? { ...x, alt: e.target.value } : x) }))} /></label><button type="button" className="admin-secondary" onClick={() => setSettingsDraft((s) => s && ({ ...s, heroSlides: s.heroSlides.filter((_, i) => i !== index) }))}>Remove</button></div>)}
        <button type="button" className="admin-secondary" onClick={() => setSettingsDraft((s) => s && ({ ...s, heroSlides: [...s.heroSlides, { image: "", alt: "" }] }))}>+ Add slide</button>
        {(["eyebrow", "title", "description", "actionLabel", "actionHref"] as const).map((key) => <label key={key}>Hero {key}<input value={settingsDraft.hero[key]} onChange={(e) => setSettingsDraft((s) => s && ({ ...s, hero: { ...s.hero, [key]: e.target.value } }))} /></label>)}
        <h3>Announcement bar</h3>
        {settingsDraft.announcementBar.map((item, index) => <div className="admin-list-item" key={`announcement-${index}`}><label>Icon<input value={item.glyph} onChange={(e) => setSettingsDraft((s) => s && ({ ...s, announcementBar: s.announcementBar.map((x, i) => i === index ? { ...x, glyph: e.target.value } : x) }))} /></label><label>Text<input value={item.text} onChange={(e) => setSettingsDraft((s) => s && ({ ...s, announcementBar: s.announcementBar.map((x, i) => i === index ? { ...x, text: e.target.value } : x) }))} /></label><label><input type="checkbox" checked={item.enabled !== false} onChange={(e) => setSettingsDraft((s) => s && ({ ...s, announcementBar: s.announcementBar.map((x, i) => i === index ? { ...x, enabled: e.target.checked } : x) }))} /> Enabled</label><button type="button" className="admin-secondary" onClick={() => setSettingsDraft((s) => s && ({ ...s, announcementBar: s.announcementBar.filter((_, i) => i !== index) }))}>Remove</button></div>)}
        <button type="button" className="admin-secondary" onClick={() => setSettingsDraft((s) => s && ({ ...s, announcementBar: [...s.announcementBar, { glyph: "redeem", text: "", enabled: true }] }))}>+ Add announcement</button>
        <h3>Footer contact</h3>
        {(["logo", "brand", "description", "taxId", "address", "hours", "copyright"] as const).map((key) => <label key={key}>Footer {key}<input value={String(settingsDraft.footer[key] || "")} onChange={(e) => setSettingsDraft((s) => s && ({ ...s, footer: { ...s.footer, [key]: e.target.value } }))} /></label>)}
        {["quickLinks", "careLinks"].map((key) => <div key={key}><h3>Footer {key}</h3>{((settingsDraft.footer[key] || []) as { label: string; target?: string; productId?: string }[]).map((link, index) => <div className="admin-list-item" key={`${key}-${index}`}><label>Label<input value={link.label} onChange={(e) => setSettingsDraft((s) => { if (!s) return s; const links = [...((s.footer[key] || []) as typeof link[])]; links[index] = { ...links[index], label: e.target.value }; return { ...s, footer: { ...s.footer, [key]: links } }; })} /></label><label>Page target<input value={link.target || ""} onChange={(e) => setSettingsDraft((s) => { if (!s) return s; const links = [...((s.footer[key] || []) as typeof link[])]; links[index] = { ...links[index], target: e.target.value, productId: "" }; return { ...s, footer: { ...s.footer, [key]: links } }; })} /></label><label>Product ID (optional)<input value={link.productId || ""} onChange={(e) => setSettingsDraft((s) => { if (!s) return s; const links = [...((s.footer[key] || []) as typeof link[])]; links[index] = { ...links[index], productId: e.target.value }; return { ...s, footer: { ...s.footer, [key]: links } }; })} /></label><button type="button" className="admin-secondary" onClick={() => setSettingsDraft((s) => s && ({ ...s, footer: { ...s.footer, [key]: ((s.footer[key] || []) as unknown[]).filter((_, i) => i !== index) } }))}>Remove</button></div>)}<button type="button" className="admin-secondary" onClick={() => setSettingsDraft((s) => s && ({ ...s, footer: { ...s.footer, [key]: [...((s.footer[key] || []) as unknown[]), { label: "", target: "shop" }] } }))}>+ Add link</button></div>)}
        <button type="button" onClick={() => void saveSettings()} disabled={settingsSaving}>{settingsSaving ? "Saving…" : "Save site content"}</button>
      </section>}
    </div>
  );
}
