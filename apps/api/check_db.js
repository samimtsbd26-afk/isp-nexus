
const path = require('path');
// Use the dist build
const { createDb } = require('/app/packages/db/dist/index.js');
const { routers } = require('/app/packages/db/dist/schema/index.js');
const { eq } = require('/app/node_modules/drizzle-orm');

async function main() {
  const db = createDb(process.env.DATABASE_URL);
  const r = await db.select().from(routers).where(eq(routers.host, '10.8.0.2')).limit(1);
  console.log('Router found:', r.length > 0);
  if (r.length) {
    console.log('Router password_encrypted length:', r[0].passwordEncrypted?.length);
  }
}
main().catch(console.error);
