CREATE TABLE IF NOT EXISTS merchants (
  id                           BIGSERIAL PRIMARY KEY,
  business_name                TEXT NOT NULL,
  owner_name                   TEXT NOT NULL,
  business_type                TEXT NOT NULL,
  tin                          TEXT NOT NULL,
  registration_type            TEXT NOT NULL,
  registration_number          TEXT NOT NULL,
  sst_registration_number      TEXT,
  ttx_registration_number      TEXT,
  msic_code                    TEXT NOT NULL REFERENCES ref_myinvois_msic_codes(code),
  business_activity_description TEXT NOT NULL,
  phone                        TEXT NOT NULL,
  email                        TEXT,
  address_line1                TEXT NOT NULL,
  address_line2                TEXT,
  city                         TEXT NOT NULL,
  state_code                   TEXT NOT NULL REFERENCES ref_myinvois_state_codes(code),
  postcode                     TEXT NOT NULL,
  country_code                 TEXT NOT NULL DEFAULT 'MYS' REFERENCES ref_myinvois_country_codes(code),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT merchants_business_type_check CHECK (
    business_type IN ('warung','food_stall','drink_stall','mobile_cart','coffee_shop','restaurant','market_stall','retail_kiosk','other')
  ),
  CONSTRAINT merchants_registration_type_check CHECK (
    registration_type IN ('BRN','NRIC','PASSPORT','ARMY')
  ),
  CONSTRAINT merchants_state_code_check CHECK (
    state_code IN ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16')
  ),
  CONSTRAINT merchants_country_code_check CHECK (country_code = 'MYS')
);

CREATE INDEX IF NOT EXISTS idx_merchants_tin ON merchants(tin);
