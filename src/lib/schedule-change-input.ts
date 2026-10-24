import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const parsed = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}, "اختر تاريخًا صالحًا");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleChangeInput = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(["cancel", "postpone", "time", "location", "instructor", "restore", "note"]),
  date,
  scope: z.enum(["once", "onwards"]).default("once"),
  urgent: z.boolean().default(true),
  newDate: date.optional(),
  newStartsAt: time.optional(),
  newEndsAt: time.optional(),
  newLocation: z.string().trim().min(1).max(200).optional(),
  newInstructor: z.string().trim().min(1).max(200).optional(),
  reason: z.string().trim().max(500).optional(),
}).superRefine((v, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (v.action === "postpone" && (v.scope !== "once" || !v.newDate || v.newDate <= v.date)) error("اختر موعدًا لاحقًا للتأجيل لمرة واحدة");
  if (["time", "postpone"].includes(v.action) && (!v.newStartsAt || !v.newEndsAt || v.newEndsAt <= v.newStartsAt)) error("وقت النهاية يجب أن يكون بعد البداية");
  if (v.action === "location" && !v.newLocation) error("اكتب المكان الجديد");
  if (v.action === "instructor" && !v.newInstructor) error("اكتب اسم المحاضر الجديد");
  if (v.action === "note" && !v.reason) error("اكتب التنبيه");
});