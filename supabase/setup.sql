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
ALTER TABLE orders ADD COLUMN IF NOT EXISTS new_lead_email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_accepted_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_accepted_group_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_accepted_group_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_claim_message_ids JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_same_as_registration BOOLEAN DEFAULT FALSE;

-- Funnel/lead tracking. Lets the admin dashboard surface customers who
-- entered delivery info or paid but never finished the post-payment flow,
-- so paid-but-incomplete clients can be reached out to before they dispute.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_status TEXT DEFAULT 'lead_started';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lead_started_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_pending_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tag_info_submitted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS documents_uploaded_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lead_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_ip TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispute_risk BOOLEAN DEFAULT FALSE;

-- Affiliate referral: which tristatetags.com/<slug> link drove this order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_code TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_referral_code ON orders (referral_code);

-- Supervisor Telegram notify (fires once per order when it first has real content)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supervisor_notified_at TIMESTAMPTZ;

-- Abandoned-cart follow-up emails (1h + weekly) and marketing unsubscribe.
-- IMPORTANT: these must exist, otherwise the resilient writer drops the columns
-- and the "already reminded / unsubscribed" flags silently no-op — causing repeat
-- emails to the same customer on every sweep.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS abandoned_reminder1_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS abandoned_reminder2_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketing_unsubscribed_at TIMESTAMPTZ;

-- Krableads external lead ingest (reference from POST /api/v1/leads/ingest)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS krableads_reference_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS krableads_lead_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS krableads_ingested_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS krableads_ingest_error TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_krableads_reference ON orders (krableads_reference_id);

CREATE INDEX IF NOT EXISTS idx_orders_checkout_status ON orders (checkout_status);
CREATE INDEX IF NOT EXISTS idx_orders_lead_token ON orders (lead_token);
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders (paid_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('plate_only_price', '150'::jsonb),
  ('insurance_only_price', '100'::jsonb),
  ('plate_and_insurance_price', '250'::jsonb),
  ('insurance_monthly_price', '100'::jsonb),
  ('insurance_yearly_price', '900'::jsonb),
  ('test_mode', 'false'::jsonb),
  ('overnight_fedex_fee', '33'::jsonb),
  ('driver_extended_fee', '50'::jsonb),
  ('driver_local_states', '["NJ"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Bump overnight fee on existing databases
INSERT INTO settings (key, value) VALUES
  ('overnight_fedex_fee', '33'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

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

-- 7. Force PostgREST to reload its schema cache so newly added columns
--    (e.g. phone_enc_iv, phone_enc_data) are immediately visible to the API.
--    Without this, the server may still see "Could not find the
--    phone_enc_data column of orders in the schema cache" until PostgREST
--    is restarted.
NOTIFY pgrst, 'reload schema';
