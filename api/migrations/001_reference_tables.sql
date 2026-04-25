-- MyInvois reference tables + seed data

CREATE TABLE IF NOT EXISTS ref_myinvois_tax_types (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

INSERT INTO ref_myinvois_tax_types (code, description) VALUES
  ('01', 'Sales Tax'),
  ('02', 'Service Tax'),
  ('03', 'Tourism Tax'),
  ('04', 'High-Value Goods Tax'),
  ('05', 'Sales Tax on Low Value Goods'),
  ('06', 'Not Applicable'),
  ('E',  'Tax Exemption')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_myinvois_classification_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

INSERT INTO ref_myinvois_classification_codes (code, description) VALUES
  ('001', 'Breastfeeding equipment'),
  ('002', 'Child care centres and kindergartens fees'),
  ('003', 'Computer, smartphone or tablet'),
  ('004', 'Consolidated e-Invoice'),
  ('005', 'Construction materials'),
  ('006', 'Disbursement'),
  ('007', 'Donation'),
  ('008', 'e-Commerce - e-Invoice to buyer/purchaser'),
  ('009', 'e-Commerce - Self-billed e-Invoice to seller, logistics, etc.'),
  ('010', 'Education fees'),
  ('011', 'Goods on consignment (Consignor)'),
  ('012', 'Goods on consignment (Consignee)'),
  ('013', 'Gym membership'),
  ('014', 'Insurance - Education and medical benefits'),
  ('015', 'Insurance - Takaful or life insurance'),
  ('016', 'Interest and financing expenses'),
  ('017', 'Internet subscription'),
  ('018', 'Land and building'),
  ('019', 'Medical examination for learning disabilities and early intervention or rehabilitation treatments'),
  ('020', 'Medical examination or vaccination expenses'),
  ('021', 'Medical expenses for serious diseases'),
  ('022', 'Others'),
  ('023', 'Petroleum operations'),
  ('024', 'Private retirement scheme or deferred annuity scheme'),
  ('025', 'Motor vehicle'),
  ('026', 'Subscription of books/journals/magazines/newspapers/other similar publications'),
  ('027', 'Reimbursement'),
  ('028', 'Rental of motor vehicle'),
  ('029', 'EV charging facilities'),
  ('030', 'Repair and maintenance'),
  ('031', 'Research and development'),
  ('032', 'Foreign income'),
  ('033', 'Self-billed - Betting and gaming'),
  ('034', 'Self-billed - Importation of goods'),
  ('035', 'Self-billed - Importation of services'),
  ('036', 'Self-billed - Others'),
  ('037', 'Self-billed - Monetary payment to agents, dealers or distributors'),
  ('038', 'Sports equipment/sports fees/sports training fees'),
  ('039', 'Supporting equipment for disabled person'),
  ('040', 'Voluntary contribution to approved provident fund'),
  ('041', 'Dental examination or treatment'),
  ('042', 'Fertility treatment'),
  ('043', 'Treatment and home care nursing, daycare centres and residential care centers'),
  ('044', 'Vouchers, gift cards, loyalty points, etc.'),
  ('045', 'Self-billed - Non-monetary payment to agents, dealers or distributors')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_myinvois_unit_types (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

INSERT INTO ref_myinvois_unit_types (code, description) VALUES
  ('C62', 'One (unit)'),
  ('DZN', 'Dozen'),
  ('KGM', 'Kilogram'),
  ('GRM', 'Gram'),
  ('LTR', 'Litre'),
  ('MLT', 'Millilitre'),
  ('HUR', 'Hour'),
  ('DAY', 'Day'),
  ('MON', 'Month'),
  ('ANN', 'Year')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_myinvois_state_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

INSERT INTO ref_myinvois_state_codes (code, description) VALUES
  ('01', 'Johor'),
  ('02', 'Kedah'),
  ('03', 'Kelantan'),
  ('04', 'Melaka'),
  ('05', 'Negeri Sembilan'),
  ('06', 'Pahang'),
  ('07', 'Pulau Pinang'),
  ('08', 'Perak'),
  ('09', 'Perlis'),
  ('10', 'Selangor'),
  ('11', 'Terengganu'),
  ('12', 'Sabah'),
  ('13', 'Sarawak'),
  ('14', 'Wilayah Persekutuan Kuala Lumpur'),
  ('15', 'Wilayah Persekutuan Labuan'),
  ('16', 'Wilayah Persekutuan Putrajaya'),
  ('17', 'Not Applicable')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_myinvois_country_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

INSERT INTO ref_myinvois_country_codes (code, description) VALUES
  ('MYS', 'Malaysia')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_myinvois_msic_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

INSERT INTO ref_myinvois_msic_codes (code, description) VALUES
  ('56106', 'Food stalls/hawkers'),
  ('56107', 'Food or beverage preparation in market stalls/hawkers'),
  ('56303', 'Drink stalls/hawkers'),
  ('56105', 'Mobile food carts'),
  ('47810', 'Retail sale of food, beverages and tobacco products via stalls or markets'),
  ('56101', 'Restaurants and restaurant cum night clubs'),
  ('56103', 'Fast-food restaurants'),
  ('56302', 'Coffee shops'),
  ('00000', 'Not Applicable')
ON CONFLICT (code) DO NOTHING;
