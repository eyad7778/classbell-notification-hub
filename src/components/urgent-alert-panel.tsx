import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendUrgentClassAlert } from "@/lib/staff.functions";
import { CHANGE_ACTIONS, cairoToday, nextDateForDay, type ChangeAction, type Session } from "@/lib/schedule-changes";

export function UrgentAlertPanel({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ChangeAction>("cancel");
  const [date, setDate] = useState("");
  const [scope, setScope] = useState<"once" | "onwards">("once");
  const [urgent, setUrgent] = useState(true);
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
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1"><span>نوع التعديل</span><select className="h-10 w-full rounded-md border bg-background px-3" value={action} onChange={(e) => { const a = e.target.value as ChangeAction; setAction(a); if (a === "postpone") setScope("once"); }}>{CHANGE_ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
          <label className="block space-y-1"><span>تاريخ المحاضرة</span><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label className="block space-y-1"><span>يسري على</span><select className="h-10 w-full rounded-md border bg-background px-3" value={scope} onChange={(e) => setScope(e.target.value as "once" | "onwards")} disabled={action === "postpone"}><option value="once">هذه المحاضرة فقط</option><option value="onwards">كل المواعيد القادمة</option></select></label>
          {action === "postpone" && <label className="block space-y-1"><span>التاريخ الجديد</span><Input name="newDate" type="date" min={date} required /></label>}
          {(action === "time" || action === "postpone") && <div className="grid grid-cols-2 gap-3"><label>البداية<Input name="newStartsAt" type="time" defaultValue={session.starts_at.slice(0,5)} required /></label><label>النهاية<Input name="newEndsAt" type="time" defaultValue={session.ends_at.slice(0,5)} required /></label></div>}
          {action === "location" && <Input name="newLocation" aria-label="المكان الجديد" placeholder="المكان الجديد" required maxLength={200} />}
          {action === "instructor" && <Input name="newInstructor" aria-label="المحاضر الجديد" placeholder="المحاضر الجديد" required maxLength={200} />}
          <Input name="reason" aria-label="السبب أو نص التنبيه" placeholder="السبب أو نص التنبيه" maxLength={500} required={action === "note"} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />تنبيه عاجل على Telegram</label>
          <Button type="submit" disabled={busy} className="w-full">{busy ? "جارٍ الحفظ والإرسال…" : urgent ? "حفظ وإرسال الآن" : "حفظ التعديل"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}