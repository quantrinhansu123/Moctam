import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { money, shortDate } from "../lib/format";
import { icon, starIcons } from "../lib/icons";
import type { NewCartLine, Product } from "../types/product";

interface ProductScreenProps {
  product: Product;
  onAddToCart: (line: NewCartLine) => void;
}

export function ProductScreen({ product, onAddToCart }: ProductScreenProps) {
  const content = product.content;
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [offer, setOffer] = useState<"standard" | "complete">("complete");
  const [miniIndex, setMiniIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const storyGrid = useRef<HTMLDivElement>(null);
  const firstThumbScroll = useRef(true);
  const startX = useRef(0);
  const startY = useRef(0);

  const deliveryRange = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date();
    end.setDate(end.getDate() + 8);
    return `${shortDate(start)} – ${shortDate(end)}`;
  }, []);

  const goGallery = (index: number) =>
    setGalleryIndex((index + content.gallery.length) % content.gallery.length);
  const goStory = (index: number) =>
    setStoryIndex((index + content.stories.length) % content.stories.length);

  /* Center the active thumbnail like the template (skip the first render). */
  useEffect(() => {
    if (firstThumbScroll.current) {
      firstThumbScroll.current = false;
      return;
    }
    document
      .querySelector(".thumbnail.active")
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [galleryIndex]);

  /* Story carousel transform — template only shifts below 990px. */
  useEffect(() => {
    const grid = storyGrid.current;
    if (!grid) return;
    const apply = () => {
      if (window.innerWidth < 990) {
        const cards = grid.children;
        const first = cards[0] as HTMLElement | undefined;
        const second = cards[1] as HTMLElement | undefined;
        const step = first && second ? second.offsetLeft - first.offsetLeft : 0;
        grid.style.transform = `translateX(-${storyIndex * step}px)`;
      } else {
        grid.style.transform = "";
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [storyIndex]);

  /* Pointer swipes, ported from main.js. */
  const trackStart = (event: ReactPointerEvent) => {
    startX.current = event.clientX;
    startY.current = event.clientY;
  };
  const stageUp = (event: ReactPointerEvent) => {
    const delta = event.clientX - startX.current;
    if (Math.abs(delta) > 40) goGallery(galleryIndex + (delta < 0 ? 1 : -1));
  };
  const storyUp = (event: ReactPointerEvent) => {
    const deltaX = event.clientX - startX.current;
    const deltaY = event.clientY - startY.current;
    if (
      window.innerWidth < 990 &&
      Math.abs(deltaX) > 40 &&
      Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      goStory(storyIndex + (deltaX < 0 ? 1 : -1));
    }
  };
  const miniUp = (event: ReactPointerEvent) => {
    const deltaX = event.clientX - startX.current;
    const deltaY = event.clientY - startY.current;
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setMiniIndex(
        (miniIndex + (deltaX < 0 ? 1 : -1) + content.miniReviews.length) %
          content.miniReviews.length,
      );
    }
  };

  const complete = offer === "complete";
  const stock =
    typeof product.stock === "number" && Number.isInteger(product.stock)
      ? Math.max(0, product.stock)
      : null;
  const boxesInOffer = complete ? 2 : 1;
  const canAddToCart = stock === null || stock >= boxesInOffer;
  const addToCart = () =>
    canAddToCart &&
    onAddToCart({
      productId: product.id,
      name: product.name,
      image: product.cardImage,
      tag: complete ? "2 Boxes" : "1 Box",
      regular: complete ? product.price * 2 : product.price,
      price: complete ? product.twoBoxPrice : product.price,
    });

  const mini = content.miniReviews[miniIndex];
  const ratingLabel = `${product.rating} out of 5 stars, ${product.reviews.toLocaleString("en-US")} reviews`;

  return (
    <>
      <section className="hero" id="product">
        <div className="hero-grid">
          <div className="gallery-column">
            <div
              className="gallery-stage"
              aria-label="Gallery Viewer"
              onPointerDown={trackStart}
              onPointerUp={stageUp}
            >
              <div
                className="gallery-track"
                style={{ transform: `translateX(-${galleryIndex * 100}%)` }}
              >
                {content.gallery.map((src, index) => (
                  <div className="gallery-slide" aria-hidden={index !== galleryIndex} key={src}>
                    <img src={src} alt={product.name} />
                  </div>
                ))}
              </div>
              {content.gallery.length > 1 && (
                <>
                  <button
                    className="gallery-arrow gallery-prev"
                    type="button"
                    aria-label="Slide left"
                    onClick={() => goGallery(galleryIndex - 1)}
                    dangerouslySetInnerHTML={{ __html: icon("galleryArrow") }}
                  />
                  <button
                    className="gallery-arrow gallery-next"
                    type="button"
                    aria-label="Slide right"
                    onClick={() => goGallery(galleryIndex + 1)}
                    dangerouslySetInnerHTML={{ __html: icon("galleryArrow") }}
                  />
                  <div className="gallery-dots" aria-label="Select gallery image">
                    {content.gallery.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        className={index === galleryIndex ? "active" : ""}
                        aria-label={`Load slide ${index + 1}`}
                        onClick={() => goGallery(index)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="thumbnail-row">
              <button
                className="gallery-arrow thumbnail-prev"
                type="button"
                aria-label="Slide left"
                onClick={() => goGallery(galleryIndex - 1)}
                dangerouslySetInnerHTML={{ __html: icon("galleryArrow") }}
              />
              <div className="thumbnail-viewport">
                <div className="thumbnail-track">
                  {content.gallery.map((src, index) => (
                    <button
                      key={src}
                      type="button"
                      className={`thumbnail${index === galleryIndex ? " active" : ""}`}
                      aria-label={`View tea photo ${index + 1}`}
                      onClick={() => goGallery(index)}
                    >
                      <img src={src} alt={product.name} />
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="gallery-arrow thumbnail-next"
                type="button"
                aria-label="Slide right"
                onClick={() => goGallery(galleryIndex + 1)}
                dangerouslySetInnerHTML={{ __html: icon("galleryArrow") }}
              />
            </div>
          </div>

          <div className="product-info">
            <h1>{product.name}</h1>
            <div className="rating" aria-label={ratingLabel}>
              <span
                className="stars"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: starIcons(5) }}
              />
              <span>
                {product.rating}&nbsp; ({product.reviews.toLocaleString("en-US")} reviews)
              </span>
            </div>

            <div className="feature-grid" id="feature-grid">
              {content.features.map((feature) => (
                <div className="feature" key={feature.title}>
                  <div
                    className="feature-icon"
                    dangerouslySetInnerHTML={{ __html: icon(feature.glyph) }}
                  />
                  <div className="feature-title">{feature.title}</div>
                  <div className="feature-desc">{feature.desc}</div>
                </div>
              ))}
            </div>

            <div id="offer-section">
              <div className="offer-title">
                <span>TODAY'S OFFER</span>
              </div>
              <div className="offer-options">
                <button
                  type="button"
                  className={`offer-card standard${!complete ? " selected" : ""}`}
                  onClick={() => setOffer("standard")}
                >
                  <div className="offer-box">
                    <span className="offer-radio"></span>
                    <span className="offer-content">
                      <span className="offer-line">
                        <span className="offer-name">1 Box</span>
                      </span>
                    </span>
                    <span className="offer-prices">
                      <strong>{money(product.price)}</strong>
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  className={`offer-card complete${complete ? " selected" : ""}`}
                  onClick={() => setOffer("complete")}
                >
                  <div className="offer-box">
                    <span className="popular">MOST POPULAR</span>
                    <span className="offer-radio"></span>
                    <span className="offer-content">
                      <span className="offer-line">
                        <span className="offer-name">2 Boxes</span>
                      </span>
                      {/* Only when the bundle actually beats 2× single price. */}
                      {product.price * 2 > product.twoBoxPrice && (
                        <span className="offer-save">
                          Save {money(product.price * 2 - product.twoBoxPrice)}
                        </span>
                      )}
                    </span>
                    <span className="offer-prices">
                      <strong>{money(product.twoBoxPrice)}</strong>
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="product-actions">
              <button className="add-to-cart" type="button" onClick={addToCart} disabled={!canAddToCart}>
                {stock === 0 ? "SOLD OUT" : "ADD TO CART"}
              </button>
              <div className="viewing">
                <span className="live-dot"></span>
                <em>1 people are viewing this product</em>
              </div>
              <div className="delivery-line" id="delivery-line">
                <span
                  className="delivery-icon"
                  dangerouslySetInnerHTML={{ __html: icon("shipping") }}
                />
                <span>
                  Estimated delivery: <strong>{deliveryRange}</strong>
                </span>
              </div>
              <div className="stock-alert">
                <p className="stock-heading">
                  <span
                    className="update-icon"
                    dangerouslySetInnerHTML={{ __html: icon("update") }}
                  />
                  <strong>UPDATE:</strong>
                </p>
                <p>
                  {stock === null ? (
                    <>In stock and ready to ship.</>
                  ) : stock === 0 ? (
                    <strong>This product is currently sold out.</strong>
                  ) : (
                    <><strong>{stock} box{stock === 1 ? "" : "es"} remaining.</strong> Stock updates after successful payment.</>
                  )}
                </p>
                {stock !== null && stock > 0 && <p><strong>Get yours now</strong> before we sell out!</p>}
              </div>

              {mini && (
                <div
                  className="mini-reviews"
                  id="mini-reviews"
                  onPointerDown={trackStart}
                  onPointerUp={miniUp}
                >
                  <div className="mini-review">
                    <img src={mini.image} alt="" />
                    <div className="mini-review-copy">
                      {mini.quote}
                      <br />
                      <strong>
                        {mini.name}.{" "}
                        <span
                          className="stars"
                          dangerouslySetInnerHTML={{ __html: starIcons(5) }}
                        />
                      </strong>
                    </div>
                  </div>
                  <div className="mini-review-dots">
                    {content.miniReviews.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        className={index === miniIndex ? "active" : ""}
                        aria-label={`Go to review ${index + 1}`}
                        onClick={() => setMiniIndex(index)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="product-accordions" id="product-accordions">
                {content.accordions.map((item) => (
                  <details className="product-accordion" key={item.title}>
                    <summary>
                      <span
                        className="accordion-icon"
                        dangerouslySetInnerHTML={{ __html: icon(item.glyph) }}
                      />
                      <span>{item.title}</span>
                      <span
                        className="accordion-chevron"
                        dangerouslySetInnerHTML={{ __html: icon("caret") }}
                      />
                    </summary>
                    <div className="accordion-content">{item.body}</div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stories-section reveal-section" id="stories">
        <div className="section-inner">
          <h2>{product.storiesTitle}</h2>
          <div className="stories-viewport" onPointerDown={trackStart} onPointerUp={storyUp}>
            <div className="story-grid" id="story-grid" ref={storyGrid}>
              {content.stories.map((story) => (
                <article
                  className={`story-card${story.image ? "" : " no-image"}`}
                  key={story.title}
                >
                  {story.image && <img className="story-image" src={story.image} alt="" />}
                  <div className="story-info">
                    <span
                      className="story-stars"
                      dangerouslySetInnerHTML={{ __html: starIcons(5) }}
                    />
                    <span
                      className="story-quote"
                      dangerouslySetInnerHTML={{ __html: icon("quote") }}
                    />
                    <h3>{story.title}</h3>
                    <p>{story.body}</p>
                    <p className="story-author">{story.author}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="story-dots" id="story-dots" aria-label="Select a story">
            {content.stories.map((_, index) => (
              <button
                key={index}
                type="button"
                className={index === storyIndex ? "active" : ""}
                aria-label={`Go to story ${index + 1}`}
                onClick={() => goStory(index)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="ritual-section reveal-section" id="ritual">
        <div className="ritual-grid">
          <img className="ritual-image" src={product.ritualImage} alt={product.name} />
          <div className="ritual-copy">
            <p className="eyebrow">YOUR DAILY RITUAL</p>
            <h2>{product.ritualTitle}</h2>
            <div className="steps" id="steps">
              {content.steps.map((step, index) => (
                <div className="step" key={step.title}>
                  <span className="step-number">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="compare-section reveal-section" id="compare">
        <div className="compare-grid">
          <img src={product.compareImage} alt={product.name} />
          <div className="compare-copy">
            <h2>{product.compareTitle}</h2>
            {product.compareParas.map((para) => (
              <p key={para.strong}>
                <strong>{para.strong}</strong>
                {para.rest}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="benefits-section reveal-section" id="benefits">
        <div className="benefits-grid">
          <div className="benefit-list" id="benefit-list">
            {content.benefits.map((benefit) => (
              <div className="benefit" key={benefit.title}>
                <h3
                  dangerouslySetInnerHTML={{ __html: icon(benefit.glyph) + benefit.title }}
                />
                <p>{benefit.body}</p>
              </div>
            ))}
          </div>
          <h2>{product.benefitsTitle}</h2>
        </div>
      </section>

      <section className="results-section reveal-section" id="results">
        <div className="results-grid">
          <div className="results-copy">
            <p className="eyebrow">REAL FEEDBACK FROM REAL CUSTOMERS</p>
            <h2>Flavor you can feel</h2>
            <div className="stats" id="stats">
              {content.stats.map((stat) => (
                <div className="stat" key={stat.num}>
                  <span className="stat-ring">{stat.num}</span>
                  <p>{stat.body}</p>
                </div>
              ))}
            </div>
            <p className="disclaimer">
              Based on a customer satisfaction survey of Mộc Tâm users. Individual results
              may vary.
            </p>
          </div>
          <img src={product.resultsImage} alt={`${product.name} box`} />
        </div>
      </section>

      <section className="faq-section reveal-section" id="faq">
        <div className="faq-inner">
          <h2>Questions, answered</h2>
          <div id="faq-list">
            {content.faq.map((item) => (
              <details className="faq-item" key={item.title}>
                <summary>
                  <span
                    className="faq-icon"
                    dangerouslySetInnerHTML={{ __html: icon(item.glyph) }}
                  />
                  <span>{item.title}</span>
                  <span
                    className="faq-chevron"
                    dangerouslySetInnerHTML={{ __html: icon("caret") }}
                  />
                </summary>
                <div className="faq-answer">{item.body}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta reveal-section">
        <h2>Love the tea, or your money back</h2>
        <a href="#product">Start Sipping, Save 50%</a>
      </section>
    </>
  );
}
