import {
  createContext,
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

function normalizeProducts(rows: unknown): Product[] {
  const byId = new Map<string, Product>();
  for (const product of fallbackProducts) {
    byId.set(product.id, product);
  }
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object" || !("id" in row)) continue;
      const product = row as Product;
      const prev = byId.get(product.id);
      byId.set(product.id, prev ? { ...prev, ...product, id: product.id } : product);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [isLoading, setIsLoading] = useState(true);

  const reload = async () => {
    setIsLoading(true);
    try {
      const rows = await apiGet<Product[]>("/api/products");
      setProducts(normalizeProducts(rows));
    } catch (error) {
      console.warn("[products] using local fallback:", error);
      setProducts(fallbackProducts);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const value = useMemo<ProductCatalogValue>(
    () => ({
      products,
      findProduct: (id: string) => products.find((product) => product.id === id),
      reload,
      isLoading,
    }),
    [products, isLoading],
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
