-- PPPoE RADIUS accounting fix
-- Adds framedprotocol column and relaxes NOT NULL on IPv6/terminate columns
-- Required for FreeRADIUS to write Accounting-Start and Accounting-Stop records
-- for PPPoE sessions (IPv6 attributes are NULL for IPv4-only sessions)

ALTER TABLE radacct ADD COLUMN IF NOT EXISTS framedprotocol VARCHAR(64);

ALTER TABLE radacct
  ALTER COLUMN framedipv6address   DROP NOT NULL,
  ALTER COLUMN framedipv6prefix    DROP NOT NULL,
  ALTER COLUMN framedinterfaceid   DROP NOT NULL,
  ALTER COLUMN delegatedipv6prefix DROP NOT NULL,
  ALTER COLUMN acctterminatecause  DROP NOT NULL,
  ALTER COLUMN framedipaddress     DROP NOT NULL;
