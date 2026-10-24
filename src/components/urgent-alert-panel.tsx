import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendUrgentClassAlert } from "@/lib/staff.functions";
import { buildChangeAlert, CHANGE_ACTIONS, cairoToday, nextDateForDay, type ChangeAction, type Session } from "@/lib/schedule-changes";

export function UrgentAlertPanel({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ChangeAction>("cancel");
  const [date, setDate] = useState("");
  const [scope, setScope] = useState<"once" | "onwards">("once");
  const [urgent, setUrgent] = useState(true);
  const [preview, setPreview] = useState("");
  const send = useServerFn(sendUrgentClassAlert);
  const qc = useQueryClient();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (name: string) => String(f.get(name) ?? "").trim() || undefined;
    setBusy(true);
    try {
      const result = await send({ data: { sessionId: session.id, action, date, scope, urgent,
        newDate: value("newDate"), newStartsAt: value("newStartsAt"), newEndsAt: value("newEndsAt"),
        newLocation: value("newLocation"), newInstructor: value("newInstructor"), reason: value("reason") } });
      toast.success(result.urgent ? `تم حفظ التعديل؛ وصل التنبيه إلى ${result.sent} من ${result.recipients} طالب` : "تم حفظ تعديل الجدول");
      if (result.failed) toast.warning(`تعذّر إرسال Telegram إلى ${result.failed} طالب؛ راجع سجل الرسائل`);
      await qc.invalidateQueries();
      setOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذّر حفظ التنبيه"); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => { setDate(nextDateForDay(session.day_of_week, cairoToday())); setOpen(true); }}><BellRing className="size-4" />إرسال تنبيه عاجل</Button>
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>تعديل محاضرة {session.subject}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" onChange={(e) => {
          const f = new FormData(e.currentTarget);
          const v = (key: string) => String(f.get(key) ?? "") || undefined;
          const a = (v("action") ?? action) as ChangeAction;
          const alert = buildChangeAlert({ action: a, date: v("date") ?? date, scope: (v("scope") ?? scope) as "once" | "onwards", subject: session.subject, startsAt: session.starts_at, location: session.location, newDate: v("newDate"), newStartsAt: v("newStartsAt"), newEndsAt: v("newEndsAt"), newLocation: v("newLocation"), newInstructor: v("newInstructor"), reason: v("reason") });
          setPreview(`${alert.title}\n${alert.body}`);
        }}>
          <label className="block space-y-1"><span>نوع التعديل</span><select name="action" className="h-10 w-full rounded-md border bg-background px-3" value={action} onChange={(e) => setAction(e.target.value as ChangeAction)}>{CHANGE_ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
          <label className="block space-y-1"><span>تاريخ المحاضرة</span><Input name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label className="block space-y-1"><span>يسري على</span><select name="scope" className="h-10 w-full rounded-md border bg-background px-3" value={scope} onChange={(e) => setScope(e.target.value as "once" | "onwards")}><option value="once">هذه المحاضرة فقط</option><option value="onwards">كل المواعيد القادمة</option></select></label>
          {action === "postpone" && <label className="block space-y-1"><span>التاريخ الجديد</span><Input name="newDate" type="date" min={date} required /></label>}
          {(action === "time" || action === "postpone") && <div className="grid grid-cols-2 gap-3"><label>البداية<Input name="newStartsAt" type="time" defaultValue={session.starts_at.slice(0,5)} required /></label><label>النهاية<Input name="newEndsAt" type="time" defaultValue={session.ends_at.slice(0,5)} required /></label></div>}
          {action === "location" && <Input name="newLocation" aria-label="المكان الجديد" placeholder="المكان الجديد" required maxLength={200} />}
          {action === "instructor" && <Input name="newInstructor" aria-label="المحاضر الجديد" placeholder="المحاضر الجديد" required maxLength={200} />}
          <Input name="reason" aria-label="السبب أو نص التنبيه" placeholder="السبب أو نص التنبيه" maxLength={500} required={action === "note"} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />تنبيه عاجل على Telegram</label>
          {urgent && <div className="whitespace-pre-wrap border-y py-3 text-sm"><h3 className="mb-2 font-bold">معاينة الرسالة</h3>{preview || `${buildChangeAlert({ action, date, scope, subject: session.subject, startsAt: session.starts_at, location: session.location }).title}\n${buildChangeAlert({ action, date, scope, subject: session.subject, startsAt: session.starts_at, location: session.location }).body}`}</div>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "جارٍ الحفظ والإرسال…" : urgent ? "حفظ وإرسال الآن" : "حفظ التعديل"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}