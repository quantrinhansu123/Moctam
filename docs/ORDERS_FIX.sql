-- Fix / align the `orders` table for Mộc Tâm checkout.
-- Run in Supabase SQL Editor (same project as SUPABASE_URL on Render).

-- ROOT CAUSE of failed Order saves:
-- 1) user_id is NOT NULL
-- 2) user_id has FK to users (guest checkout has no auth user)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_order_user;
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paypal_order_id VARCHAR(255) UNIQUE NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(120),
    customer_phone VARCHAR(40),
    customer_address TEXT,
    total_amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'PENDING',
    email_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255);

-- If an older schema used buyer_email / total_price, copy into the new columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'buyer_email'
  ) THEN
    UPDATE orders
    SET customer_email = COALESCE(customer_email, buyer_email)
    WHERE customer_email IS NULL OR customer_email = '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_price'
  ) THEN
    UPDATE orders
    SET total_amount = COALESCE(total_amount, total_price)
    WHERE total_amount IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_paypal_id ON orders(paypal_order_id);

-- Allow inserts when the backend uses the anon key (service_role bypasses RLS).
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_insert_anon" ON orders;
CREATE POLICY "orders_insert_anon"
ON orders FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "orders_select_anon" ON orders;
CREATE POLICY "orders_select_anon"
ON orders FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "orders_update_anon" ON orders;
CREATE POLICY "orders_update_anon"
ON orders FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Guest checkout does not have an auth user; allow NULL user_id.
-- THIS is the cause of: null value in column "user_id" violates not-null constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_order_user;
ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;

-- Or, if you prefer keeping NOT NULL, the backend now sends a random UUID per guest order.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;
