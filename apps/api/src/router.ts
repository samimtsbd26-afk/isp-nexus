import { router, publicProcedure } from "./middleware.js";
import { authRouter } from "./routers/auth.js";
import { routerMgmtRouter } from "./routers/router-mgmt.js";
import { mikrotikRouter } from "./routers/mikrotik.js";
import { customerRouter } from "./routers/customer.js";
import { packageRouter } from "./routers/package.js";
import { subscriptionRouter } from "./routers/subscription.js";
import { orderRouter } from "./routers/order.js";
import { invoiceRouter } from "./routers/invoice.js";
import { voucherRouter } from "./routers/voucher.js";
import { portalRouter } from "./routers/portal.js";
import { supportRouter } from "./routers/support.js";
import { monitoringRouter } from "./routers/monitoring.js";
import { analyticsRouter } from "./routers/analytics.js";
import { telegramRouter } from "./routers/telegram.js";
import { hotspotRouter } from "./routers/hotspot.js";
import { backupRouter } from "./routers/backup.js";
import { settingsRouter } from "./routers/settings.js";
import { activityRouter } from "./routers/activity.js";

export const appRouter = router({
  ping: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
  auth: authRouter,
  routerMgmt: routerMgmtRouter,
  mikrotik: mikrotikRouter,
  customer: customerRouter,
  package: packageRouter,
  subscription: subscriptionRouter,
  order: orderRouter,
  invoice: invoiceRouter,
  voucher: voucherRouter,
  portal: portalRouter,
  support: supportRouter,
  monitoring: monitoringRouter,
  analytics: analyticsRouter,
  telegram: telegramRouter,
  hotspot: hotspotRouter,
  backup: backupRouter,
  settings: settingsRouter,
  activity: activityRouter,
});

export type AppRouter = typeof appRouter;
