CREATE TABLE IF NOT EXISTS orders (
    id serial PRIMARY KEY,
    item text NOT NULL,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
