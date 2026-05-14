-- Add provisioning tracking and port-plan to routers table

ALTER TABLE routers
  ADD COLUMN IF NOT EXISTS provision_status  varchar(20)  NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provision_error   text,
  ADD COLUMN IF NOT EXISTS provision_pushed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS port_plan         jsonb;

-- port_plan shape:
-- {
--   "wan":              "ether1",
--   "hotspot":          "ether2",
--   "pppoe":            "ether3",
--   "lan":              "ether4",
--   "admin":            "ether5",
--   "hotspotSubnet":    "192.168.88.0/24",
--   "hotspotPool":      "192.168.88.10-192.168.88.254",
--   "hotspotGateway":   "192.168.88.1",
--   "pppoeLocalPool":   "10.10.0.0/24",
--   "lanSubnet":        "192.168.1.0/24",
--   "lanGateway":       "192.168.1.1"
-- }

-- provision_status values: pending | provisioning | provisioned | error
