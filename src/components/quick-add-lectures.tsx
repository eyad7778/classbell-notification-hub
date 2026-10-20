import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { notifyNewAcademicContent } from "@/lib/staff.functions";
import { parseLectureLines } from "@/lib/lecture-batch";

const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const typeLabel = { pdf: "ملف", video: "فيديو", external: "رابط", other: "ملف" } as const;

export function QuickAddLectures({
  subjectId: fixedSubject,
  subjects,
}: {
  subjectId?: string;
  subjects?: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const notify = useServerFn(notifyNewAcademicContent);
  const [chosen, setChosen] = useState("");
  const subjectId = fixedSubject ?? chosen;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const lastWeek = useQuery({
    queryKey: ["last-week", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("lectures")
        .select("week")
        .eq("subject_id", subjectId)
        .order("week", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return data?.week ?? 0;
    },
  });
  const parsed = useMemo(() => parseLectureLines(text, (lastWeek.data ?? 0) + 1), [text, lastWeek.data]);

  async function save() {
    if (!subjectId) return void toast.error("اختر المادة أولًا");
    if (!parsed.items.length) return void toast.error("الصق رابط محاضرة واحد على الأقل");
    setBusy(true);
    let saved = 0;
    const ids: string[] = [];
    for (const item of parsed.items) {
      const { data: lecture, error } = await supabase
        .from("lectures")
        .insert({ subject_id: subjectId, title: item.title, week: item.week })
        .select("id")
        .single();
      if (error || !lecture) break;
      const { error: resErr } = await supabase.from("lecture_resources").insert({
        lecture_id: lecture.id,
        name: item.title,
        url: item.url,
        resource_type: item.resourceType,
      });
      if (resErr) {
        await supabase.from("lectures").delete().eq("id", lecture.id);
        break;
      }
      ids.push(lecture.id);
      saved++;
    }
    setBusy(false);
    qc.invalidateQueries();
    if (saved === parsed.items.length) {
      toast.success(`تمت إضافة ${saved} محاضرة`);
      setText("");
    } else {
      toast.error(`أُضيفت ${saved} من ${parsed.items.length} فقط، تعذّر حفظ الباقي`);
      setText(text.split(/\r?\n/).filter((l) => l.trim()).slice(saved).join("\n"));
    }
    for (const id of ids) {
      try {
        await notify({ data: { type: "lecture", contentId: id } });
      } catch {
        toast.error("تمت الإضافة، لكن تعذّر إرسال بعض الإشعارات");
        break;
      }
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const label = file.name;
      setUploads((u) => ({ ...u, [label]: 0 }));
      try {
        const { uploadUrl } = await startUpload({
          data: { name: file.name, mimeType: file.type, size: file.size, origin: window.location.origin },
        });
        const fileId = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          if (file.type) xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (e) =>
            e.lengthComputable && setUploads((u) => ({ ...u, [label]: Math.round((e.loaded / e.total) * 100) }));
          xhr.onload = () => {
            try {
              const id = JSON.parse(xhr.responseText).id;
              if (xhr.status < 300 && id) resolve(id);
              else reject(new Error());
            } catch {
              reject(new Error());
            }
          };
          xhr.onerror = () => reject(new Error());
          xhr.send(file);
        });
        const { url } = await finishUpload({ data: { fileId } });
        const title = file.name.replace(/\.[^.]+$/, "");
        setText((t) => (t.trim() ? `${t.trimEnd()}\n` : "") + `${title} | ${url}`);
        toast.success(`اترفع «${title}» على Drive`);
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : `تعذّر رفع ${label}`);
      } finally {
        setUploads((u) => {
          const { [label]: _, ...rest } = u;
          return rest;
        });
      }
    }
  }

  return (
    <div className="space-y-2">
      {!fixedSubject && (
        <select className={sel} value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label="المادة">
          <option value="">اختر المادة…</option>
          {(subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
      <label className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-primary text-sm font-semibold text-primary">
        <Upload className="size-4" /> رفع ملفات من الجهاز إلى Drive
        <input
          type="file"
          multiple
          accept="application/pdf,video/*,image/*,.ppt,.pptx,.doc,.docx"
          className="sr-only"
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {Object.entries(uploads).map(([name, pct]) => (
        <div key={name} className="text-xs">
          <div className="flex justify-between"><span className="truncate">{name}</span><span>{pct}%</span></div>
          <div className="h-1.5 rounded bg-muted"><div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} /></div>
        </div>
      ))}
      <textarea
        dir="auto"
        rows={5}
        className="w-full rounded-md border border-input bg-background p-3 text-sm"
        placeholder={"الصق رابط في كل سطر، مثال:\nhttps://drive.google.com/...\nمقدمة المادة | https://youtu.be/..."}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        كل سطر = محاضرة. الاسم اختياري قبل الرابط، والرقم ونوع الملف بيتحددوا تلقائيًا.
      </p>
      {parsed.items.length > 0 && (
        <ul className="space-y-1 rounded-md border p-2 text-sm">
          {parsed.items.map((i) => (
            <li key={i.week} className="flex justify-between gap-2">
              <span className="truncate">{i.week}. {i.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{typeLabel[i.resourceType]}</span>
            </li>
          ))}
        </ul>
      )}
      {parsed.invalid.length > 0 && (
        <p className="text-xs text-destructive">سطور بدون رابط صالح هتتجاهل: {parsed.invalid.length}</p>
      )}
      <Button disabled={busy || !parsed.items.length} className="w-full" onClick={() => void save()}>
        {busy ? "جارٍ الحفظ…" : `حفظ ${parsed.items.length || ""} محاضرة`}
      </Button>
    </div>
  );
}
