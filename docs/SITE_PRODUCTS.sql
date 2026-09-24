-- Site products CMS for moctam.vercel.app (admin edits price / images / copy).
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS site_products (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE site_products ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE site_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE site_products ENABLE ROW LEVEL SECURITY;

-- Backend service_role bypasses RLS. Public read via Express GET /api/products.

NOTIFY pgrst, 'reload schema';

SELECT id, updated_at, jsonb_typeof(data) AS data_type
FROM site_products
ORDER BY id;
