-- Orders table for the pre-checkout email + post-purchase notification flow.
-- Run this in the Supabase SQL Editor (same project as SUPABASE_URL).

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paypal_order_id VARCHAR(255) UNIQUE NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(120),
    customer_phone VARCHAR(40),
    customer_address TEXT,
    total_amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED
    email_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by PayPal Order ID
CREATE INDEX IF NOT EXISTS idx_orders_paypal_id ON orders(paypal_order_id);

-- If `orders` already exists without shipping fields, run:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
