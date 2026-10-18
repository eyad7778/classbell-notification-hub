import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  supabase: {
    rpc: (
      fn: "is_staff" | "has_role" | "has_staff_permission" | "set_staff_access",
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error?: { message: string } | null }>;
  };
  userId: string;
};

async function assertStaff(ctx: Ctx, ownerOnly = false, permission?: "students" | "payments" | "content" | "communications") {
  const { data: isOwner } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" });
  if (ownerOnly && !isOwner) throw new Error("غير مصرح لك بهذا الإجراء");
  if (!isOwner) {
    if (!permission) throw new Error("غير مصرح لك بهذا الإجراء");
    const { data } = await ctx.supabase.rpc("has_staff_permission", {
      _user_id: ctx.userId,
      _permission: permission,
    });
    if (!data) throw new Error("غير مصرح لك بهذا الإجراء");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function notifyUser(
  admin: Awaited<ReturnType<typeof assertStaff>>,
  userId: string,
  title: string,
  body: string,
  actor: string,
) {
  const { deliverTelegram, escapeHtml } = await import("@/lib/telegram.server");
  const { deliverPush } = await import("@/lib/push.server");
  const { data: n } = await admin
    .from("notifications")
    .insert({ user_id: userId, title, body, created_by: actor })
    .select("id")
    .single();
  if (n?.id) await deliverPush(admin, [userId], { title, body }).catch((e) => console.error(e));
  await deliverTelegram(
    admin,
    [userId],
    `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`,
    n?.id ?? null,
  ).catch((e) => console.error(e));
}

async function eligibleTargetUsers(
  admin: Awaited<ReturnType<typeof assertStaff>>,
  departmentIds: string[],
  levels: string[],
) {
  const now = new Date().toISOString();
  const [profiles, subscriptions, links] = await Promise.all([
    admin.from("profiles").select("id, department_id, level"),
    admin
      .from("subscriptions")
      .select("user_id")
      .eq("status", "active")
      .or(`end_at.is.null,end_at.gt.${now}`),
    admin.from("telegram_links").select("user_id").eq("blocked", false),
  ]);
  if (profiles.error || subscriptions.error || links.error)
    throw new Error("تعذّر تحديد الطلاب المستهدفين");
  const activeIds = new Set((subscriptions.data ?? []).map((s) => s.user_id));
  const linkedIds = new Set((links.data ?? []).map((l) => l.user_id));
  return (profiles.data ?? [])
    .filter(
      (p) =>
        (departmentIds.length === 0 ||
          (!!p.department_id && departmentIds.includes(p.department_id))) &&
        (levels.length === 0 || (!!p.level && levels.includes(p.level))) &&
        activeIds.has(p.id) &&
        linkedIds.has(p.id),
    )
    .map((p) => p.id);
}

export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "payments");
    const { data: pr } = await admin
      .from("payment_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!pr) throw new Error("الطلب غير موجود");
    if (pr.status !== "pending") throw new Error("تمت مراجعة هذا الطلب مسبقًا");
    if (data.approve && pr.receipt_path) {
      const { error } = await admin.storage.from("receipts").remove([pr.receipt_path]);
      if (error) throw new Error("تعذّر حذف صورة التحويل؛ لم يتم تفعيل الاشتراك");
    }
    const now = new Date();
    const { error: reviewError } = await admin
      .from("payment_requests")
      .update({
        status: data.approve ? "approved" : "rejected",
        receipt_path: data.approve ? null : pr.receipt_path,
        reviewed_by: context.userId,
        reviewed_at: now.toISOString(),
        review_note: data.note ?? null,
      })
      .eq("id", data.id);
    if (reviewError) throw new Error("تعذّر حفظ نتيجة مراجعة الدفع");

    if (data.approve) {
      const { data: cur } = await admin
        .from("subscriptions")
        .select("status, end_at")
        .eq("user_id", pr.user_id)
        .single();
      const base =
        cur?.status === "active" && cur.end_at && new Date(cur.end_at) > now
          ? new Date(cur.end_at)
          : now;
      const end = new Date(base.getTime() + 365 * 86_400_000);
      await admin
        .from("subscriptions")
        .update({
          status: "active",
          start_at: now.toISOString(),
          end_at: end.toISOString(),
          amount: pr.amount,
          payment_method: pr.method,
          payment_reference: pr.reference,
          activated_by: context.userId,
          activated_at: now.toISOString(),
        })
        .eq("user_id", pr.user_id);
      await admin
        .from("subscription_events")
        .update({ actor_id: context.userId })
        .eq("user_id", pr.user_id)
        .is("actor_id", null);
      await notifyUser(
        admin,
        pr.user_id,
        "تم تفعيل اشتراكك",
        `اشتراكك مفعّل حتى ${end.toLocaleDateString("ar-EG")}.`,
        context.userId,
      );
    } else {
      await admin
        .from("subscriptions")
        .update({ status: "rejected" })
        .eq("user_id", pr.user_id)
        .eq("status", "pending");
      await admin
        .from("subscription_events")
        .update({ actor_id: context.userId, note: data.note ?? null })
        .eq("user_id", pr.user_id)
        .is("actor_id", null);
      await notifyUser(
        admin,
        pr.user_id,
        "تم رفض طلب الدفع",
        data.note || "راجع بيانات الدفع وأعد الإرسال أو تواصل مع الدعم.",
        context.userId,
      );
    }
    return { ok: true };
  });

export const reviewStudentRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "students");
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("registration_status, id_card_path")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileError || !profile) throw new Error("تعذّر تحميل بيانات الحساب");
    if (profile.registration_status !== "pending") throw new Error("تمت مراجعة هذا الحساب مسبقًا");
    if (!profile.id_card_path) throw new Error("لا توجد صورة كارنيه لمراجعتها");

    const { error: deleteError } = await admin.storage
      .from("student-ids")
      .remove([profile.id_card_path]);
    if (deleteError) throw new Error("تعذّر حذف صورة الكارنيه؛ لم يتم تفعيل الحساب");

    const { error: updateError } = await admin
      .from("profiles")
      .update({ registration_status: "active", id_card_path: null })
      .eq("id", data.userId)
      .eq("registration_status", "pending");
    if (updateError) throw new Error("حُذفت الصورة لكن تعذّر تفعيل الحساب؛ راجع الحالة في قائمة الطلاب");

    await notifyUser(admin, data.userId, "تم تفعيل حسابك", "تمت مراجعة بياناتك، وأصبح حسابك مفعّلًا.", context.userId);
    return { ok: true };
  });

export const setSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["active", "suspended", "expired", "awaiting_payment"]),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "payments");
    if (data.status === "active") {
      const { data: requests, error: requestsError } = await admin
        .from("payment_requests")
        .select("id, receipt_path")
        .eq("user_id", data.userId)
        .not("receipt_path", "is", null);
      if (requestsError) throw new Error("تعذّر العثور على صور التحويل");
      const paths = (requests ?? []).map((request) => request.receipt_path).filter((path): path is string => !!path);
      if (paths.length) {
        const { error } = await admin.storage.from("receipts").remove(paths);
        if (error) throw new Error("تعذّر حذف صور التحويل؛ لم يتم تفعيل الاشتراك");
        const { error: clearError } = await admin
          .from("payment_requests")
          .update({ receipt_path: null })
          .eq("user_id", data.userId);
        if (clearError) throw new Error("تعذّر تنظيف مراجع صور التحويل");
      }
    }
    const patch: {
      status: typeof data.status;
      start_at?: string;
      end_at?: string;
      activated_by?: string;
      activated_at?: string;
    } = { status: data.status };
    if (data.status === "active") {
      const now = new Date();
      patch.start_at = now.toISOString();
      patch.end_at = new Date(
        now.getTime() + 365 * 86_400_000,
      ).toISOString();
      patch.activated_by = context.userId;
      patch.activated_at = now.toISOString();
    }
    const { error } = await admin.from("subscriptions").update(patch).eq("user_id", data.userId);
    if (error) throw new Error("تعذّر تحديث الاشتراك");
    await admin
      .from("subscription_events")
      .update({ actor_id: context.userId, note: data.note ?? null })
      .eq("user_id", data.userId)
      .is("actor_id", null);
    return { ok: true };
  });

export const sendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(2).max(120),
        body: z.string().min(2).max(2000),
        userId: z.string().uuid().nullable(),
        telegram: z.boolean(),
        targetDepartmentIds: z.array(z.string().uuid()).max(100).default([]),
        targetLevels: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "communications");
    const { data: n, error } = await admin
      .from("notifications")
      .insert({
        user_id: data.userId,
        title: data.title,
        body: data.body,
        created_by: context.userId,
        target_department_ids: data.targetDepartmentIds,
        target_levels: data.targetLevels,
      })
      .select("id")
      .single();
    if (error || !n) throw new Error("تعذّر حفظ الإشعار");
    const ids = data.userId
      ? [data.userId]
      : await eligibleTargetUsers(admin, data.targetDepartmentIds, data.targetLevels);
    const { deliverPush } = await import("@/lib/push.server");
    const push = await deliverPush(admin, ids, { title: data.title, body: data.body });
    if (!data.telegram) return { sent: 0, failed: 0, pushSent: push.sent, pushFailed: push.failed, pushConfigured: push.configured };
    const { deliverTelegram, escapeHtml } = await import("@/lib/telegram.server");
    const telegram = await deliverTelegram(admin, ids, `<b>${escapeHtml(data.title)}</b>\n${escapeHtml(data.body)}`, n.id);
    return { ...telegram, pushSent: push.sent, pushFailed: push.failed, pushConfigured: push.configured };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      makeStaff: z.boolean(),
      permissions: z.array(z.enum(["students", "payments", "content", "communications"])).max(4).default([]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx, true);
    const { error } = await (context as Ctx).supabase.rpc("set_staff_access", {
      _user_id: data.userId,
      _make_staff: data.makeStaff,
      _permissions: data.permissions,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetStudentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "students");
    const { data: isOwnerTarget } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId)
      .in("role", ["owner", "staff"]);
    if ((isOwnerTarget ?? []).length) await assertStaff(context as Ctx, true);
    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error("تعذّر تغيير كلمة المرور");
    return { ok: true };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "students");
    await admin.from("telegram_links").delete().eq("user_id", data.userId);
    return { ok: true };
  });

export const announceAndNotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(2).max(160),
        body: z.string().min(2).max(4000),
        category: z.string().max(40),
        pinned: z.boolean(),
        notify: z.boolean(),
        targetDepartmentIds: z.array(z.string().uuid()).max(100).default([]),
        targetLevels: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "communications");
    const { error } = await admin.from("announcements").insert({
      title: data.title,
      body: data.body,
      category: data.category,
      pinned: data.pinned,
      created_by: context.userId,
      target_department_ids: data.targetDepartmentIds,
      target_levels: data.targetLevels,
    });
    if (error) throw new Error("تعذّر نشر الإعلان");
    if (!data.notify) return { sent: 0, failed: 0, pushSent: 0, pushFailed: 0, pushConfigured: false };
    const { data: n, error: notificationError } = await admin
      .from("notifications")
      .insert({
        user_id: null,
        title: `إعلان جديد: ${data.title}`,
        body: data.body.slice(0, 300),
        link: "/app/announcements",
        created_by: context.userId,
        target_department_ids: data.targetDepartmentIds,
        target_levels: data.targetLevels,
      })
      .select("id")
      .single();
    if (notificationError || !n) throw new Error("تم نشر الإعلان لكن تعذّر إنشاء إشعاره");
    const ids = await eligibleTargetUsers(admin, data.targetDepartmentIds, data.targetLevels);
    const { deliverPush } = await import("@/lib/push.server");
    const push = await deliverPush(admin, ids, {
      title: `إعلان جديد: ${data.title}`,
      body: data.body.slice(0, 300),
      url: "/app/announcements",
    });
    const { deliverTelegram, escapeHtml } = await import("@/lib/telegram.server");
    const telegram = await deliverTelegram(admin, ids, `<b>📢 ${escapeHtml(data.title)}</b>\n${escapeHtml(data.body.slice(0, 900))}`, n.id);
    return { ...telegram, pushSent: push.sent, pushFailed: push.failed, pushConfigured: push.configured };
  });
