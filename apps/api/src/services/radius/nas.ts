/**
 * RADIUS NAS registration helpers.
 * When a new MikroTik router is added, its WAN/peer IP must be registered in
 * the `nas` table so FreeRADIUS accepts auth/acct packets from it.
 * FreeRADIUS reads `nas` live via sql.conf → client_table = "nas".
 */

import { eq } from "drizzle-orm";
import type { Db } from "@isp-nexus/db";
import { nas } from "@isp-nexus/db";
import { env } from "../../lib/env.js";

export interface NasEntry {
  nasname: string;     // IP or CIDR the router sends RADIUS packets from
  shortname: string;   // label (router name, slugified)
  description?: string;
}

export async function registerRouterNas(db: Db, entry: NasEntry): Promise<void> {
  const secret = env.RADIUS_SECRET;
  const description = entry.description ?? `MikroTik router: ${entry.shortname}`;

  // Upsert: update if exists, insert if not
  const [existing] = await db.select({ id: nas.id }).from(nas)
    .where(eq(nas.nasname, entry.nasname)).limit(1);

  if (existing) {
    await db.update(nas).set({ shortname: entry.shortname, secret, description })
      .where(eq(nas.id, existing.id));
  } else {
    await db.insert(nas).values({
      nasname: entry.nasname,
      shortname: entry.shortname,
      type: "other",
      secret,
      description,
    });
  }
}

export async function deregisterRouterNas(db: Db, nasname: string): Promise<void> {
  await db.delete(nas).where(eq(nas.nasname, nasname));
}
