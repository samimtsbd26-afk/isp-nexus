-- P4: Reseller system tables + billing automation columns

-- Resellers: maps a user to a reseller profile with commission % and wallet
CREATE TABLE IF NOT EXISTS resellers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  commission_pct   real        NOT NULL DEFAULT 0,
  wallet_balance_bdt integer   NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Reseller ↔ Customer assignments
CREATE TABLE IF NOT EXISTS reseller_customers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reseller_id  uuid        NOT NULL REFERENCES resellers(id)     ON DELETE CASCADE,
  customer_id  uuid        NOT NULL REFERENCES customers(id)     ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reseller_id, customer_id)
);

-- Per-order commission tracking
CREATE TABLE IF NOT EXISTS reseller_commissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reseller_id  uuid        NOT NULL REFERENCES resellers(id)     ON DELETE CASCADE,
  order_id     uuid        NOT NULL REFERENCES orders(id)        ON DELETE CASCADE,
  amount_bdt   integer     NOT NULL,
  status       varchar(20) NOT NULL DEFAULT 'pending',
  paid_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reseller_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_resellers_org         ON resellers(org_id);
CREATE INDEX IF NOT EXISTS idx_reseller_customers_rc ON reseller_customers(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_comm_rs      ON reseller_commissions(reseller_id, status);

-- Billing automation columns on invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS late_fee_bdt integer NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz;
