import type { Product } from "../types/product";

const img = (name: string) => `/assets/images/${name}`;

/* Ported from template/du-an-tra/assets/js/main.js (tra-moc-tam product page). */
const traMocTam: Product = {
  id: "tra-moc-tam",
  name: "Four-Herb Raspberry Leaf Tea",
  price: 1,
  twoBoxPrice: 2,
  rating: 4.8,
  reviews: 2143,
  cardImage: img("tra-moc-tam-hero.png"),
  storiesTitle: "Peaceful moments over a cup of tea",
  ritualImage: img("tra-moc-tam-hero.png"),
  ritualTitle: "Ten slow minutes with a cup of tea",
  compareImage: img("tra-moc-tam-hero.png"),
  compareTitle: "The old way vs. Mộc Tâm",
  compareParas: [
    {
      strong: "The old way:",
      rest: " strong coffee, sugary sodas, rushed drinks that make it hard to unwind.",
    },
    {
      strong: "Mộc Tâm:",
      rest: " ten unhurried minutes brewing tea. Sit back, breathe in the aroma, and let your mind settle.",
    },
  ],
  benefitsTitle: "What ten minutes gives you",
  resultsImage: img("tra-moc-tam-hero.png"),
  content: {
    gallery: [
      img("tra-moc-tam-hero.png"),
      img("tra-moc-tam-gallery-2.png"),
      img("tra-moc-tam-gallery-3.png"),
      img("tra-moc-tam-gallery-4.png"),
      img("tra-moc-tam-gallery-5.png"),
    ],
    features: [
      {
        glyph: "flower",
        title: "Hand-picked herbal tea",
        desc: "Natural tea leaves, gently fragrant",
      },
      {
        glyph: "warm",
        title: "Smooth, easy-drinking taste",
        desc: "A gentle cup of tea every day",
      },
      {
        glyph: "shield",
        title: "Freshly sealed packaging",
        desc: "Locks in flavor and quality",
      },
      {
        glyph: "heart",
        title: "Calm, every day",
        desc: "Nourishing your moments of relaxation",
      },
    ],
    steps: [
      {
        title: "Warm the teapot",
        body: "Rinse the pot and prepare water at around 85–90°C.",
      },
      {
        title: "Add the tea leaves",
        body: "Use the amount of tea that suits your taste.",
      },
      {
        title: "Steep the tea",
        body: "Wait 3–5 minutes for the leaves to release their aroma and smooth flavor.",
      },
      {
        title: "Enjoy your tea",
        body: "Pour into a cup, savor the natural aroma, and relax.",
      },
      {
        title: "Steep a second time",
        body: "The leaves still hold their flavor for another round of water.",
      },
    ],
    stories: [
      {
        image: null,
        title: "A wonderfully gentle aroma",
        body: "The tea is lightly fragrant, smooth and easy to drink. I brew a small pot every afternoon to unwind.",
        author: "Ngoc Anh, Hanoi",
      },
      {
        image: null,
        title: "Beautiful as a gift",
        body: "Elegant packaging, naturally fragrant tea. I chose Mộc Tâm as a gift for my family.",
        author: "Minh Trang, Da Nang",
      },
      {
        image: null,
        title: "A peaceful ritual",
        body: "Just a few minutes brewing tea is enough to slow the evening down.",
        author: "Thu Ha, Ho Chi Minh City",
      },
    ],
    benefits: [
      {
        glyph: "flower",
        title: "Natural ingredients",
        body: "Carefully selected tea and herbs with a clean, pure flavor.",
      },
      {
        glyph: "ritual",
        title: "A relaxing ritual",
        body: "Set aside a small quiet moment for yourself every day.",
      },
      {
        glyph: "warm",
        title: "Gentle aroma",
        body: "Awaken your senses with a warm cup of tea.",
      },
      {
        glyph: "heart",
        title: "A calming gift",
        body: "A thoughtful gift for someone you love.",
      },
    ],
    stats: [
      { num: "100%", body: "natural tea and herb aromas" },
      { num: "3–5", body: "minutes to steep a smooth cup" },
      { num: "0", body: "artificial coloring" },
    ],
    miniReviews: [
      {
        image: img("tra-moc-tam-hero.png"),
        quote: "Smooth tea flavor, light aftertaste, and very easy to drink.",
        name: "Lan Anh",
      },
      {
        image: img("tra-moc-tam-hero.png"),
        quote: "A warm cup of tea helps me unwind after a long day.",
        name: "Khanh Linh",
      },
      {
        image: img("tra-moc-tam-hero.png"),
        quote: "Neat, well-made product, great for gifting.",
        name: "Duc Minh",
      },
    ],
    accordions: [
      {
        glyph: "ritual",
        title: "How to brew",
        body: "Use 85–90°C water and steep for 3–5 minutes. Adjust the amount of tea to taste.",
      },
      {
        glyph: "shipping",
        title: "Shipping",
        body: "Free shipping on eligible orders. Orders are processed within 1–2 business days.",
      },
      {
        glyph: "shield",
        title: "Mộc Tâm promise",
        body: "Tea is carefully selected and packaged, with returns supported if the product has a seller defect.",
      },
    ],
    faq: [
      {
        glyph: "clock",
        title: "How long should I steep the tea?",
        body: "Steep for 3–5 minutes for the leaves to open up. Adjust the time for a bolder or lighter taste.",
      },
      {
        glyph: "ritual",
        title: "How many times can I re-steep it?",
        body: "Depending on the tea, you can steep it again 2–3 times.",
      },
      {
        glyph: "flower",
        title: "Does the tea contain flavoring?",
        body: "Mộc Tâm favors the natural flavor of tea and herbs.",
      },
      {
        glyph: "bolt",
        title: "How should I store it?",
        body: "Reseal tightly after opening and keep the tea somewhere dry, away from direct sunlight.",
      },
      {
        glyph: "group",
        title: "Who is it for?",
        body: "This tea suits anyone who enjoys a gentle daily tea ritual.",
      },
      {
        glyph: "shield",
        title: "What if I need support?",
        body: "Contact Mộc Tâm for quick help with products and orders.",
      },
    ],
  },
};

/* Ported from template/du-an-tra/assets/js/main-mam-xoi.js (tra-mam-xoi product page). */
const mamXoi: Product = {
  id: "mam-xoi",
  name: "Mầm Xôi Herbal Tea",
  price: 1,
  twoBoxPrice: 2,
  rating: 4.8,
  reviews: 2143,
  cardImage: img("tra-mam-xoi-1.jpg"),
  storiesTitle: "A gentler daily ritual",
  ritualImage: img("tra-mam-xoi-4.jpg"),
  ritualTitle: "A few slow minutes with a warm cup",
  compareImage: img("tra-mam-xoi-1.jpg"),
  compareTitle: "Four herbs, one gentle cup",
  compareParas: [
    {
      strong: "The blend:",
      rest: " raspberry leaf, Pueraria mirifica, red vine, and stevia — chosen and blended with care.",
    },
    {
      strong: "The ritual:",
      rest: " a few unhurried minutes to steep, sip, and settle into your day.",
    },
  ],
  benefitsTitle: "What this tea brings to your day",
  resultsImage: img("tra-mam-xoi-3.jpg"),
  content: {
    gallery: [
      img("tra-mam-xoi-1.jpg"),
      img("tra-mam-xoi-3.jpg"),
      img("tra-mam-xoi-4.jpg"),
      img("tra-mam-xoi-2.jpg"),
    ],
    features: [
      {
        glyph: "flower",
        title: "Four natural herbs",
        desc: "Raspberry leaf, Pueraria mirifica, red vine & stevia",
      },
      {
        glyph: "warm",
        title: "Gentle daily ritual",
        desc: "A warm, comforting cup any time of day",
      },
      {
        glyph: "shield",
        title: "100% natural",
        desc: "No artificial flavoring or coloring",
      },
      {
        glyph: "heart",
        title: "For women’s wellness",
        desc: "A thoughtful companion for your daily routine",
      },
    ],
    steps: [
      { title: "Boil the water", body: "Heat water to around 90–95°C." },
      {
        title: "Steep one tea bag",
        body: "Steep for 5–7 minutes in a covered cup.",
      },
      {
        title: "Enjoy warm",
        body: "Sip slowly — most people enjoy 2–3 cups a day.",
      },
      {
        title: "Store with care",
        body: "Reseal the pack and keep it in a cool, dry place.",
      },
    ],
    stories: [
      {
        image: null,
        title: "A comforting part of my routine",
        body: "I brew a cup every morning — the aroma is gentle and it’s easy to enjoy.",
        author: "Thuy Linh, Hanoi",
      },
      {
        image: null,
        title: "A thoughtful gift for my sister",
        body: "She loved the packaging, and it’s become part of her daily ritual.",
        author: "Bao Tran, Can Tho",
      },
      {
        image: null,
        title: "Simple and calming",
        body: "A warm cup in the afternoon helps me slow down and feel more at ease.",
        author: "Hoai Thu, Hue",
      },
    ],
    benefits: [
      {
        glyph: "flower",
        title: "Four herbs, one cup",
        body: "Raspberry leaf, Pueraria mirifica, red vine, and stevia in every bag.",
      },
      {
        glyph: "ritual",
        title: "A daily moment for you",
        body: "Set aside a few minutes to care for yourself, every day.",
      },
      {
        glyph: "warm",
        title: "Naturally caffeine-free",
        body: "A warm cup you can enjoy any time, morning or night.",
      },
      {
        glyph: "heart",
        title: "A gift of care",
        body: "Thoughtful packaging, perfect for someone you love.",
      },
    ],
    stats: [
      { num: "4", body: "natural herbs in every cup" },
      { num: "20", body: "tea bags per box" },
      { num: "0", body: "artificial coloring or flavoring" },
    ],
    miniReviews: [
      {
        image: img("tra-mam-xoi-1.jpg"),
        quote: "A gentle, easy habit I look forward to every day.",
        name: "Ngoc Mai",
      },
      {
        image: img("tra-mam-xoi-1.jpg"),
        quote: "Nicely packaged — makes a thoughtful gift.",
        name: "Thanh Huyen",
      },
      {
        image: img("tra-mam-xoi-1.jpg"),
        quote: "Warm and comforting, especially in the evening.",
        name: "Kim Anh",
      },
    ],
    accordions: [
      {
        glyph: "ritual",
        title: "How to brew",
        body: "Steep one tea bag in hot water (90–95°C) for 5–7 minutes. Most people enjoy 2–3 cups a day.",
      },
      {
        glyph: "shipping",
        title: "Shipping",
        body: "Free shipping on eligible orders. Orders are processed within 1–2 business days.",
      },
      {
        glyph: "shield",
        title: "Mộc Tâm promise",
        body: "Each box holds 20 tea bags x 4g, carefully sealed for freshness, with returns supported for seller defects.",
      },
    ],
    faq: [
      {
        glyph: "clock",
        title: "How long should I steep it?",
        body: "Steep for 5–7 minutes so the herbs fully release their aroma and flavor.",
      },
      {
        glyph: "group",
        title: "Who is this tea for?",
        body: "Women looking for a gentle daily herbal tea ritual.",
      },
      {
        glyph: "flower",
        title: "Does it contain caffeine?",
        body: "No — this is a naturally caffeine-free herbal blend.",
      },
      {
        glyph: "bolt",
        title: "How should I store it?",
        body: "Reseal tightly after opening and keep it in a cool, dry place away from direct sunlight.",
      },
      {
        glyph: "ritual",
        title: "How many cups a day?",
        body: "Most people enjoy 2–3 cups a day.",
      },
      {
        glyph: "shield",
        title: "What if I need support?",
        body: "Contact Mộc Tâm for quick help with products and orders.",
      },
    ],
  },
};

export const products: Product[] = [traMocTam, mamXoi];

export const findProduct = (id: string) =>
  products.find((product) => product.id === id);

/* Shop page hero slideshow (index.html home-banner-1..3). */
export const heroSlides = [
  {
    image: img("home-banner-1.png"),
    alt: "Mộc Tâm herbal tea in a misty tea garden",
  },
  {
    image: img("home-banner-2.png"),
    alt: "Mộc Tâm herbal tea and loose leaves",
  },
  {
    image: img("home-banner-3.png"),
    alt: "Mộc Tâm tea at sunrise",
  },
];
