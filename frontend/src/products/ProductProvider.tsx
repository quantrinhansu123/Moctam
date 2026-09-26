import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { products as fallbackProducts } from "../data/products";
import { apiGet } from "../lib/api";
import type { Product } from "../types/product";

interface ProductCatalogValue {
  products: Product[];
  findProduct: (id: string) => Product | undefined;
  reload: () => Promise<void>;
  isLoading: boolean;
}

const ProductCatalogContext = createContext<ProductCatalogValue | null>(null);

function coerceProduct(product: Product, fallback?: Product): Product {
  const base = fallback || product;
  const price = Number(product.price);
  const twoBoxPrice = Number(product.twoBoxPrice);
  const rating = Number(product.rating);
  const reviews = Number(product.reviews);
  return {
    ...base,
    ...product,
    id: product.id || base.id,
    name: String(product.name || base.name || product.id || ""),
    price: Number.isFinite(price) && price > 0 ? price : Number(base.price) || 1,
    twoBoxPrice:
      Number.isFinite(twoBoxPrice) && twoBoxPrice > 0
        ? twoBoxPrice
        : Number(base.twoBoxPrice) || 2,
    rating: Number.isFinite(rating) ? rating : Number(base.rating) || 0,
    reviews: Number.isFinite(reviews) ? reviews : Number(base.reviews) || 0,
  };
}

function normalizeProducts(rows: unknown): Product[] {
  const byId = new Map<string, Product>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object" || !("id" in row)) continue;
      const product = row as Product;
      const fallback = fallbackProducts.find((item) => item.id === product.id);
      byId.set(product.id, coerceProduct(product, fallback));
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await apiGet<Product[]>("/api/products");
      setProducts(normalizeProducts(rows));
    } catch (error) {
      // Keep the last successful catalog (or seed fallback) — do not wipe
      // persisted values just because a refresh failed.
      console.warn("[products] refresh failed, keeping current catalog:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<ProductCatalogValue>(
    () => ({
      products,
      findProduct: (id: string) => products.find((product) => product.id === id),
      reload,
      isLoading,
    }),
    [products, isLoading, reload],
  );

  return (
    <ProductCatalogContext.Provider value={value}>
      {children}
    </ProductCatalogContext.Provider>
  );
}

export function useProductCatalog() {
  const ctx = useContext(ProductCatalogContext);
  if (!ctx) {
    return {
      products: fallbackProducts,
      findProduct: (id: string) =>
        fallbackProducts.find((product) => product.id === id),
      reload: async () => undefined,
      isLoading: false,
    } satisfies ProductCatalogValue;
  }
  return ctx;
}
