import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scheduleChangeInput } from "@/lib/schedule-change-input";
import { buildChangeAlert, changeDedupeKey, weekdayOf } from "@/lib/schedule-changes";
import { alertOwners, studentLabel } from "@/lib/admin-alerts.server";
import { withSchemaExtensions, type SubscriptionPlan } from "@/integrations/supabase/schema-extensions";

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
  const { data: ownerRows } = await (ctx.supabase as any).from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "owner");
  const isOwner = (ownerRows ?? []).length > 0;
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
  dedupeKey?: string,
) {
  const { deliverTelegram, escapeHtml } = await import("@/lib/telegram.server");
  const { deliverPush } = await import("@/lib/push.server");
  const db = withSchemaExtensions(admin);
  const { data: n, error } = await db
    .from("notifications")
    .insert({
      user_id: userId,
      title,
      body,
      created_by: actor,
      ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
    })
    .select("id")
    .single();
  if (error?.code === "23505" && dedupeKey) return;
  if (error || !n) {
    console.error("Could not save student notification", {
      code: error?.code,
      message: error?.message,
      dedupeKey,
    });
    throw new Error("تعذّر حفظ الإشعار؛ أعد المحاولة من لوحة الإدارة");
  }
  await deliverPush(admin, [userId], { title, body }).catch((e) => console.error(e));
  await deliverTelegram(
    admin,
    [userId],
    `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`,
    n.id,
    null,
  ).catch((e) => console.error(e));
}

async function eligibleTargetUsers(
  admin: Awaited<ReturnType<typeof assertStaff>>,
  departmentIds: string[],
  levels: string[],
) {
  const now = new Date().toISOString();
  const [profiles, subscriptions, links] = await Promise.all([
    admin.from("profiles").select("id, department_id, level, registration_status"),
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
        p.registration_status === "active" &&
        activeIds.has(p.id) &&
        linkedIds.has(p.id),
    )
    .map((p) => p.id);
}

export const getSubscriptionDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = withSchemaExtensions(context.supabase);
    const [plans, requests, periods] = await Promise.all([
      db.from("subscription_plans").select("*").eq("is_active", true).order("sort_order").order("created_at"),
      db
        .from("payment_requests")
        .select("id, plan_id, plan_name_snapshot, plan_duration_days_snapshot, amount, method, reference, status, review_note, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("subscription_periods")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (plans.error || requests.error || periods.error) {
      console.error("Could not load subscription dashboard", {
        plans: plans.error?.message,
        requests: requests.error?.message,
        periods: periods.error?.message,
      });
      throw new Error("تعذّر تحميل الباقات وسجل الاشتراكات");
    }
    return {
      plans: plans.data ?? [],
      requests: requests.data ?? [],
      periods: periods.data ?? [],
    };
  });

export const getAdminSubscriptionPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertStaff(context as Ctx, false, "payments");
    const db = withSchemaExtensions(admin);
    const { data, error } = await db
      .from("subscription_plans")
      .select("*")
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error("تعذّر تحميل الباقات");
    return data ?? [];
  });

export const saveSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(100),
        description: z.string().max(2000).default(""),
        price: z.number().finite().min(0).max(100_000_000),
        durationDays: z.number().int().min(1).max(3650),
        features: z.array(z.string().trim().min(1).max(200)).max(30),
        isActive: z.boolean(),
        sortOrder: z.number().int().min(-10_000).max(10_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "payments");
    const db = withSchemaExtensions(admin);
    const values: Pick<
      SubscriptionPlan,
      "name" | "description" | "price" | "duration_days" | "features" | "is_active" | "sort_order"
    > = {
      name: data.name,
      description: data.description,
      price: data.price,
      duration_days: data.durationDays,
      features: data.features,
      is_active: data.isActive,
      sort_order: data.sortOrder,
    };
    const result = data.id
      ? await db.from("subscription_plans").update(values).eq("id", data.id).select("*").single()
      : await db.from("subscription_plans").insert(values).select("*").single();
    if (result.error || !result.data) throw new Error("تعذّر حفظ الباقة");
    return result.data;
  });

export const removeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "payments");
    const db = withSchemaExtensions(admin);
    const [requests, subscriptions, periods] = await Promise.all([
      db.from("payment_requests").select("id", { count: "exact", head: true }).eq("plan_id", data.id),
      db.from("subscriptions").select("id", { count: "exact", head: true }).eq("plan_id", data.id),
      db.from("subscription_periods").select("id", { count: "exact", head: true }).eq("plan_id", data.id),
    ]);
    if (requests.error || subscriptions.error || periods.error) {
      throw new Error("تعذّر التحقق من ارتباط الباقة بسجلات الاشتراك");
    }
    const isReferenced = (requests.count ?? 0) + (subscriptions.count ?? 0) + (periods.count ?? 0) > 0;
    const result = isReferenced
      ? await db.from("subscription_plans").update({ is_active: false }).eq("id", data.id)
      : await db.from("subscription_plans").delete().eq("id", data.id);
    if (result.error) throw new Error("تعذّر حذف الباقة أو أرشفتها");
    return { archived: isReferenced };
  });

export const submitPlanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planId: z.string().uuid(),
        method: z.string().trim().min(1).max(100),
        reference: z.string().trim().min(3).max(200),
        receiptPath: z.string().min(1).max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (
      !data.receiptPath.startsWith(`${context.userId}/`) ||
      data.receiptPath.split("/").length !== 2 ||
      !/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(data.receiptPath.split("/")[1] ?? "")
    ) {
      throw new Error("مسار الإيصال غير صالح");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = withSchemaExtensions(supabaseAdmin);
    const { error: receiptError } = await supabaseAdmin.storage
      .from("receipts")
      .download(data.receiptPath);
    if (receiptError) throw new Error("تعذّر التحقق من صورة الإيصال المرفوعة");

    const { data: requestId, error } = await db.rpc("create_plan_payment_request", {
      _user_id: context.userId,
      _plan_id: data.planId,
      _method: data.method,
      _reference: data.reference,
      _receipt_path: data.receiptPath,
    });
    if (error || !requestId) {
      console.error("Subscription payment request failed", {
        code: error?.code,
        message: error?.message,
        userId: context.userId,
      });
      throw new Error(
        error?.message.includes("already pending")
          ? "لديك طلب دفع قيد المراجعة بالفعل"
          : error?.message.includes("already active")
            ? "اشتراكك فعّال بالفعل"
            : "تعذّر إرسال طلب الاشتراك؛ راجع بيانات الدفع وحاول مجددًا",
      );
    }
    const { data: plan } = await db.from("subscription_plans").select("name, price").eq("id", data.planId).maybeSingle();
    await alertOwners(supabaseAdmin, "💳 طلب اشتراك جديد", [
      ...(await studentLabel(supabaseAdmin, context.userId)),
      `الباقة: ${plan?.name ?? "—"}${plan ? ` (${plan.price} ج.م)` : ""}`,
      `طريقة الدفع: ${data.method}`,
      `المرجع: ${data.reference}`,
    ]);
    return { id: requestId };
  });

export const notifyNewAcademicContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ type: z.enum(["lecture", "event"]), contentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "content");
    let title: string;
    let body: string;
    let link: string;
    let departmentIds: string[] = [];
    let levels: string[] = [];

    if (data.type === "lecture") {
      const { data: lecture, error } = await admin.from("lectures")
        .select("id, title, week, description, subject_id").eq("id", data.contentId).maybeSingle();
      if (error || !lecture) throw new Error("تعذّر تجهيز إشعار المحاضرة");
      const { data: subject, error: subjectError } = await admin.from("subjects")
        .select("name, department_id, level").eq("id", lecture.subject_id).maybeSingle();
      if (subjectError || !subject) throw new Error("تعذّر تحديد المادة للمحاضرة");
      departmentIds = subject.department_id ? [subject.department_id] : [];
      levels = subject.level ? [subject.level] : [];
      title = `📚 محاضرة جديدة في ${subject.name}`;
      body = [
        "🎉 خبر جميل! محاضرة جديدة بقت جاهزة لمذاكرتك.",
        `📖 المحاضرة: ${lecture.title}`,
        `📚 المادة: ${subject.name}`,
        lecture.week ? `🗓️ الأسبوع: ${lecture.week}` : null,
        lecture.description ? `📝 ${lecture.description}` : null,
        "\n💪 خطوة صغيرة كل يوم تقرّبك من هدفك. افتح التطبيق وابدأ!",
      ].filter(Boolean).join("\n").slice(0, 1200);
      link = "/app/subjects";
    } else {
      const { data: event, error } = await admin.from("events")
        .select("id, title, kind, starts_at, location, notes, subject_id, target_department_ids, target_levels")
        .eq("id", data.contentId).maybeSingle();
      if (error || !event) throw new Error("تعذّر تجهيز إشعار الموعد");
      let subjectName: string | null = null;
      if (event.subject_id) {
        const { data: subject } = await admin.from("subjects").select("name")
          .eq("id", event.subject_id).maybeSingle();
        subjectName = subject?.name ?? null;
      }
      departmentIds = event.target_department_ids ?? [];
      levels = event.target_levels ?? [];
      const kind = { lecture: "محاضرة", exam: "امتحان", assignment: "تكليف", other: "موعد" }[event.kind];
      const when = new Intl.DateTimeFormat("ar-EG", {
        dateStyle: "full", timeStyle: "short", timeZone: "Africa/Cairo",
      }).format(new Date(event.starts_at));
      title = `🗓️ ${kind} جديد: ${event.title}`;
      body = [
        "🔔 عندك تحديث جديد يساعدك ترتّب مذاكرتك.",
        `📌 النوع: ${kind}`,
        `📝 العنوان: ${event.title}`,
        `⏰ الموعد: ${when}`,
        subjectName ? `📚 المادة: ${subjectName}` : null,
        event.location ? `📍 المكان: ${event.location}` : null,
        event.notes ? `ℹ️ ${event.notes}` : null,
        "\n💪 رتّب وقتك وخليك مستعد. افتح التطبيق للتفاصيل!",
      ].filter(Boolean).join("\n").slice(0, 1200);
      link = "/app/schedule";
    }

    const { data: notification, error } = await admin.from("notifications").insert({
      user_id: null,
      title,
      body,
      link,
      created_by: context.userId,
      target_department_ids: departmentIds,
      target_levels: levels,
    }).select("id").single();
    if (error || !notification) throw new Error("تعذّر حفظ إشعار المحتوى");

    const ids = await eligibleTargetUsers(admin, departmentIds, levels);
    const [{ deliverPush }, { deliverTelegram, escapeHtml }] = await Promise.all([
      import("@/lib/push.server"),
      import("@/lib/telegram.server"),
    ]);
    const [push, telegram] = await Promise.all([
      deliverPush(admin, ids, { title, body, url: link }).catch((error) => {
        console.error("Academic content push delivery failed", error);
        return { sent: 0, failed: ids.length, configured: false };
      }),
      deliverTelegram(admin, ids, `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`, notification.id).catch((error) => {
        console.error("Academic content Telegram delivery failed", error);
        return { sent: 0, failed: ids.length, groupSent: 0, groupFailed: 1, groupConfigured: false };
      }),
    ]);
    return {
      ok: true,
      recipients: ids.length,
      pushSent: push.sent,
      pushFailed: push.failed,
      pushConfigured: push.configured,
      telegramSent: telegram.sent,
      telegramFailed: telegram.failed,
      groupSent: telegram.groupSent,
      groupFailed: telegram.groupFailed,
      groupConfigured: telegram.groupConfigured,
    };
  });

export const sendUrgentClassAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scheduleChangeInput.parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "content");
    const { data: session, error } = await admin.from("class_schedule")
      .select("*, subjects(name)").eq("id", data.sessionId).maybeSingle();
    if (error || !session) throw new Error("تعذّر تحميل المحاضرة");
    if (weekdayOf(data.date) !== session.day_of_week) throw new Error("اختر تاريخًا يوافق يوم المحاضرة");
    const { sha256Hex } = await import("@/lib/telegram.server");
    const { data: previous, error: historyError } = await admin.from("class_schedule_changes")
      .select("id, dedupe_key").eq("session_id", session.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (historyError) throw new Error("تعذّر تحميل سجل التعديلات؛ طبّق تحديث بيانات الجدول");
    const key = await sha256Hex(changeDedupeKey(data.sessionId, data));
    if (previous?.dedupe_key.startsWith(`${key}:`)) throw new Error("هذا التعديل محفوظ بالفعل؛ لم يتم إرسال تنبيه مكرر");
    const { data: saved, error: saveError } = await admin.from("class_schedule_changes").insert({
      session_id: session.id, change_date: data.date, scope: data.scope, action: data.action,
      new_date: data.action === "postpone" ? data.newDate ?? null : null,
      new_starts_at: ["time", "postpone"].includes(data.action) ? data.newStartsAt ?? null : null,
      new_ends_at: ["time", "postpone"].includes(data.action) ? data.newEndsAt ?? null : null,
      new_location: data.action === "location" ? data.newLocation ?? null : null,
      new_instructor: data.action === "instructor" ? data.newInstructor ?? null : null,
      reason: data.reason || null, target_department_ids: session.target_department_ids,
      target_levels: session.target_levels, created_by: context.userId, dedupe_key: `${key}:${previous?.id ?? "initial"}`,
    }).select("id").single();
    if (saveError?.code === "23505") throw new Error("هذا التعديل محفوظ بالفعل؛ لم يتم إرسال تنبيه مكرر");
    if (saveError || !saved) throw new Error("تعذّر حفظ التعديل؛ تأكد من تطبيق تحديث بيانات الجدول");
    if (!data.urgent) return { saved: true, recipients: 0, sent: 0, failed: 0, urgent: false };
    const alert = buildChangeAlert({ ...data, subject: session.subjects?.name ?? "محاضرة", startsAt: session.starts_at, location: session.location });
    const ids = await eligibleTargetUsers(admin, session.target_department_ids, session.target_levels);
    const { deliverScheduleAlert } = await import("@/lib/schedule-alert.server");
    return { saved: true, urgent: true, ...await deliverScheduleAlert(admin, saved.id, ids, alert, context.userId) };
  });

export const retryUrgentClassAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ changeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "content");
    const { data: change, error } = await admin.from("class_schedule_changes").select("*, class_schedule(*, subjects(name))").eq("id", data.changeId).maybeSingle();
    if (error || !change?.class_schedule) throw new Error("تعذّر تحميل التعديل");
    const session = change.class_schedule;
    const { data: later, error: laterError } = await admin.from("class_schedule_changes").select("id")
      .eq("session_id", change.session_id).gt("created_at", change.created_at).limit(1);
    if (laterError) throw new Error("تعذّر التحقق من أحدث تعديل");
    if (later?.length) throw new Error("لا يمكن إعادة إرسال تعديل قديم بعد إضافة تعديل أحدث للمحاضرة");
    const alert = buildChangeAlert({ action: change.action as import("@/lib/schedule-changes").ChangeAction,
      date: change.change_date, scope: change.scope as "once" | "onwards", subject: session.subjects?.name ?? "محاضرة",
      startsAt: session.starts_at, location: session.location, newDate: change.new_date ?? undefined,
      newStartsAt: change.new_starts_at?.slice(0, 5), newEndsAt: change.new_ends_at?.slice(0, 5),
      newLocation: change.new_location ?? undefined, newInstructor: change.new_instructor ?? undefined, reason: change.reason ?? undefined });
    const ids = await eligibleTargetUsers(admin, change.target_department_ids, change.target_levels);
    const { deliverScheduleAlert } = await import("@/lib/schedule-alert.server");
    return deliverScheduleAlert(admin, change.id, ids, alert, context.userId);
  });

export const uploadDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(180),
    mimeType: z.string().max(120),
    contentBase64: z.string().min(1).max(3_500_000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx, false, "content");
    const { uploadToGoogleDrive } = await import("@/lib/google-drive.server");
    return uploadToGoogleDrive(data);
  });

export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "payments");
    const db = withSchemaExtensions(admin);
    const { data: result, error } = await db.rpc("review_subscription_payment", {
      _payment_request_id: data.id,
      _approve: data.approve,
      _reviewed_by: context.userId,
      _note: data.note ?? null,
    });
    if (error || !result) {
      console.error("Subscription payment review failed", {
        code: error?.code,
        message: error?.message,
        requestId: data.id,
      });
      throw new Error("تعذّرت مراجعة الطلب؛ لم يتم تغيير حالة الاشتراك");
    }

    const reviewed = z
      .object({
        user_id: z.string().uuid(),
        plan_name: z.string(),
        end_at: z.string().nullable(),
        receipt_path: z.string().nullable(),
        approved: z.boolean(),
      })
      .safeParse(result);
    if (!reviewed.success) {
      console.error("Subscription review returned an invalid result", { requestId: data.id });
      throw new Error("تم تحديث الطلب لكن تعذّر قراءة نتيجة المراجعة");
    }

    await alertOwners(admin, data.approve ? "✅ تم تفعيل اشتراك" : "❌ تم رفض طلب اشتراك", [
      ...(await studentLabel(admin, reviewed.data.user_id)),
      `الباقة: ${reviewed.data.plan_name}`,
      data.approve && reviewed.data.end_at ? `ينتهي: ${new Date(reviewed.data.end_at).toLocaleDateString("ar-EG")}` : null,
      data.note ? `ملاحظة: ${data.note}` : null,
    ]);

    if (data.approve && reviewed.data.receipt_path) {
      const { error: removeError } = await admin.storage
        .from("receipts")
        .remove([reviewed.data.receipt_path]);
      if (removeError) {
        console.error("Approved payment receipt cleanup failed", {
          code: removeError.name,
          requestId: data.id,
        });
      } else {
        const { error: clearError } = await admin
          .from("payment_requests")
          .update({ receipt_path: null })
          .eq("id", data.id);
        if (clearError) {
          console.error("Approved payment receipt reference cleanup failed", {
            code: clearError.code,
            requestId: data.id,
          });
        }
      }
    }

    if (data.approve) {
      const end = reviewed.data.end_at
        ? new Date(reviewed.data.end_at).toLocaleDateString("ar-EG")
        : "—";
      try {
        await notifyUser(
          admin,
          reviewed.data.user_id,
          "تم تفعيل اشتراكك بنجاح 🎉",
          `تمت الموافقة على اشتراكك في باقة ${reviewed.data.plan_name}. اشتراكك نشط حتى ${end}. نتمنى لك تجربة دراسية موفقة.`,
          context.userId,
          `subscription-activation:${reviewed.data.user_id}:${reviewed.data.end_at ? new Date(reviewed.data.end_at).toISOString() : "null"}`,
        );
      } catch (notificationError) {
        console.error("Subscription activated but notification creation failed", {
          requestId: data.id,
          userId: reviewed.data.user_id,
          notificationError,
        });
        return { ok: true, notificationError: true };
      }
    } else {
      try {
        await notifyUser(
          admin,
          reviewed.data.user_id,
          "تم رفض طلب الدفع",
          data.note || "راجع بيانات الدفع وأعد الإرسال أو تواصل مع الدعم.",
          context.userId,
          `subscription-rejection:${data.id}`,
        );
      } catch (notificationError) {
        console.error("Payment request rejected but notification creation failed", {
          requestId: data.id,
          userId: reviewed.data.user_id,
          notificationError,
        });
        return { ok: true, notificationError: true };
      }
    }
    return { ok: true };
  });

export const retrySubscriptionNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "payments");
    const { data: subscription, error: subscriptionError } = await withSchemaExtensions(admin)
      .from("subscriptions")
      .select("status, end_at, plan_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (subscriptionError || subscription?.status !== "active" ||
      (subscription.end_at && new Date(subscription.end_at) <= new Date())) {
      throw new Error("لا يوجد اشتراك نشط لإعادة إشعاره");
    }

    let planName = "اشتراكك";
    if (subscription.plan_id) {
      const db = withSchemaExtensions(admin);
      const { data: plan, error } = await db
        .from("subscription_plans")
        .select("name")
        .eq("id", subscription.plan_id)
        .maybeSingle();
      if (error) throw new Error("تعذّر تحميل اسم الباقة");
      planName = plan?.name ?? planName;
    }

    const end = subscription.end_at
      ? new Date(subscription.end_at).toLocaleDateString("ar-EG")
      : "—";
    await notifyUser(
      admin,
      data.userId,
      "تم تفعيل اشتراكك بنجاح 🎉",
      `تمت الموافقة على اشتراكك في باقة ${planName}. اشتراكك نشط حتى ${end}. نتمنى لك تجربة دراسية موفقة.`,
      context.userId,
      `subscription-activation:${data.userId}:${subscription.end_at ? new Date(subscription.end_at).toISOString() : "null"}`,
    );
    return { ok: true };
  });

export const reviewStudentRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), retryNotification: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "students");
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("registration_status, id_card_path")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileError || !profile) throw new Error("تعذّر تحميل بيانات الحساب");
    if (profile.registration_status === "active" && data.retryNotification) {
      try {
        await notifyUser(
          admin,
          data.userId,
          "تم تفعيل حسابك بنجاح 🎉",
          "أهلًا بك في Smart Study! تمت الموافقة على حسابك وأصبح بإمكانك الآن الدخول إلى المنصة. يمكنك استكمال خطوات الاشتراك واختيار الباقة المناسبة لك.",
          context.userId,
          `account-activation:${data.userId}`,
        );
      } catch (notificationError) {
        console.error("Account activated but notification creation failed", {
          userId: data.userId,
          notificationError,
        });
        throw notificationError;
      }
      return { ok: true, retried: true };
    }
    if (profile.registration_status !== "pending") throw new Error("تمت مراجعة هذا الحساب مسبقًا");
    if (!profile.id_card_path) throw new Error("لا توجد صورة كارنيه لمراجعتها");

    const { data: activated, error: updateError } = await admin
      .from("profiles")
      .update({ registration_status: "active", id_card_path: null })
      .eq("id", data.userId)
      .eq("registration_status", "pending")
      .select("id")
      .maybeSingle();
    if (updateError || !activated) throw new Error("تعذّر تفعيل الحساب؛ لم يتم تغيير حالته");

    const { error: deleteError } = await admin.storage
      .from("student-ids")
      .remove([profile.id_card_path]);
    await alertOwners(admin, "🎓 تم تفعيل حساب طالب", await studentLabel(admin, data.userId));
    if (deleteError) {
      console.error("Activated student's ID card cleanup failed", {
        code: deleteError.name,
        userId: data.userId,
      });
    }

    await notifyUser(
      admin,
      data.userId,
      "تم تفعيل حسابك بنجاح 🎉",
      "أهلًا بك في Smart Study! تمت الموافقة على حسابك وأصبح بإمكانك الآن الدخول إلى المنصة. يمكنك استكمال خطوات الاشتراك واختيار الباقة المناسبة لك.",
      context.userId,
      `account-activation:${data.userId}`,
    );
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
        endAt: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertStaff(context as Ctx, false, "payments");
    const db = withSchemaExtensions(admin);
    const { data: currentSubscription, error: currentSubscriptionError } = await db
      .from("subscriptions")
      .select("plan_id, amount")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (currentSubscriptionError) throw new Error("تعذّر تحميل الاشتراك الحالي");
    const now = new Date();
    const requestedEndAt = data.endAt ? new Date(data.endAt) : new Date(now.getTime() + 365 * 86_400_000);
    if (data.status === "active" && (!Number.isFinite(requestedEndAt.getTime()) || requestedEndAt <= now)) {
      throw new Error("تاريخ انتهاء الاشتراك يجب أن يكون في المستقبل");
    }
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
      user_id: string;
      status: typeof data.status;
      start_at?: string;
      end_at?: string;
      activated_by?: string;
      activated_at?: string;
      plan_id: string | null;
    } = { user_id: data.userId, status: data.status, plan_id: currentSubscription?.plan_id ?? null };
    if (data.status === "active") {
      patch.start_at = now.toISOString();
      patch.end_at = requestedEndAt.toISOString();
      patch.activated_by = context.userId;
      patch.activated_at = now.toISOString();
    }
    const { error } = await db
      .from("subscriptions")
      .upsert(patch, { onConflict: "user_id" });
    if (error) throw new Error("تعذّر تحديث الاشتراك");
    const { error: eventError } = await admin
      .from("subscription_events")
      .update({ actor_id: context.userId, note: data.note ?? null })
      .eq("user_id", data.userId)
      .is("actor_id", null);
    if (eventError) throw new Error("تم تحديث الاشتراك لكن تعذّر حفظ سجل المراجعة");
    const statusAr = { active: "تفعيل", suspended: "إيقاف", expired: "إنهاء", awaiting_payment: "إرجاع لانتظار الدفع" }[data.status];
    await alertOwners(admin, `🔄 ${statusAr} اشتراك يدويًا`, [
      ...(await studentLabel(admin, data.userId)),
      patch.end_at ? `ينتهي: ${new Date(patch.end_at).toLocaleDateString("ar-EG")}` : null,
      data.note ? `ملاحظة: ${data.note}` : null,
    ]);
    if (data.status === "active" && patch.start_at && patch.end_at) {
      let planName = "اشتراك يدوي";
      if (patch.plan_id) {
        const { data: plan, error: planError } = await db
          .from("subscription_plans")
          .select("name")
          .eq("id", patch.plan_id)
          .maybeSingle();
        if (planError) throw new Error("تم تفعيل الاشتراك لكن تعذّر تحميل اسم الباقة");
        planName = plan?.name ?? planName;
      }
      const durationDays = Math.max(
        1,
        Math.ceil((new Date(patch.end_at).getTime() - new Date(patch.start_at).getTime()) / 86_400_000),
      );
      const { error: periodError } = await db.from("subscription_periods").insert({
        user_id: data.userId,
        plan_id: patch.plan_id,
        payment_request_id: null,
        plan_name: planName,
        duration_days: durationDays,
        amount: currentSubscription?.amount ?? 0,
        status: "active",
        start_at: patch.start_at,
        end_at: patch.end_at,
      });
      if (periodError) throw new Error("تم تفعيل الاشتراك لكن تعذّر تسجيله في السجل التاريخي");
      try {
        const end = new Date(patch.end_at).toLocaleDateString("ar-EG");
        await notifyUser(
          admin,
          data.userId,
          "تم تفعيل اشتراكك بنجاح 🎉",
          `تمت الموافقة على اشتراكك في باقة ${planName}. اشتراكك نشط حتى ${end}. نتمنى لك تجربة دراسية موفقة.`,
          context.userId,
          `subscription-activation:${data.userId}:${patch.end_at}`,
        );
      } catch (notificationError) {
        console.error("Subscription activated but notification creation failed", {
          userId: data.userId,
          notificationError,
        });
        return { ok: true, notificationError: true };
      }
    }
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
    const { deliverTelegram, escapeHtml } = await import("@/lib/telegram.server");
    const message = `<b>${escapeHtml(data.title)}</b>\n${escapeHtml(data.body)}`;
    const telegram = await deliverTelegram(admin, data.telegram ? ids : [], message, n.id, data.userId ? null : message);
    if (!data.telegram) return { ...telegram, sent: 0, failed: 0, pushSent: push.sent, pushFailed: push.failed, pushConfigured: push.configured };
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
    if (!data.notify) {
      const { deliverTelegramGroup, escapeHtml } = await import("@/lib/telegram.server");
      const group = await deliverTelegramGroup(admin, `<b>📢 ${escapeHtml(data.title)}</b>\n${escapeHtml(data.body.slice(0, 900))}`);
      return { sent: 0, failed: 0, ...group, pushSent: 0, pushFailed: 0, pushConfigured: false };
    }
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

/** Called by the browser right after signup; only alerts about the caller's own fresh account. */
export const announceNewSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const created = user?.user?.created_at ? new Date(user.user.created_at).getTime() : 0;
    if (Date.now() - created > 15 * 60_000) return { ok: true, skipped: true };
    await alertOwners(supabaseAdmin, "🆕 حساب طالب جديد بانتظار المراجعة", await studentLabel(supabaseAdmin, context.userId));
    return { ok: true };
  });
