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
  telegram_errors JSONB DEFAULT '[]',
  stripe_session_id TEXT UNIQUE,
  payment_status TEXT DEFAULT 'pending'
);

-- Add columns if upgrading existing DB (safe to run)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_slot TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_scheduled_at TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_choice TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS insurance_company TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS policy_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_info TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS year TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS make TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS doc_drivers_license TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS doc_insurance_card TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS doc_vin_photo TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS success_email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_accepted_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_accepted_group_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_claim_message_ids JSONB DEFAULT '{}';

-- Settings table (checkout config)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('insurance_monthly_price', '100'::jsonb),
  ('insurance_yearly_price', '900'::jsonb),
  ('test_mode', 'false'::jsonb),
  ('overnight_fedex_fee', '50'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Storage bucket for order documents (create in Supabase Dashboard: Storage → New bucket → name: order-documents, Public: yes)

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
