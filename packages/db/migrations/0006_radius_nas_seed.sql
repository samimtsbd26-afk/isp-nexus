-- Migrate NAS entries from static clients.conf into the nas table.
-- FreeRADIUS already reads from this table (client_table = "nas" in sql.conf).
-- After verifying these entries work, the entries in clients.conf can be removed.

INSERT INTO "nas" ("nasname", "shortname", "type", "secret", "description")
VALUES
  ('127.0.0.1',    'localhost',       'other', 'CHANGE_ME_RADIUS_SECRET', 'Localhost'),
  ('172.16.0.0/12','docker_network',  'other', 'CHANGE_ME_RADIUS_SECRET', 'Docker internal network'),
  ('10.8.0.0/24',  'wireguard',       'other', 'CHANGE_ME_RADIUS_SECRET', 'WireGuard tunnel network')
ON CONFLICT DO NOTHING;
