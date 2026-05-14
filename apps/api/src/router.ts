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
import { wirelessRouter } from "./routers/wireless.js";
import { paymentRouter } from "./routers/payment.js";
import { aiRouter } from "./routers/ai.js";
import { caddyRouter } from "./routers/caddy.js";
import { wireguardRouter } from "./routers/wireguard.js";
import { radiusRouter } from "./routers/radius.js";
import { systemRouter } from "./routers/system.js";
import { resellerRouter } from "./routers/reseller.js";
import { billingRouter } from "./routers/billing.js";
import { performanceRouter } from "./routers/performance.js";

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
  wireless: wirelessRouter,
  payment: paymentRouter,
  ai: aiRouter,
  caddy: caddyRouter,
  wireguard: wireguardRouter,
  radius: radiusRouter,
  system: systemRouter,
  reseller: resellerRouter,
  billing: billingRouter,
  performance: performanceRouter,
});

export type AppRouter = typeof appRouter;
