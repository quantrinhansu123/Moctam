import { useEffect, useState } from "react";
import { heroSlides } from "../data/products";
import { money } from "../lib/format";
import { starIcons } from "../lib/icons";
import { useProductCatalog } from "../products/ProductProvider";

export function ShopScreen({ onProduct }: { onProduct: (id: string) => void }) {
  const { products } = useProductCatalog();
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setSlide((current) => (current + 1) % heroSlides.length),
      5000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const show = (index: number) =>
    setSlide((index + heroSlides.length) % heroSlides.length);

  return (
    <>
      <section className="home-hero" aria-label="Mộc Tâm tea collection">
        <div
          className="home-hero-slides"
          style={{ transform: `translateX(-${slide * 100}%)` }}
        >
          {heroSlides.map((item, index) => (
            <img
              className="home-hero-image"
              key={item.image}
              src={item.image}
              alt={item.alt}
              aria-hidden={index !== slide}
            />
          ))}
        </div>
        <button
          className="home-hero-arrow home-hero-prev"
          type="button"
          aria-label="Previous banner"
          onClick={() => show(slide - 1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          className="home-hero-arrow home-hero-next"
          type="button"
          aria-label="Next banner"
          onClick={() => show(slide + 1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <div className="home-hero-copy">
          <p className="eyebrow">MỘC TÂM</p>
          <h1>Herbal Tea, Brewed Slowly</h1>
          <p>Natural tea and herbs, gently packaged for quiet moments in your day.</p>
          <a className="home-hero-cta" href="#products">
            Shop the Collection
          </a>
        </div>
      </section>

      <section className="product-list-section" id="products">
        <h2>Our Products</h2>
        <div className="product-grid">
          {products.map((product) => (
            <a
              className="product-card"
              key={product.id}
              href="#"
              onClick={(event) => {
                event.preventDefault();
                onProduct(product.id);
              }}
            >
              <img src={product.cardImage} alt={product.name} />
              <div className="product-card-body">
                <h3>{product.name}</h3>
                <div
                  className="rating"
                  aria-label={`${product.rating} out of 5 stars, ${product.reviews.toLocaleString("en-US")} reviews`}
                >
                  <span
                    className="stars"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: starIcons(5) }}
                  />
                  <span>
                    {product.rating}&nbsp; ({product.reviews.toLocaleString("en-US")} reviews)
                  </span>
                </div>
                <div className="product-card-prices">
                  <strong>{money(product.price)}</strong>
                </div>
                <span className="product-card-link">View Product</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
