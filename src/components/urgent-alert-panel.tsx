import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildUrgentAlert, nextDateForDay, URGENT_ACTIONS, type UrgentAction } from "@/lib/urgent-alert";

type Session = { id: string; day_of_week: number; starts_at: string; location: string | null; subjects: unknown };
type Send = (args: { data: { sessionId: string; action: UrgentAction; date: string; newValue?: string; note?: string } }) => Promise<{ recipients: number; sent: number; failed: number }>;

const placeholders: Partial<Record<UrgentAction, string>> = {
  time: "الموعد الجديد (مثال: الاثنين 12:00 ظهرًا)",
  location: "المكان الجديد (مثال: مدرج 10)",
  instructor: "اسم المحاضر الجديد",
};

export function UrgentAlertPanel({ session, send, onDone }: { session: Session; send: Send; onDone: () => void }) {
  const [action, setAction] = useState<UrgentAction>("cancel");
  const [date, setDate] = useState(() => nextDateForDay(session.day_of_week));
  const [newValue, setNewValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const subject = (session.subjects as { name: string } | null)?.name ?? "المادة";
  const preview = buildUrgentAlert({ action, subject, date, startsAt: session.starts_at, location: session.location, newValue, note });
  const needsValue = action in placeholders;

  async function submit() {
    if (needsValue && !newValue.trim()) return toast.error("اكتب القيمة الجديدة");
    setBusy(true);
    try {
      const r = await send({ data: { sessionId: session.id, action, date, newValue: newValue || undefined, note: note || undefined } });
      toast.success(`🔔 وصل التنبيه على Telegram لـ ${r.sent} من ${r.recipients} طالب`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إرسال التنبيه");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex flex-wrap gap-2">
        {URGENT_ACTIONS.map((a) => (
          <button key={a.id} type="button" onClick={() => setAction(a.id)}
            className={`rounded-full px-3 py-1 text-xs ${action === a.id ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>{a.label}</button>
        ))}
      </div>
      <label className="block text-xs text-muted-foreground">تاريخ المحاضرة
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {needsValue && <Input placeholder={placeholders[action]} value={newValue} onChange={(e) => setNewValue(e.target.value)} />}
      <Input placeholder="ملاحظة (اختياري) — مثال: بسبب اعتذار الدكتور" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="whitespace-pre-line rounded-lg bg-card p-2 text-xs">
        <p className="font-bold">{preview.title}</p>
        <p>{preview.body}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void submit()}>{busy ? "جارٍ الإرسال..." : "إرسال الآن"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </div>
  );
}
