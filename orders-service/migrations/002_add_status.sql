ALTER TABLE orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
