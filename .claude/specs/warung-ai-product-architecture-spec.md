# Warung AI LeanSpec

## 1. Purpose

This is the single implementation-facing source of truth for Warung AI MVP v1.

It consolidates:

- Architecture
- Database schema
- Constraints and restricted values
- Core business logic
- LHDN-only calculations

This document supersedes the need to consult separate planning docs during implementation.

## 2. Product Scope

Warung AI is a mobile-first MVP for a single Malaysian micro-merchant that provides:

1. AI text-based menu onboarding
2. Editable POS menu
3. Order taking with simulated QR payment
4. Paid sales recording
5. Dashboard analytics
6. Conversational analytics chat
7. Manual expense entry
8. LHDN export pack generation
9. Credit scorecard and simulated micro-credit result

Out of scope:

- Real TNG / DuitNow settlement
- Real LHDN filing certification
- Real loan origination
- Inventory, payroll, multi-branch, refunds, partial payments, multi-tenant auth

## 3. Architecture

### 3.1 System shape

```text
web/ (Next.js) -> api/ (Hono BFF) -> ai/ (FastAPI)
                        |
                        +-> PostgreSQL (shared infra; `api/` owns schema and writes)
                        +-> S3

api/ persists merchant-to-session binding metadata in PostgreSQL.
ai/ stores chat message history in its own session store and also has merchant-scoped read-only PostgreSQL access for chat analytics.
```

### 3.2 Service responsibilities

| Service | Responsibilities | Must not own |
| --- | --- | --- |
| `web/` | UI, client state, rendering, merchant flows | DB access, LLM logic, finance math |
| `api/` | Auth context, validation, writes, merchant/session binding persistence, analytics queries, scorecard math, export generation, payment simulation, orchestration | Direct browser rendering, model inference, chat history storage |
| `ai/` | Stateless menu parsing, chat session state/history storage, session-aware conversational reasoning, merchant-scoped read-only retrieval, optional anomaly detection | Business writes, auth ownership, unrestricted DB access, export/file generation |

### 3.3 Operating mode

- Operationally single-merchant for MVP
- Still use a real `merchants` table and `merchant_id` ownership on merchant-owned data
- `api/` is the only public backend boundary
- `ai/` is private and callable only from `api/`
- PostgreSQL is shared infrastructure, but data ownership belongs to `api/`

### 3.4 Data access rules

- `api/` -> PostgreSQL: read/write and schema owner
- `api/` persists `chat_sessions` only for merchant/session binding
- `ai/` stores conversational history in an AI-owned session store
- `ai/` -> PostgreSQL: read-only, merchant-scoped, chat analytics only; never owns schema or writes shared business data
- `api/` -> S3: generated export files

### 3.5 AI boundaries

AI-powered:

- Menu transcript parsing
- Conversational analytics reasoning over merchant-scoped data and AI-owned session history

Deterministic:

- Order pricing/tax computation
- QR simulation
- Dashboard aggregations
- Scorecard formulas
- LHDN export generation
- Credit decision simulation
- Merchant/session binding persistence in `api/`

### 3.6 AI interface field ownership

This section clarifies, for every `api -> ai` call, which fields are:

- supplied to `ai/` by `api/`
- produced by `ai/`
- derived, assigned, or persisted by `api/` after the `ai/` response

There is no PostgreSQL HTTP endpoint surface. `ai/` reads PostgreSQL directly through its merchant-scoped read-only DB access.

#### `api -> ai POST /v1/parse-menu`

Fields sent to `ai/`:

- `transcript`

Fields produced by `ai/`:

- `items[].name`
- `items[].priceCents`
- optional draft suggestions only:
- `items[].category`
- `items[].unitCode`
- `items[].classificationCode`
- `items[].taxCode`
- `items[].taxRateMode`
- `items[].taxRatePct`
- `items[].taxPerUnitCents`
- `items[].taxExemptionReason`
- `items[].reviewRequired`

Fields not produced by `ai/` and instead assigned or derived by `api/`:

- `items[].id`
- `items[].color`
- `items[].displayOrder`
- fallback `items[].category = 'other'` when needed
- persisted `compliance_review_status = 'pending_review'`
- DB-only conversions such as `tax_rate_bps = round(taxRatePct * 100)`

#### `api -> ai POST /v1/chat/sessions`

Fields sent to `ai/`:

- `merchantId`
- `timeZone`

Fields produced by `ai/`:

- `sessionId`

Fields not produced by `ai/` and instead assigned or persisted by `api/`:

- `chat_sessions.merchant_id`
- `chat_sessions.ai_session_id`
- `chat_sessions.status`
- `chat_sessions.created_at`
- `chat_sessions.updated_at`

#### `api -> ai GET /v1/chat/sessions/:id/messages`

Fields sent to `ai/`:

- `sessionId`
- `merchantId`

Fields produced by `ai/`:

- `sessionId`
- `messages[].role`
- `messages[].content`
- optional `messages[].evidence` on assistant messages only
- `messages[].createdAt`

Fields not produced by `ai/` and instead checked by `api/` before forwarding:

- merchant/session authorization using `chat_sessions.merchant_id`
- session status validation using `chat_sessions.status`

#### `api -> ai POST /v1/ask`

Fields sent to `ai/`:

- `sessionId`
- `question`
- `merchantId`
- `timeZone`

Fields loaded internally by `ai/`, not sent by `api/`:

- prior conversation history from the AI-owned session store
- merchant-scoped analytical data from PostgreSQL using read-only access

Fields produced by `ai/`:

- `answer`
- `evidence[]`
- optional `queries[]`

Fields not produced by `ai/` and instead updated or enforced by `api/`:

- merchant/session authorization using `chat_sessions.merchant_id`
- session status validation using `chat_sessions.status`
- `chat_sessions.last_message_at`

#### Rule summary

- `merchantId` is always resolved by `api/`, never trusted from `web/`
- `sessionId` is always generated by `ai/`
- menu draft content is suggested by `ai/`, but review state and UI defaults are owned by `api/`
- shared business data in PostgreSQL is read by `ai/` but remains API-owned
- chat history is owned by `ai/`, not by PostgreSQL and not by `api/`

## 4. Core Flows

### 4.1 Menu onboarding

1. `web` sends transcript to `api`
2. `api` calls `ai /v1/parse-menu`
3. `ai` returns item drafts
4. `api` validates restricted values, assigns UI defaults, persists `menu_items`
5. Merchant reviews and edits through `POST /v1/menu`

`parse-menu` is stateless. It must not create or depend on any chat session.

### 4.2 POS order and simulated payment

1. Merchant selects items and quantities
2. `api` computes subtotal, tax, total
3. `api` inserts `orders` and `order_items` with sale-time snapshots
4. `api` returns QR payload and payable total
5. Success flow calls `POST /v1/orders/:id/paid`
6. `api` sets `paid_at`

### 4.3 Chat session creation

1. `web` calls `POST /v1/chat/sessions`
2. `api` resolves trusted `merchantId`
3. `api` calls `ai /v1/chat/sessions`
4. `ai` creates an internal session and returns `sessionId`
5. `api` inserts `chat_sessions` bound to that merchant and `sessionId`
6. `api` returns `sessionId`

### 4.4 Conversational analytics turn

1. `web` sends a message to `POST /v1/chat/sessions/:id/messages`
2. `api` resolves trusted `merchantId`
3. `api` loads the session and rejects cross-merchant access
4. `api` calls `ai /v1/ask` with `merchantId`, `sessionId`, `timeZone`, and current question
5. `ai` loads prior messages from its own session store
6. `ai` uses `merchantId` for merchant-scoped read-only DB access
7. `ai` runs read-only queries, appends the new turn to its own session store, and generates the answer
8. `api` updates `chat_sessions.last_message_at`
9. `api` returns the answer and evidence to `web`

### 4.5 Conversation retrieval

1. `web` calls `GET /v1/chat/sessions/:id/messages`
2. `api` resolves trusted `merchantId`
3. `api` loads the session and rejects cross-merchant access
4. `api` calls `ai /v1/chat/sessions/:id/messages` with `merchantId` and `sessionId`
5. `ai` loads stored messages from its own session store
6. `api` returns the ordered conversation to `web`

### 4.6 LHDN export pack

1. `web` calls `POST /v1/exports/lhdn { from, to }`
2. `api` creates `export_job`
3. `api` validates included paid sales and reviewed compliance snapshots
4. `api` generates 4 artifacts:
   - profit-loss
   - borang-b-summary
   - cp500-summary
   - consolidated-einvoice
5. `api` stores `generated_documents`
6. `api` uploads files to S3
7. `api` returns export-pack summary

### 4.7 Credit application

1. `web` calls `POST /v1/credit/apply`
2. `api` computes scorecard from DB
3. `api` bundles scorecard + 3-month P&L basis
4. `api` returns simulated approval result

## 5. Global Data Conventions

- Money is always integer cents in storage
- Percentage tax rates are stored as basis points: `600 = 6.00%`
- Fixed per-unit tax is stored as integer cents per unit
- All persisted timestamps use UTC `TIMESTAMPTZ`
- Merchant-facing time windows and buckets use `Asia/Kuala_Lumpur`
- Business finance/reporting uses **paid orders only**
- DB columns use `snake_case`
- Wire fields use `camelCase`

## 6. Restricted Values

### 6.1 App-owned enums

#### `menu_items.category`

- `main`
- `side`
- `drink`
- `dessert`
- `other`

#### `expenses.source`

- `manual`
- `receipt-scan`

#### `export_jobs.job_type`

- `lhdn-export-pack`

#### `export_jobs.status`

- `requested`
- `generated`
- `failed`

#### `generated_documents.document_type`

- `profit-loss`
- `borang-b-summary`
- `cp500-summary`
- `consolidated-einvoice`

#### `generated_documents.status`

- `generated`
- `failed`

#### `generated_documents.storage_provider`

- `s3`

#### `chat_sessions.status`

- `active`
- `closed`

#### `merchants.registration_type`

- `BRN`
- `NRIC`
- `PASSPORT`
- `ARMY`

#### `merchants.business_type`

- `warung`
- `food_stall`
- `drink_stall`
- `mobile_cart`
- `coffee_shop`
- `restaurant`
- `market_stall`
- `retail_kiosk`
- `other`

#### `menu_items.tax_rate_mode`

DB values:

- `percentage`
- `per_unit`

Wire values:

- `percentage`
- `perUnit`

#### Compliance review status

DB values:

- `pending_review`
- `reviewed`

Wire values:

- `pendingReview`
- `reviewed`

Applies to:

- `menu_items.compliance_review_status`
- `order_items.compliance_review_status_snapshot`

### 6.2 MyInvois tax type codes

- `01` Sales Tax
- `02` Service Tax
- `03` Tourism Tax
- `04` High-Value Goods Tax
- `05` Sales Tax on Low Value Goods
- `06` Not Applicable
- `E` Tax exemption

Rules:

- `06` means no tax applies
- `E` means exempt and should normally carry `tax_exemption_reason`
- `tax_code` does not determine numeric rate by itself

### 6.3 MyInvois classification codes

Allowed full list:

- `001` Breastfeeding equipment
- `002` Child care centres and kindergartens fees
- `003` Computer, smartphone or tablet
- `004` Consolidated e-Invoice
- `005` Construction materials
- `006` Disbursement
- `007` Donation
- `008` e-Commerce - e-Invoice to buyer / purchaser
- `009` e-Commerce - Self-billed e-Invoice to seller, logistics, etc.
- `010` Education fees
- `011` Goods on consignment (Consignor)
- `012` Goods on consignment (Consignee)
- `013` Gym membership
- `014` Insurance - Education and medical benefits
- `015` Insurance - Takaful or life insurance
- `016` Interest and financing expenses
- `017` Internet subscription
- `018` Land and building
- `019` Medical examination for learning disabilities and early intervention or rehabilitation treatments of learning disabilities
- `020` Medical examination or vaccination expenses
- `021` Medical expenses for serious diseases
- `022` Others
- `023` Petroleum operations
- `024` Private retirement scheme or deferred annuity scheme
- `025` Motor vehicle
- `026` Subscription of books / journals / magazines / newspapers / other similar publications
- `027` Reimbursement
- `028` Rental of motor vehicle
- `029` EV charging facilities
- `030` Repair and maintenance
- `031` Research and development
- `032` Foreign income
- `033` Self-billed - Betting and gaming
- `034` Self-billed - Importation of goods
- `035` Self-billed - Importation of services
- `036` Self-billed - Others
- `037` Self-billed - Monetary payment to agents, dealers or distributors
- `038` Sports equipment / sports fees / sports training fees
- `039` Supporting equipment for disabled person
- `040` Voluntary contribution to approved provident fund
- `041` Dental examination or treatment
- `042` Fertility treatment
- `043` Treatment and home care nursing, daycare centres and residential care centers
- `044` Vouchers, gift cards, loyalty points, etc
- `045` Self-billed - Non-monetary payment to agents, dealers or distributors

MVP default:

- Usually default to `022` unless merchant explicitly chooses a better valid code

### 6.4 MyInvois state codes

Full current list:

- `01` Johor
- `02` Kedah
- `03` Kelantan
- `04` Melaka
- `05` Negeri Sembilan
- `06` Pahang
- `07` Pulau Pinang
- `08` Perak
- `09` Perlis
- `10` Selangor
- `11` Terengganu
- `12` Sabah
- `13` Sarawak
- `14` Wilayah Persekutuan Kuala Lumpur
- `15` Wilayah Persekutuan Labuan
- `16` Wilayah Persekutuan Putrajaya
- `17` Not Applicable

MVP restriction:

- `merchants.state_code` must be `01`-`16`
- `17` must not be used for a normal merchant address row

### 6.5 MyInvois unit codes: MVP-allowed subset

- `C62` one
- `DZN` dozen
- `KGM` kilogram
- `GRM` gram
- `LTR` litre
- `MLT` millilitre
- `HUR` hour
- `DAY` day
- `MON` month
- `ANN` year

Default:

- For ordinary countable menu items, default to `C62`

### 6.6 Country code: MVP-allowed subset

- `MYS` Malaysia

### 6.7 MSIC codes: MVP-allowed subset

- `56106` Food stalls/hawkers
- `56107` Food or beverage, food and beverage preparation in market stalls/hawkers
- `56303` Drink stalls/hawkers
- `56105` Mobile food carts
- `47810` Retail sale of food, beverages and tobacco products via stalls or markets
- `56101` Restaurants and restaurant cum night clubs
- `56103` Fast-food restaurants
- `56302` Coffee shops
- `00000` Not Applicable

Default:

- Use `56106` for a typical warung / hawker merchant unless another listed code fits better

## 7. Database Schema

### 7.1 Reference tables

Create and seed these first:

- `ref_myinvois_tax_types`
- `ref_myinvois_classification_codes`
- `ref_myinvois_unit_types`
- `ref_myinvois_state_codes`
- `ref_myinvois_country_codes`
- `ref_myinvois_msic_codes`

### 7.2 `merchants`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BIGSERIAL PK | yes | |
| `business_name` | TEXT | yes | |
| `owner_name` | TEXT | yes | |
| `business_type` | TEXT | yes | App enum |
| `tin` | TEXT | yes | |
| `registration_type` | TEXT | yes | App enum |
| `registration_number` | TEXT | yes | |
| `sst_registration_number` | TEXT | no | `NA` allowed |
| `ttx_registration_number` | TEXT | no | `NA` allowed |
| `msic_code` | TEXT FK | yes | -> `ref_myinvois_msic_codes.code` |
| `business_activity_description` | TEXT | yes | |
| `phone` | TEXT | yes | |
| `email` | TEXT | no | |
| `address_line1` | TEXT | yes | |
| `address_line2` | TEXT | no | |
| `city` | TEXT | yes | |
| `state_code` | TEXT FK | yes | -> `ref_myinvois_state_codes.code` |
| `postcode` | TEXT | yes | |
| `country_code` | TEXT FK | yes | -> `ref_myinvois_country_codes.code` |
| `created_at` | TIMESTAMPTZ | yes | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | yes | default `NOW()` |

Constraints:

- `registration_type IN ('BRN', 'NRIC', 'PASSPORT', 'ARMY')`
- `business_type IN ('warung', 'food_stall', 'drink_stall', 'mobile_cart', 'coffee_shop', 'restaurant', 'market_stall', 'retail_kiosk', 'other')`
- `state_code IN ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16')`
- `country_code = 'MYS'`

Indexes:

- PK `id`
- index on `tin`

### 7.3 `menu_items`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BIGSERIAL PK | yes | |
| `merchant_id` | BIGINT FK | yes | -> `merchants.id` |
| `name` | TEXT | yes | |
| `price_cents` | INT | yes | tax-exclusive selling price |
| `category` | TEXT | yes | app enum |
| `unit_code` | TEXT FK | no | -> `ref_myinvois_unit_types.code` |
| `classification_code` | TEXT FK | no | -> `ref_myinvois_classification_codes.code` |
| `tax_code` | TEXT FK | no | -> `ref_myinvois_tax_types.code` |
| `tax_rate_mode` | TEXT | no | `percentage` / `per_unit` |
| `tax_rate_bps` | INT | no | percentage-only |
| `tax_per_unit_cents` | INT | no | fixed per-unit tax |
| `tax_exemption_reason` | TEXT | no | |
| `compliance_review_status` | TEXT | yes | `pending_review` / `reviewed` |
| `compliance_reviewed_at` | TIMESTAMPTZ | no | |
| `color` | TEXT | yes | system assigned |
| `display_order` | INT | yes | |
| `is_active` | BOOLEAN | yes | archive flag |
| `created_at` | TIMESTAMPTZ | yes | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | yes | default `NOW()` |

Constraints:

- `price_cents > 0`
- `category IN ('main', 'side', 'drink', 'dessert', 'other')`
- `compliance_review_status IN ('pending_review', 'reviewed')`
- `tax_rate_mode IS NULL OR tax_rate_mode IN ('percentage', 'per_unit')`
- `tax_rate_bps IS NULL OR tax_rate_bps >= 0`
- `tax_per_unit_cents IS NULL OR tax_per_unit_cents > 0`
- `tax_rate_mode = 'percentage'` -> `tax_rate_bps` required and `tax_per_unit_cents` null
- `tax_rate_mode = 'per_unit'` -> `tax_per_unit_cents` required and `tax_rate_bps` null

Indexes:

- `(merchant_id, is_active, display_order)`

### 7.4 `orders`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BIGSERIAL PK | yes | |
| `merchant_id` | BIGINT FK | yes | -> `merchants.id` |
| `subtotal_cents` | INT | yes | tax-exclusive subtotal |
| `tax_cents` | INT | yes | summed tax |
| `total_cents` | INT | yes | payable amount |
| `payment_reference` | TEXT | yes | unique |
| `qr_payload` | TEXT | yes | |
| `paid_at` | TIMESTAMPTZ | no | |
| `created_at` | TIMESTAMPTZ | yes | |
| `updated_at` | TIMESTAMPTZ | yes | |

Constraints:

- `subtotal_cents > 0`
- `tax_cents >= 0`
- `total_cents > 0`
- `total_cents = subtotal_cents + tax_cents`

Indexes:

- unique `payment_reference`
- `(merchant_id, paid_at DESC)`
- `(merchant_id, created_at DESC)`

State:

- `paid_at IS NULL` -> `pending_payment`
- `paid_at IS NOT NULL` -> `paid`

### 7.5 `order_items`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BIGSERIAL PK | yes | |
| `merchant_id` | BIGINT FK | yes | -> `merchants.id` |
| `order_id` | BIGINT FK | yes | -> `orders.id` |
| `menu_item_id` | BIGINT FK | yes | -> `menu_items.id` |
| `item_name_snapshot` | TEXT | yes | |
| `qty` | NUMERIC(12,5) | yes | supports fractional units |
| `unit_price_cents` | INT | yes | tax-exclusive historical price |
| `unit_code_snapshot` | TEXT FK | no | |
| `classification_code_snapshot` | TEXT FK | no | |
| `tax_code_snapshot` | TEXT FK | no | |
| `tax_rate_mode_snapshot` | TEXT | no | |
| `tax_rate_bps_snapshot` | INT | no | |
| `tax_per_unit_cents_snapshot` | INT | no | |
| `tax_exemption_reason_snapshot` | TEXT | no | |
| `compliance_review_status_snapshot` | TEXT | yes | |
| `created_at` | TIMESTAMPTZ | yes | |

Constraints:

- `qty > 0`
- `unit_price_cents > 0`
- `tax_rate_mode_snapshot IS NULL OR tax_rate_mode_snapshot IN ('percentage', 'per_unit')`
- `tax_rate_bps_snapshot IS NULL OR tax_rate_bps_snapshot >= 0`
- `tax_per_unit_cents_snapshot IS NULL OR tax_per_unit_cents_snapshot > 0`
- `compliance_review_status_snapshot IN ('pending_review', 'reviewed')`
- `tax_rate_mode_snapshot = 'percentage'` -> `tax_rate_bps_snapshot` required and `tax_per_unit_cents_snapshot` null
- `tax_rate_mode_snapshot = 'per_unit'` -> `tax_per_unit_cents_snapshot` required and `tax_rate_bps_snapshot` null

Indexes:

- `(merchant_id, order_id)`
- `(menu_item_id)`

Rule:

- Every field needed to reconstruct historical LHDN exports must be snapshotted here at sale time
- Snapshot fields may be null for sales made before compliance review was complete, but those lines must fail export validation later

### 7.6 `expenses`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BIGSERIAL PK | yes | |
| `merchant_id` | BIGINT FK | yes | -> `merchants.id` |
| `expense_date` | DATE | yes | |
| `amount_cents` | INT | yes | |
| `description` | TEXT | yes | |
| `source` | TEXT | yes | app enum |
| `receipt_s3_key` | TEXT | no | |
| `created_at` | TIMESTAMPTZ | yes | |
| `updated_at` | TIMESTAMPTZ | yes | |

Constraints:

- `amount_cents > 0`
- `source IN ('manual', 'receipt-scan')`

Indexes:

- `(merchant_id, expense_date DESC)`

### 7.7 `chat_sessions`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BIGSERIAL PK | yes | |
| `merchant_id` | BIGINT FK | yes | -> `merchants.id` |
| `ai_session_id` | TEXT | yes | opaque session id returned by `ai/` |
| `status` | TEXT | yes | `active` / `closed` |
| `created_at` | TIMESTAMPTZ | yes | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | yes | default `NOW()` |
| `last_message_at` | TIMESTAMPTZ | no | |

Constraints:

- `status IN ('active', 'closed')`

Indexes:

- unique `ai_session_id`
- `(merchant_id, created_at DESC)`
- `(merchant_id, last_message_at DESC)`

Rule:

- `chat_sessions` is the API-owned merchant/session binding used to authorize chat continuation
- `ai_session_id` is the canonical session identifier returned to `web/` and forwarded back to `ai/`

### 7.8 `export_jobs`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BIGSERIAL PK | yes | |
| `merchant_id` | BIGINT FK | yes | -> `merchants.id` |
| `job_type` | TEXT | yes | `lhdn-export-pack` |
| `period_from` | DATE | yes | inclusive |
| `period_to` | DATE | yes | inclusive |
| `status` | TEXT | yes | |
| `error_message` | TEXT | no | |
| `completed_at` | TIMESTAMPTZ | no | |
| `created_at` | TIMESTAMPTZ | yes | |
| `updated_at` | TIMESTAMPTZ | yes | |

Constraints:

- `job_type = 'lhdn-export-pack'`
- `status IN ('requested', 'generated', 'failed')`
- `period_from <= period_to`

Indexes:

- `(merchant_id, created_at DESC)`

### 7.9 `generated_documents`

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BIGSERIAL PK | yes | |
| `export_job_id` | BIGINT FK | yes | -> `export_jobs.id` |
| `merchant_id` | BIGINT FK | yes | -> `merchants.id` |
| `document_type` | TEXT | yes | |
| `status` | TEXT | yes | |
| `file_name` | TEXT | yes | |
| `mime_type` | TEXT | yes | |
| `storage_provider` | TEXT | yes | `s3` |
| `storage_key` | TEXT | no | |
| `payload_json` | JSONB | no | structured artifact data |
| `generated_at` | TIMESTAMPTZ | no | |
| `created_at` | TIMESTAMPTZ | yes | |
| `updated_at` | TIMESTAMPTZ | yes | |

Constraints:

- `document_type IN ('profit-loss', 'borang-b-summary', 'cp500-summary', 'consolidated-einvoice')`
- `status IN ('generated', 'failed')`
- `storage_provider = 's3'`

Indexes:

- unique `(export_job_id, document_type)`
- `(merchant_id, generated_at DESC)`

## 8. Core Business Logic

### 8.1 Menu parsing and review

- `POST /v1/menu/parse` and `ai /v1/parse-menu` are stateless
- AI must treat compliance-like metadata as draft suggestions, not truth
- AI must emit restricted **codes**, not human labels, for fields such as `unitCode`, `classificationCode`, `taxCode`, `stateCode`, and `msicCode`
- If AI cannot infer a credible restricted value, omit it rather than inventing a code
- `api` assigns UI defaults such as `color`, `display_order`, fallback `category`
- Items created through AI onboarding default to `compliance_review_status = 'pending_review'`
- Merchant review through menu editing may transition item to `reviewed`
- Formal exports should only rely on reviewed compliance metadata or reviewed sale-time snapshots

### 8.2 Order pricing and tax semantics

- `menu_items.price_cents` and `order_items.unit_price_cents` are tax-exclusive prices
- `orders.subtotal_cents` is the sum of tax-exclusive line subtotals
- `orders.tax_cents` is the sum of line tax amounts
- `orders.total_cents` is the payable QR amount
- When fractional quantity multiplies a cent-denominated integer value, round the line-level money result to nearest cent before summing

### 8.3 Order creation

On `POST /v1/orders`:

1. Validate every `menuItemId`
2. Validate `qty > 0`
3. Copy sale-time item and compliance/tax data into `order_items`
4. Compute line subtotal, line tax, order subtotal, order tax, order total
5. Generate unique `payment_reference`
6. Generate dummy `qr_payload`
7. Insert `orders` and `order_items`

### 8.4 Payment completion

- `POST /v1/orders/:id/paid` is idempotent
- If `paid_at` already exists, return original value
- Finance/reporting must use `paid_at`, not `created_at`

### 8.5 Dashboard semantics

- Order/card `totalCents` is gross payable amount
- Item/trend/heatmap `revenueCents` is tax-exclusive merchandise revenue

### 8.6 Chatbot rules

- `api` authenticates merchant and forwards trusted merchant context
- `api` owns chat session creation and merchant/session binding persistence
- `web/` never sends DB credentials or a merchant-scoping token directly to `ai/`
- `merchantId` supplied by `api/` is the scoping input that `ai/` uses for merchant-limited read access
- `POST /v1/chat/sessions` creates the session; `GET /v1/chat/sessions/:id/messages` fetches it; `POST /v1/chat/sessions/:id/messages` continues it
- `api` must reject any session lookup where `chat_sessions.merchant_id` does not match the authenticated merchant
- `api` does not persist or replay prior chat messages
- `ai` owns session history and loads prior messages using `sessionId`
- `ai` uses the shared PostgreSQL instance only through merchant-scoped read-only access
- Shared merchant data remains API-owned even when `ai` reads it directly
- `ai` may write only to its own session store, never to the shared merchant PostgreSQL data store
- Query limits, row limits, and timeouts must be enforced
- Prefer parameterized helpers or merchant-scoped views over unconstrained free-form SQL

### 8.7 Export validation rules

LHDN export generation must fail if:

- any included sold line has `compliance_review_status_snapshot != 'reviewed'`
- required export range is invalid
- required merchant profile fields are incomplete

### 8.8 Merchant profile completeness rule

`profile_complete = 1` only when these are populated:

- `business_name`
- `owner_name`
- `business_type`
- `tin`
- `registration_type`
- `registration_number`
- `msic_code`
- `business_activity_description`
- `phone`
- `address_line1`
- `city`
- `state_code`
- `country_code`
- `postcode`

Else `profile_complete = 0`.

### 8.9 Scorecard formulas

#### Stability

Inputs:

- `active_days`
- `total_days = 30`
- `daily_revenue_excl_tax_cents[]`

Formula:

- `active_days_ratio = active_days / 30`
- `revenue_cv = stddev_pop(daily_revenue_excl_tax_cents) / nullif(avg(daily_revenue_excl_tax_cents), 0)`
- `volatility_score = clamp(1 - revenue_cv, 0, 1)`
- `stability_score = 0.5 * active_days_ratio + 0.5 * volatility_score`

#### Margin

Inputs:

- `revenue_excl_tax_cents_90d`
- `expenses_cents_90d`

Formula:

- `gross_margin_pct = (revenue_excl_tax - expenses) / revenue_excl_tax * 100`
- `margin_score = clamp(gross_margin_pct / 30, 0, 1)`

#### Growth

Inputs:

- `month_1_revenue_excl_tax`
- `month_2_revenue_excl_tax`
- `month_3_revenue_excl_tax`

Formula:

- `month_over_month_pct = (month_3_revenue_excl_tax - month_2_revenue_excl_tax) / nullif(month_2_revenue_excl_tax, 0) * 100`
- `growth_score = clamp((month_over_month_pct + 20) / 40, 0, 1)`

#### Diligence

Inputs:

- `expense_entry_days_30d`
- `active_sales_days_30d`
- `export_generated_30d`
- `profile_complete`

Formula:

- `expense_capture_ratio = min(expense_entry_days_30d / max(active_sales_days_30d, 1), 1)`
- `diligence_score = 0.6 * expense_capture_ratio + 0.2 * export_generated_30d + 0.2 * profile_complete`

#### Overall

- `overall = 0.25 * stability + 0.35 * margin + 0.25 * growth + 0.15 * diligence`

## 9. LHDN Calculations

### 9.1 Period inclusion

For export range `[period_from, period_to]` inclusive in MYT:

- include order when `DATE(paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')` is within range
- include expense when `expense_date` is within range

### 9.2 Base line formulas

Let:

- `Q = order_items.qty`
- `P = order_items.unit_price_cents`

Historical tax/compliance fields come from sale-time snapshots on `order_items`.

#### Line subtotal

- `line_subtotal_cents = ROUND(qty * unit_price_cents)`

#### Line tax amount

```text
if tax_code_snapshot is null or tax_code_snapshot = '06':
  line_tax_amount_cents = 0
else if tax_code_snapshot = 'E':
  line_tax_amount_cents = 0
else if tax_rate_mode_snapshot = 'percentage':
  line_tax_amount_cents = ROUND(line_subtotal_cents * tax_rate_bps_snapshot / 10000.0)
else if tax_rate_mode_snapshot = 'per_unit':
  line_tax_amount_cents = ROUND(qty * tax_per_unit_cents_snapshot)
else:
  line_tax_amount_cents = 0
```

#### Line exempted amount

```text
if tax_code_snapshot = 'E':
  line_amount_exempted_from_tax_cents = line_subtotal_cents
else:
  line_amount_exempted_from_tax_cents = 0
```

#### Line total including tax

- `line_total_including_tax_cents = line_subtotal_cents + line_tax_amount_cents`

### 9.3 Period aggregation primitives

- `sales_excl_tax_cents = SUM(line_subtotal_cents)`
- `sales_tax_cents = SUM(line_tax_amount_cents)`
- `sales_incl_tax_cents = sales_excl_tax_cents + sales_tax_cents`
- `sales_tax_exempted_cents = SUM(line_amount_exempted_from_tax_cents)`
- `period_expenses_cents = SUM(expenses.amount_cents)`
- `period_days = (period_to - period_from) + 1`

### 9.4 Penyata Untung Rugi fields

- `reportingPeriodDays = period_days`
- `revenueExclTaxCents = sales_excl_tax_cents`
- `taxCollectedCents = sales_tax_cents`
- `revenueInclTaxCents = sales_incl_tax_cents`
- `allowableExpensesCents = period_expenses_cents`
- `grossProfitCents = revenueExclTaxCents - allowableExpensesCents`
- `netBusinessProfitCents = revenueExclTaxCents - allowableExpensesCents`
- `netBusinessLossCents = ABS(MIN(netBusinessProfitCents, 0))`
- `positiveNetBusinessIncomeCents = MAX(netBusinessProfitCents, 0)`

### 9.5 Borang B reference summary fields

- `assessmentYear = YEAR(period_to in MYT)`
- `annualBusinessRevenueExclTaxCents = sales_excl_tax_cents over assessment-year range`
- `annualTaxCollectedCents = sales_tax_cents over assessment-year range`
- `annualAllowableExpensesCents = period_expenses_cents over assessment-year range`
- `annualNetBusinessIncomeCents = annualBusinessRevenueExclTaxCents - annualAllowableExpensesCents`
- `annualBusinessLossCents = ABS(MIN(annualNetBusinessIncomeCents, 0))`
- `annualPositiveBusinessIncomeCents = MAX(annualNetBusinessIncomeCents, 0)`

### 9.6 CP500 reference summary fields

- `basisPeriodDays = period_days`
- `periodNetBusinessIncomeCents = revenueExclTaxCents - allowableExpensesCents`
- `annualizedNetBusinessIncomeCents = ROUND(MAX(periodNetBusinessIncomeCents, 0) * 365.0 / basisPeriodDays)`
- `installmentCount = 6`
- `indicativeBusinessIncomeBasisPerInstallmentCents = ROUND(annualizedNetBusinessIncomeCents / 6.0)`

### 9.7 Consolidated e-Invoice grouping key

Group source order lines by:

`(item_name_snapshot, unit_price_cents, unit_code_snapshot, classification_code_snapshot, tax_code_snapshot, tax_rate_mode_snapshot, tax_rate_bps_snapshot, tax_per_unit_cents_snapshot, tax_exemption_reason_snapshot)`

### 9.8 Consolidated e-Invoice line fields

- `lineQuantity = SUM(qty)`
- `lineUnitPriceCents = unit_price_cents`
- `lineSubtotalCents = SUM(source line_subtotal_cents)`
- `lineTaxableAmountCents = lineSubtotalCents`
- `lineTaxAmountCents = SUM(source line_tax_amount_cents)`
- `lineAmountExemptedFromTaxCents = SUM(source line_amount_exempted_from_tax_cents)`
- `lineTotalIncludingTaxCents = lineSubtotalCents + lineTaxAmountCents`

### 9.9 Consolidated e-Invoice document totals

- `includedPaidOrdersCount = COUNT(DISTINCT orders.id)`
- `includedOrderLinesCount = COUNT(order_items.id)`
- `documentTotalExclTaxCents = SUM(lineSubtotalCents)`
- `documentTotalTaxAmountCents = SUM(lineTaxAmountCents)`
- `documentTotalInclTaxCents = documentTotalExclTaxCents + documentTotalTaxAmountCents`
- `documentPayableAmountCents = documentTotalInclTaxCents`
- `documentPayableRoundingAmountCents = 0`
- `documentDiscountTotalCents = 0`
- `documentChargeTotalCents = 0`

### 9.10 Tax subtotals by tax type

For each distinct `tax_code_snapshot`:

- `taxSubtotalTaxableAmountCents(tax_code) = SUM(lineTaxableAmountCents where line.tax_code_snapshot = tax_code)`
- `taxSubtotalTaxAmountCents(tax_code) = SUM(lineTaxAmountCents where line.tax_code_snapshot = tax_code)`
- `taxSubtotalAmountExemptedCents(tax_code) = SUM(lineAmountExemptedFromTaxCents where line.tax_code_snapshot = tax_code)`

### 9.11 Document identity fields

- `invoiceNumber = 'CEI-' || TO_CHAR(period_from, 'YYYYMMDD') || '-' || TO_CHAR(period_to, 'YYYYMMDD') || '-' || LPAD(export_job_id::text, 6, '0')`
- `issueDateUtc = DATE(generation_timestamp_utc)`
- `issueTimeUtc = TIME(generation_timestamp_utc)`

## 10. Export Pack Output Model

Each successful LHDN export request creates one `export_job` and four `generated_documents`:

1. `profit-loss`
2. `borang-b-summary`
3. `cp500-summary`
4. `consolidated-einvoice`

Recommended representation per document:

- Human-readable PDF for demo and download
- `payload_json` snapshot for reproducibility and future integration

## 11. Migration Order

1. `ref_myinvois_tax_types`
2. `ref_myinvois_classification_codes`
3. `ref_myinvois_unit_types`
4. `ref_myinvois_state_codes`
5. `ref_myinvois_country_codes`
6. `ref_myinvois_msic_codes`
7. `merchants`
8. `menu_items`
9. `orders`
10. `order_items`
11. `expenses`
12. `chat_sessions`
13. `export_jobs`
14. `generated_documents`

## 12. Key API Surface

`api/`:

- `POST /v1/menu/parse`
- `GET /v1/menu`
- `POST /v1/menu`
- `POST /v1/orders`
- `POST /v1/orders/:id/paid`
- `GET /v1/stats/today`
- `GET /v1/stats/heatmap`
- `GET /v1/stats/growth`
- `POST /v1/chat/sessions`
- `GET /v1/chat/sessions/:id/messages`
- `POST /v1/chat/sessions/:id/messages`
- `GET /v1/scorecard`
- `POST /v1/exports/lhdn`
- `POST /v1/credit/apply`
- `GET /health`

`ai/`:

- `POST /v1/chat/sessions`
- `GET /v1/chat/sessions/:id/messages`
- `POST /v1/parse-menu`
- `POST /v1/ask`
- `POST /v1/anomaly` (optional)
- `GET /health`

## 13. Explicit MVP Omissions

Not modeled in v1:

- real tax payable computation
- personal reliefs
- non-business income
- inventory / COGS model
- depreciation / capital allowance
- actual CP500 liability
- multi-classification-per-line
- multi-tax-subtotal-per-line beyond the simplified primary tax profile model
- real payment integration
- real loan origination
