import { eq } from "drizzle-orm";
import { activityLog } from "@isp-nexus/db";

export async function logActivity(
  db: any,
  orgId: string,
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId: string,
  changes: Record<string, any>
) {
  try {
    await db.insert(activityLog).values({
      orgId,
      userId: userId ?? null,
      action,
      entityType,
      entityId,
      changes,
    });
  } catch (err) {
    // Fail silently — activity logging must not break business logic
    console.error("Activity log failed:", err);
  }
}
