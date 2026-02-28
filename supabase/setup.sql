-- Run this entire script in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- Creates all tables and seeds dummy data

-- 1. Services
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  image TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Orders
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

-- 3. Activity log
CREATE TABLE IF NOT EXISTS activity (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Seed default services (upsert so re-runs update to latest)
INSERT INTO services (id, title, description, price) VALUES
  ('1', 'Same Day NJ Temporary Tag', 'Temp plate + registration + insurance card. 30-day validity. Processed through NJ MVC. Instant email or 1-hour local delivery.', 150.00),
  ('2', '30-Day Temporary Tag', 'Standard temporary registration valid for 30 days. Perfect for newly purchased vehicles awaiting permanent plates.', 29.99),
  ('3', '60-Day Temporary Tag', 'Extended temporary registration valid for 60 days. Ideal for out-of-state transfers and extended processing times.', 49.99),
  ('4', 'Transit Permit', 'One-trip transit permit for moving unregistered vehicles. Valid for a single trip to your destination.', 19.99)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, price = EXCLUDED.price;

-- 5. Seed one dummy order
INSERT INTO orders (id, service_id, service_title, first_name, last_name, phone, address, delivery_address, vin, car_make_model, color, price, created_at, telegram_sent) VALUES
  ('demo-order-001', '1', '30-Day Temporary Tag', 'Jane', 'Doe', '555-123-4567', '123 Main St, City, ST', '123 Main St, City, ST', '1HGCM82633A123456', 'Honda Accord 2023', 'Silver', 29.99, NOW(), false)
ON CONFLICT (id) DO NOTHING;

-- 6. Seed one activity entry
INSERT INTO activity (type, payload) VALUES
  ('dataIn', '{"orderId":"demo-order-001","serviceTitle":"30-Day Temporary Tag","price":29.99}'::jsonb);
