
const { getMikroTikClient } = require('/app/apps/api/src/services/mikrotik/client.js');
const { createDb } = require('@isp-nexus/db');
const { env } = require('/app/apps/api/src/lib/env.js');
const { routers } = require('@isp-nexus/db');
const { eq } = require('drizzle-orm');
const { decryptText } = require('/app/apps/api/src/lib/crypto.js');

async function main() {
  const db = createDb(env.DATABASE_URL);
  const r = await db.select().from(routers).where(eq(routers.host, '10.8.0.2')).limit(1);
  if (!r.length) { console.log('Router not found'); return; }
  const router = r[0];
  const password = decryptText(router.passwordEncrypted);
  const client = await getMikroTikClient({ host: router.host, port: router.port, username: router.username, password, useSsl: router.useSsl });
  
  const radiusServers = await client.print('/radius');
  console.log('RADIUS servers:', JSON.stringify(radiusServers, null, 2));
  
  await client.close();
}
main().catch(console.error);
