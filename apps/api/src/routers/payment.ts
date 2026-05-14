import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../middleware.js";
import { orders } from "@isp-nexus/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// Payment gateway stub — validates TRX ID format and uniqueness
// Real bKash/Nagad API integration can be added later

const validatePaymentSchema = z.object({
  orderId: z.string().uuid(),
  paymentMethod: z.enum(["bkash", "nagad", "rocket"]),
  trxId: z.string().min(8).max(30),
  paymentFrom: z.string().min(10).max(15), // Phone number
});

// TRX ID format patterns
const TRX_PATTERNS = {
  bkash: /^[A-Z0-9]{8,20}$/i,
  nagad: /^[A-Z0-9]{8,20}$/i,
  rocket: /^[A-Z0-9]{8,20}$/i,
};

export const paymentRouter = router({
  validatePayment: publicProcedure
    .input(validatePaymentSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Validate TRX ID format
      const pattern = TRX_PATTERNS[input.paymentMethod];
      if (!pattern.test(input.trxId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ট্রানজাকশন আইডির ফরম্যাট সঠিক নয়",
        });
      }

      // 2. Check TRX ID uniqueness
      const [existing] = await ctx.db
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(and(
          eq(orders.paymentMethod, input.paymentMethod),
          eq(orders.trxId, input.trxId),
        ))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "এই ট্রানজাকশন আইডি আগেই ব্যবহার করা হয়েছে",
        });
      }

      // 3. Validate phone format (Bangladesh)
      const phoneClean = input.paymentFrom.replace(/\D/g, "");
      if (!/^01[3-9]\d{8}$/.test(phoneClean)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "বিকাশ/নগদ নম্বর সঠিক নয় (01XXXXXXXXX)",
        });
      }

      // 4. Update order with payment info (pending admin approval)
      await ctx.db
        .update(orders)
        .set({
          trxId: input.trxId,
          paymentFrom: input.paymentFrom,
          status: "pending", // Admin must approve
          updatedAt: new Date(),
        })
        .where(eq(orders.id, input.orderId));

      logger.info({
        orderId: input.orderId,
        paymentMethod: input.paymentMethod,
        trxId: input.trxId,
      }, "Payment submitted for validation");

      return {
        success: true,
        message: "পেমেন্ট জমা হয়েছে। অ্যাডমিন অনুমোদনের পর সাবস্ক্রিপশন সক্রিয় হবে।",
        status: "pending",
      };
    }),

  // Check payment status
  checkPaymentStatus: publicProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db
        .select({
          id: orders.id,
          status: orders.status,
          trxId: orders.trxId,
          paymentMethod: orders.paymentMethod,
          paymentFrom: orders.paymentFrom,
        })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);

      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "অর্ডার পাওয়া যায়নি" });
      }

      return {
        status: order.status,
        trxId: order.trxId,
        paymentMethod: order.paymentMethod,
        message: order.status === "approved"
          ? "পেমেন্ট অনুমোদিত"
          : order.status === "pending"
          ? "পেমেন্ট যাচাইয়ের অপেক্ষায়"
          : "পেমেন্ট বাতিল",
      };
    }),

  // Submit new payment (from hotspot portal)
  submitPortalPayment: publicProcedure
    .input(
      z.object({
        name: z.string().min(2),
        phone: z.string().regex(/^01\d{9}$/),
        trxId: z.string().min(5).max(50),
        amount: z.number().min(1),
        method: z.enum(["bkash", "nagad", "rocket"]),
        packageId: z.string().optional(),
        packageName: z.string().optional(),
        mac: z.string().optional(),
        ip: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check TRX ID uniqueness
      const [existing] = await ctx.db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.trxId, input.trxId))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "এই ট্রানজাকশন আইডি আগেই ব্যবহার করা হয়েছে",
        });
      }

      // Create order (no customer yet, will create on approval)
      const [order] = await ctx.db
        .insert(orders)
        .values({
          orgId: "00000000-0000-0000-0000-000000000000",
          customerId: "00000000-0000-0000-0000-000000000000", // Will update on approval
          amountBdt: input.amount,
          paymentMethod: input.method,
          trxId: input.trxId,
          paymentFrom: input.phone,
          status: "pending",
        })
        .returning();

      // Send Telegram notification
      try {
        const { notifyPaymentReceived } = await import("../services/telegram/bot.js");
        await notifyPaymentReceived({
          name: input.name,
          phone: input.phone,
          amount: input.amount,
          method: input.method,
          trxId: input.trxId,
          packageName: input.packageName || "Unknown",
        });
      } catch (e) {
        logger.error({ err: e }, "Telegram notification failed");
      }

      return {
        success: true,
        orderId: order.id,
        message: "পেমেন্ট জমা হয়েছে। অ্যাডমিন অনুমোদনের পর সাবস্ক্রিপশন সক্রিয় হবে।",
      };
    }),

});

// NOTE: listPending / approvePayment / rejectPayment are handled by orderRouter
// (order.listPending, order.approve, order.reject) which includes full
// MikroTik provisioning, invoice creation, Telegram notification, and orgId isolation.
