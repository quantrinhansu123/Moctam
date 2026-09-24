import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet } from "./api";

export type SiteSettings = {
  heroSlides: { image: string; alt: string }[];
  hero: { eyebrow: string; title: string; description: string; actionLabel: string; actionHref: string };
  announcementBar: { glyph: string; text: string; enabled?: boolean }[];
  footer: Record<string, unknown>;
};

const fallback: SiteSettings = {
  heroSlides: [], hero: { eyebrow: "MỘC TÂM", title: "", description: "", actionLabel: "", actionHref: "#products" }, announcementBar: [], footer: {},
};
const Context = createContext<{ settings: SiteSettings; isLoading: boolean; reload: () => Promise<void> } | null>(null);

function normalizeSettings(value: unknown): SiteSettings {
  const raw = value && typeof value === "object" ? value as Partial<SiteSettings> : {};
  return {
    heroSlides: Array.isArray(raw.heroSlides) ? raw.heroSlides.filter((item): item is { image: string; alt: string } => Boolean(item && typeof item.image === "string" && typeof item.alt === "string")) : fallback.heroSlides,
    hero: { ...fallback.hero, ...(raw.hero && typeof raw.hero === "object" ? raw.hero : {}) },
    announcementBar: Array.isArray(raw.announcementBar) ? raw.announcementBar.filter((item): item is { glyph: string; text: string; enabled?: boolean } => Boolean(item && typeof item.glyph === "string" && typeof item.text === "string")) : fallback.announcementBar,
    footer: raw.footer && typeof raw.footer === "object" && !Array.isArray(raw.footer) ? raw.footer : fallback.footer,
  };
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const reload = async () => {
    setIsLoading(true);
    try { setSettings(normalizeSettings(await apiGet<unknown>("/api/settings"))); }
    catch (error) { console.warn("[settings] unable to load:", error); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { void reload(); }, []);
  const value = useMemo(() => ({ settings, isLoading, reload }), [settings, isLoading]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSiteSettings() {
  return useContext(Context) || { settings: fallback, isLoading: false, reload: async () => undefined };
}
