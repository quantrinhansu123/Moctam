import { useEffect, useState } from "react";
import "./App.css";
import { AnnouncementBar } from "./components/AnnouncementBar";
import { CartDrawer } from "./components/CartDrawer";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { MobileMenu } from "./components/MobileMenu";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { findProduct } from "./data/products";
import type { NavKey } from "./data/navigation";
import { useReveal } from "./hooks/useReveal";
import { useProductCatalog } from "./products/ProductProvider";
import { AdminScreen } from "./screens/AdminScreen";
import { ContactScreen } from "./screens/ContactScreen";
import { HowItWorksScreen } from "./screens/HowItWorksScreen";
import { ProductScreen } from "./screens/ProductScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { TrackOrderScreen } from "./screens/TrackOrderScreen";
import type { CartLine, NewCartLine } from "./types/product";

type Route = { page: NavKey } | { page: "product"; productId: string };

const TITLES: Record<string, string> = {
  shop: "Mộc Tâm – Herbal Tea, Brewed Slowly",
  how: "How It Works – Mộc Tâm",
  track: "Track Order – Mộc Tâm",
  contact: "Contact Us – Mộc Tâm",
  product: "Four-Herb Raspberry Leaf Tea",
};

function isAdminHash(hash = window.location.hash) {
  return hash === "#/admin" || hash === "#admin";
}

function App() {
  const { findProduct: findCatalogProduct } = useProductCatalog();
  const [isAdmin, setIsAdmin] = useState(() => isAdminHash());
  const [route, setRoute] = useState<Route>({ page: "shop" });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const activeNav: NavKey | null = route.page === "product" ? null : route.page;
  const product =
    route.page === "product"
      ? findCatalogProduct(route.productId) || findProduct(route.productId)
      : undefined;

  useEffect(() => {
    const syncHash = () => setIsAdmin(isAdminHash());
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  /* Template behavior: lock body scroll behind open drawers. */
  useEffect(() => {
    document.body.classList.toggle("drawer-open", menuOpen || cartOpen);
  }, [menuOpen, cartOpen]);

  /* Per-page <title> and body[data-page] (the template styles the track scrollbar). */
  useEffect(() => {
    if (isAdmin) return;
    document.body.dataset.page = route.page;
    document.title = TITLES[route.page];
  }, [route, isAdmin]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setCartOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useReveal(
    isAdmin ? "admin" : route.page === "product" ? route.productId : route.page,
  );

  if (isAdmin) {
    return <AdminScreen />;
  }

  const navigate = (page: NavKey) => {
    setRoute({ page });
    setMenuOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0 });
  };

  const openProduct = (productId: string) => {
    setRoute({ page: "product", productId });
    setMenuOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0 });
  };

  const addLine = (line: NewCartLine) => {
    const key = `${line.productId}:${line.tag}`;
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) =>
          item.key === key ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [{ ...line, key, qty: 1 }, ...current];
    });
    setCartOpen(true);
  };

  const changeQty = (key: string, delta: number) =>
    setCart((current) =>
      current.map((item) =>
        item.key === key ? { ...item, qty: Math.max(1, item.qty + delta) } : item,
      ),
    );

  const removeLine = (key: string) =>
    setCart((current) => current.filter((item) => item.key !== key));

  const mainClass =
    route.page === "how" || route.page === "contact" || route.page === "track"
      ? "destination-main"
      : undefined;

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AnnouncementBar />
      <SiteHeader
        active={activeNav}
        cartCount={cart.reduce((sum, item) => sum + item.qty, 0)}
        menuOpen={menuOpen}
        searchOpen={searchOpen}
        onNavigate={navigate}
        onOpenMenu={() => setMenuOpen(true)}
        onToggleSearch={setSearchOpen}
        onOpenCart={() => setCartOpen(true)}
      />
      <MobileMenu
        open={menuOpen}
        active={activeNav}
        onNavigate={navigate}
        onClose={() => setMenuOpen(false)}
      />

      <main id="main-content" className={mainClass}>
        {route.page === "shop" && <ShopScreen onProduct={openProduct} />}
        {route.page === "how" && <HowItWorksScreen />}
        {route.page === "track" && <TrackOrderScreen />}
        {route.page === "contact" && <ContactScreen />}
        {route.page === "product" && product && (
          <ProductScreen key={product.id} product={product} onAddToCart={addLine} />
        )}
      </main>

      <SiteFooter onNavigate={navigate} onProduct={openProduct} />

      <CartDrawer
        open={cartOpen}
        lines={cart}
        onClose={() => setCartOpen(false)}
        onQty={changeQty}
        onRemove={removeLine}
        onClear={() => setCart([])}
      />
      <FeedbackWidget />
    </>
  );
}

export default App;
