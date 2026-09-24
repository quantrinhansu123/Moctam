-- Add cart line items to orders (for admin product charts).
-- Run in Supabase SQL Editor.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

-- Example shape:
-- [
--   { "product_id": "tra-moc-tam", "name": "...", "tag": "1 Box", "qty": 2, "price": 1 }
-- ]

NOTIFY pgrst, 'reload schema';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'items';
