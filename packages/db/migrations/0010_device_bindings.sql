-- Add device_bindings table for MAC/IP binding per customer
-- Used by Reset Device flow: clears bindings + Redis sessions on demand

CREATE TABLE IF NOT EXISTS device_bindings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id     uuid        NOT NULL REFERENCES customers(id)     ON DELETE CASCADE,
  router_id       uuid                 REFERENCES routers(id)       ON DELETE SET NULL,
  mac_address     varchar(17) NOT NULL,
  ip_address      varchar(50),
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_bindings_customer ON device_bindings(customer_id);
CREATE INDEX IF NOT EXISTS idx_device_bindings_org      ON device_bindings(org_id);
