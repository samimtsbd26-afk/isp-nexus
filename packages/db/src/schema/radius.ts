import { pgTable, serial, bigserial, varchar, text, integer, timestamp, bigint, boolean } from "drizzle-orm/pg-core";

export const radcheck = pgTable("radcheck", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().default(""),
  attribute: varchar("attribute", { length: 64 }).notNull().default(""),
  op: varchar("op", { length: 2 }).notNull().default(":="),
  value: varchar("value", { length: 253 }).notNull().default(""),
});

export const radreply = pgTable("radreply", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().default(""),
  attribute: varchar("attribute", { length: 64 }).notNull().default(""),
  op: varchar("op", { length: 2 }).notNull().default("="),
  value: varchar("value", { length: 253 }).notNull().default(""),
});

export const radgroupcheck = pgTable("radgroupcheck", {
  id: serial("id").primaryKey(),
  groupname: varchar("groupname", { length: 64 }).notNull().default(""),
  attribute: varchar("attribute", { length: 64 }).notNull().default(""),
  op: varchar("op", { length: 2 }).notNull().default(":="),
  value: varchar("value", { length: 253 }).notNull().default(""),
});

export const radgroupreply = pgTable("radgroupreply", {
  id: serial("id").primaryKey(),
  groupname: varchar("groupname", { length: 64 }).notNull().default(""),
  attribute: varchar("attribute", { length: 64 }).notNull().default(""),
  op: varchar("op", { length: 2 }).notNull().default("="),
  value: varchar("value", { length: 253 }).notNull().default(""),
});

export const radusergroup = pgTable("radusergroup", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().default(""),
  groupname: varchar("groupname", { length: 64 }).notNull().default(""),
  priority: integer("priority").notNull().default(1),
});

export const radacct = pgTable("radacct", {
  radacctid: bigserial("radacctid", { mode: "number" }).primaryKey(),
  acctsessionid: varchar("acctsessionid", { length: 64 }).notNull().default(""),
  acctuniqueid: varchar("acctuniqueid", { length: 32 }).notNull().default("").unique(),
  username: varchar("username", { length: 64 }).notNull().default(""),
  realm: varchar("realm", { length: 64 }).default(""),
  nasipaddress: varchar("nasipaddress", { length: 15 }).notNull().default(""),
  nasportid: varchar("nasportid", { length: 15 }),
  nasporttype: varchar("nasporttype", { length: 32 }),
  acctstarttime: timestamp("acctstarttime", { withTimezone: true }),
  acctupdatetime: timestamp("acctupdatetime", { withTimezone: true }),
  acctstoptime: timestamp("acctstoptime", { withTimezone: true }),
  acctinterval: integer("acctinterval"),
  acctsessiontime: bigint("acctsessiontime", { mode: "number" }),
  acctauthentic: varchar("acctauthentic", { length: 32 }),
  connectinfo_start: text("connectinfo_start"),
  connectinfo_stop: text("connectinfo_stop"),
  acctinputoctets: bigint("acctinputoctets", { mode: "number" }),
  acctoutputoctets: bigint("acctoutputoctets", { mode: "number" }),
  calledstationid: varchar("calledstationid", { length: 50 }).notNull().default(""),
  callingstationid: varchar("callingstationid", { length: 50 }).notNull().default(""),
  acctterminatecause: varchar("acctterminatecause", { length: 32 }).notNull().default(""),
  servicetype: varchar("servicetype", { length: 32 }),
  framedprotocol: varchar("framedprotocol", { length: 32 }),
  framedipaddress: varchar("framedipaddress", { length: 15 }).notNull().default(""),
  framedipv6address: varchar("framedipv6address", { length: 45 }).notNull().default(""),
  framedipv6prefix: varchar("framedipv6prefix", { length: 45 }).notNull().default(""),
  framedinterfaceid: varchar("framedinterfaceid", { length: 44 }).notNull().default(""),
  delegatedipv6prefix: varchar("delegatedipv6prefix", { length: 45 }).notNull().default(""),
});

/** FreeRADIUS NAS / client table — read by FreeRADIUS via `client_table = "nas"` in sql.conf */
export const nas = pgTable("nas", {
  id: serial("id").primaryKey(),
  nasname: varchar("nasname", { length: 128 }).notNull(),
  shortname: varchar("shortname", { length: 32 }),
  type: varchar("type", { length: 30 }).default("other"),
  ports: integer("ports"),
  secret: varchar("secret", { length: 60 }).notNull().default("secret"),
  server: varchar("server", { length: 64 }),
  community: varchar("community", { length: 50 }),
  description: varchar("description", { length: 200 }).default("RADIUS Client"),
});
