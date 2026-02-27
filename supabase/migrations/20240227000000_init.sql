-- Services table
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  image TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  service_title TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  vin TEXT NOT NULL,
  car_make_model TEXT NOT NULL,
  color TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  telegram_sent BOOLEAN DEFAULT FALSE,
  telegram_recipients JSONB DEFAULT '[]',
  telegram_errors JSONB DEFAULT '[]'
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default services
INSERT INTO services (id, title, description, price) VALUES
  ('1', '30-Day Temporary Tag', 'Standard temporary registration valid for 30 days. Perfect for newly purchased vehicles awaiting permanent plates.', 29.99),
  ('2', '60-Day Temporary Tag', 'Extended temporary registration valid for 60 days. Ideal for out-of-state transfers and extended processing times.', 49.99),
  ('3', 'Transit Permit', 'One-trip transit permit for moving unregistered vehicles. Valid for a single trip to your destination.', 19.99)
ON CONFLICT (id) DO NOTHING;
