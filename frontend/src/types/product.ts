/* Data model for the template-based UI (template/du-an-tra). */

export interface Feature {
  glyph: string;
  title: string;
  desc: string;
}

export interface Step {
  title: string;
  body: string;
}

export interface Story {
  image: string | null;
  title: string;
  body: string;
  author: string;
}

export interface Benefit {
  glyph: string;
  title: string;
  body: string;
}

export interface Stat {
  num: string;
  body: string;
}

export interface MiniReview {
  image: string;
  quote: string;
  name: string;
}

export interface Accordion {
  glyph: string;
  title: string;
  body: string;
}

export interface FaqItem {
  glyph: string;
  title: string;
  body: string;
}

export interface ComparePara {
  strong: string;
  rest: string;
}

export interface ProductContent {
  gallery: string[];
  features: Feature[];
  steps: Step[];
  stories: Story[];
  benefits: Benefit[];
  stats: Stat[];
  miniReviews: MiniReview[];
  accordions: Accordion[];
  faq: FaqItem[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  twoBoxPrice: number;
  rating: number;
  reviews: number;
  /** Number of individual boxes available. Null means inventory is not tracked. */
  stock?: number | null;
  /** Image shown on the shop grid and in the cart drawer. */
  cardImage: string;
  content: ProductContent;
  /* Page-specific copy from moc-tam-herbal-tea.html / tra-mam-xoi.html */
  storiesTitle: string;
  ritualImage: string;
  ritualTitle: string;
  compareImage: string;
  compareTitle: string;
  compareParas: ComparePara[];
  benefitsTitle: string;
  resultsImage: string;
}

/** A line in the slide-in cart drawer. */
export interface CartLine {
  /** `${productId}:${tag}` — one line per product+offer. */
  key: string;
  productId: string;
  name: string;
  image: string;
  /** "1 Box" | "2 Boxes" */
  tag: string;
  regular: number;
  price: number;
  qty: number;
}

export type NewCartLine = Omit<CartLine, "key" | "qty">;
