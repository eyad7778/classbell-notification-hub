import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Card, fmtDate, kindLabel, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";
import { notifyNewAcademicContent } from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/admin/content")({
  head: () => pageMeta("إدارة المحتوى", "المواد والمحاضرات والملفات والمواعيد."),
  component: Content,
});

const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function googleDriveId(value: string) {
  try {
    const url = new URL(value);
    if (!/^(drive|docs)\.google\.com$/.test(url.hostname)) return null;
    return url.pathname.match(/\/d\/([^/]+)/)?.[1] ?? url.searchParams.get("id");
  } catch {
    return null;
  }
}

function Content() {
  const qc = useQueryClient();
  const notifyContent = useServerFn(notifyNewAcademicContent);
  const departments = useQuery({
    queryKey: ["admin-departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });
  const subjects = useQuery({
    queryKey: ["admin-subjects"],
    queryFn: async () =>
      (await supabase.from("subjects").select("*").order("sort_order")).data ?? [],
  });
  const [subj, setSubj] = useState({ name: "", code: "", level: "", term: "", department_id: "" });
  const [lec, setLec] = useState({
    subject_id: "",
    title: "",
    week: "",
    description: "",
    fileName: "",
    fileUrl: "",
    resourceType: "pdf" as "pdf" | "video" | "external" | "other",
  });
  const [editingLecture, setEditingLecture] = useState<{
    id: string;
    title: string;
    week: string;
    description: string;
    external_url: string;
  } | null>(null);
  const [ev, setEv] = useState({
    subject_id: "",
    title: "",
    kind: "lecture",
    starts_at: "",
    location: "",
    notes: "",
    targetDepartmentIds: [] as string[],
  });
  const [eventLevels, setEventLevels] = useState("");
  const [resource, setResource] = useState({
    lecture_id: "",
    name: "",
    description: "",
    url: "",
    resource_type: "pdf" as "pdf" | "video" | "external" | "other",
  });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [materialSearch, setMaterialSearch] = useState("");
  const [lectureSearch, setLectureSearch] = useState("");
  const lectures = useQuery({
    queryKey: ["admin-lectures", view],
    enabled: !!view,
    queryFn: async () =>
      (await supabase.from("lectures").select("*").eq("subject_id", view).order("week", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }))
        .data ?? [],
  });
  const resources = useQuery({
    queryKey: ["admin-lecture-resources", view],
    enabled: !!view && !!lectures.data?.length,
    queryFn: async () => {
      const lectureIds = (lectures.data ?? []).map((lecture) => lecture.id);
      if (!lectureIds.length) return [];
      const { data, error } = await supabase
        .from("lecture_resources")
        .select("*")
        .in("lecture_id", lectureIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const events = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () =>
      (
        await supabase
          .from("events")
          .select("*")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at")
          .limit(50)
      ).data ?? [],
  });

  const done = (ok: string, error: unknown) => {
    setBusy(false);
    if (error) toast.error("تعذّر الحفظ");
    else {
      toast.success(ok);
      qc.invalidateQueries();
    }
    return !error;
  };

  async function addSubject(e: FormEvent) {
    e.preventDefault();
    if (subj.name.trim().length < 2) {
      toast.error("اكتب اسم المادة");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("subjects").insert({
      name: subj.name.trim(),
      code: subj.code || null,
      level: subj.level || null,
      term: subj.term || null,
      department_id: subj.department_id || null,
      sort_order: (subjects.data?.length ?? 0) + 1,
    });
    if (done("تمت إضافة المادة", error))
      setSubj({ name: "", code: "", level: "", term: "", department_id: "" });
  }
  async function addLecture(e: FormEvent) {
    e.preventDefault();
    if (!lec.subject_id || lec.title.trim().length < 2 || !lec.week || !lec.fileName.trim()) {
      toast.error("اختر المادة ورقم المحاضرة واكتب عنوانها واسم الملف");
      return;
    }
    const week = Number(lec.week);
    if (!Number.isInteger(week) || week < 1) {
      toast.error("رقم المحاضرة يجب أن يكون رقمًا صحيحًا أكبر من صفر");
      return;
    }
    let fileUrl: string;
    try {
      const parsed = new URL(lec.fileUrl.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
      fileUrl = parsed.toString();
    } catch {
      toast.error("أدخل رابط ملف صالحًا يبدأ بـ https:// أو http://");
      return;
    }
    setBusy(true);
    const { data: createdLecture, error } = await supabase.from("lectures").insert({
      subject_id: lec.subject_id,
      title: lec.title.trim(),
      week,
      description: lec.description || null,
      external_url: null,
      file_path: null,
    }).select("id").single();
    if (error) return void done("تمت إضافة المحاضرة", error);
    if (!createdLecture?.id) return void done("تمت إضافة المحاضرة", new Error("missing lecture id"));
    const { error: resourceError } = await supabase.from("lecture_resources").insert({
      lecture_id: createdLecture.id,
      name: lec.fileName.trim(),
      url: fileUrl,
      resource_type: lec.resourceType,
      drive_file_id: googleDriveId(fileUrl),
    });
    if (resourceError) {
      await supabase.from("lectures").delete().eq("id", createdLecture.id);
      return void done("تمت إضافة المحاضرة", resourceError);
    }
    setLec({ ...lec, title: "", week: "", description: "", fileName: "", fileUrl: "" });
    qc.invalidateQueries();
    setBusy(false);
    toast.success("تمت إضافة المحاضرة");
    if (createdLecture?.id) {
      try {
        const result = await notifyContent({ data: { type: "lecture", contentId: createdLecture.id } });
        if (result.recipients > 0)
          toast.success(`📨 أُرسل إشعار المحاضرة تلقائيًا إلى ${result.recipients} طالب`);
        else toast.info("📨 تم حفظ الإشعار؛ لا يوجد طلاب مستهدفون باشتراك فعّال حاليًا");
      } catch {
        toast.error("تمت إضافة المحاضرة، لكن تعذّر إرسال الإشعار تلقائيًا");
      }
    }
  }
  async function addEvent(e: FormEvent) {
    e.preventDefault();
    if (ev.title.trim().length < 2 || !ev.starts_at) {
      toast.error("اكتب العنوان والموعد");
      return;
    }
    setBusy(true);
    const { data: createdEvent, error } = await supabase.from("events").insert({
      title: ev.title.trim(),
      kind: ev.kind as "lecture",
      starts_at: new Date(ev.starts_at).toISOString(),
      subject_id: ev.subject_id || null,
      location: ev.location || null,
      notes: ev.notes || null,
      target_department_ids: ev.targetDepartmentIds,
      target_levels: eventLevels
        .split(/[،,]/)
        .map((level) => level.trim())
        .filter(Boolean),
    }).select("id").single();
    if (error) return void done("تمت إضافة الموعد", error);
    setEv({ ...ev, title: "", starts_at: "", location: "", notes: "", targetDepartmentIds: [] });
    setEventLevels("");
    qc.invalidateQueries();
    setBusy(false);
    toast.success("تمت إضافة الموعد");
    if (createdEvent?.id) {
      try {
        const result = await notifyContent({ data: { type: "event", contentId: createdEvent.id } });
        if (result.recipients > 0)
          toast.success(`📨 أُرسل إشعار الموعد تلقائيًا إلى ${result.recipients} طالب`);
        else toast.info("📨 تم حفظ الإشعار؛ لا يوجد طلاب مستهدفون باشتراك فعّال حاليًا");
      } catch {
        toast.error("تمت إضافة الموعد، لكن تعذّر إرسال الإشعار تلقائيًا");
      }
    }
  }
  async function addResource(e: FormEvent) {
    e.preventDefault();
    if (!resource.lecture_id || resource.name.trim().length < 1) {
      toast.error("اختر المحاضرة واكتب اسم المورد");
      return;
    }
    try {
      const url = new URL(resource.url.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      toast.error("أدخل رابطًا صالحًا يبدأ بـ https:// أو http://");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("lecture_resources").insert({
      ...resource,
      name: resource.name.trim(),
      url: resource.url.trim(),
      description: resource.description.trim() || null,
      drive_file_id: googleDriveId(resource.url.trim()),
    });
    if (done("تمت إضافة المورد", error))
      setResource({ ...resource, name: "", description: "", url: "" });
  }
  async function editResource(item: NonNullable<typeof resources.data>[number]) {
    const name = prompt("اسم المورد", item.name)?.trim();
    if (!name) return;
    const url = prompt("رابط المورد", item.url)?.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast.error("الرابط غير صالح");
      return;
    }
    const description = prompt("وصف المورد", item.description ?? "")?.trim();
    if (description === undefined) return;
    const resourceType = prompt(
      "النوع: pdf أو video أو external أو other",
      item.resource_type,
    )?.trim();
    if (!resourceType || !["pdf", "video", "external", "other"].includes(resourceType)) {
      toast.error("نوع المورد غير صالح");
      return;
    }
    const { error } = await supabase
      .from("lecture_resources")
      .update({
        name,
        url,
        description: description || null,
        resource_type: resourceType as typeof item.resource_type,
        drive_file_id: googleDriveId(url),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (error) toast.error("تعذّر تعديل المورد");
    else {
      toast.success("تم تعديل المورد");
      qc.invalidateQueries();
    }
  }
  async function deleteResource(id: string) {
    if (!confirm("حذف سجل الرابط من المنصة؟ لن يُحذف الملف الأصلي من Google Drive.")) return;
    const { error } = await supabase.from("lecture_resources").delete().eq("id", id);
    if (error) toast.error("تعذّر حذف المورد");
    else {
      toast.success("تم حذف سجل المورد");
      qc.invalidateQueries();
    }
  }
  async function saveLectureEdit() {
    if (!editingLecture) return;
    const week = Number(editingLecture.week);
    if (!editingLecture.title.trim() || !Number.isInteger(week) || week < 1) {
      toast.error("اكتب عنوانًا ورقم محاضرة صحيحًا");
      return;
    }
    const externalUrl = editingLecture.external_url.trim();
    if (externalUrl) {
      try {
        const parsed = new URL(externalUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      } catch {
        toast.error("رابط المحاضرة غير صالح");
        return;
      }
    }
    const { error } = await supabase.from("lectures").update({
      title: editingLecture.title.trim(),
      week,
      description: editingLecture.description.trim() || null,
      external_url: externalUrl || null,
    }).eq("id", editingLecture.id);
    if (error) toast.error("تعذّر تعديل المحاضرة");
    else {
      toast.success("تم تعديل المحاضرة");
      setEditingLecture(null);
      qc.invalidateQueries();
    }
  }
  async function delLecture(id: string, path: string | null) {
    if (!confirm("حذف المحاضرة؟")) return;
    const { error } = await supabase.from("lectures").delete().eq("id", id);
    if (error) return toast.error("تعذّر حذف المحاضرة");
    if (path) await supabase.storage.from("lectures").remove([path]);
    toast.success("تم حذف المحاضرة وملفات روابطها");
    qc.invalidateQueries();
  }
  async function delRow(table: "events" | "subjects", id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error("تعذّر الحذف (قد تكون مرتبطة بمحاضرات)");
    qc.invalidateQueries();
  }

  const opts = (subjects.data ?? []).map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ));
  return (
    <div>
      <PageTitle title="المحتوى الدراسي" />
      <Card className="mb-4">
        <h2 className="font-bold">إدارة الأقسام</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          أضف الأقسام وفعّلها أو أوقفها دون تعديل الكود.
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = (
              form.elements.namedItem("department-name") as HTMLInputElement
            ).value.trim();
            if (name.length < 2) {
              toast.error("اكتب اسم القسم");
              return;
            }
            const description = (
              form.elements.namedItem("department-description") as HTMLInputElement
            ).value.trim();
            const { error } = await supabase
              .from("departments")
              .insert({ name, description: description || null });
            if (error) toast.error("تعذّرت إضافة القسم؛ قد يكون الاسم مستخدمًا بالفعل.");
            else {
              toast.success("تمت إضافة القسم");
              form.reset();
              qc.invalidateQueries({ queryKey: ["admin-departments"] });
              qc.invalidateQueries({ queryKey: ["signup-departments"] });
            }
          }}
        >
          <Input
            name="department-name"
            placeholder="اسم القسم الجديد"
            required
            minLength={2}
            maxLength={120}
            className="max-w-sm"
          />
          <Input
            name="department-description"
            placeholder="بيانات أو وصف مختصر (اختياري)"
            maxLength={500}
            className="max-w-sm"
          />
          <Button type="submit">إضافة قسم</Button>
        </form>
        <ul className="mt-3 divide-y">
          {(departments.data ?? []).map((department) => (
            <li
              key={department.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span>
                <b>{department.name}</b>
                <span className="ms-2 text-xs text-muted-foreground">
                  {department.is_active ? "مفعّل" : "متوقف"}
                </span>
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const name = prompt("اسم القسم", department.name)?.trim();
                    if (!name || name.length < 2) return;
                    const description = prompt("بيانات أو وصف القسم", department.description ?? "");
                    if (description === null) return;
                    const { error } = await supabase
                      .from("departments")
                      .update({
                        name,
                        description: description.trim() || null,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", department.id);
                    if (error) toast.error("تعذّر تعديل القسم");
                    else {
                      toast.success("تم تعديل القسم");
                      qc.invalidateQueries();
                    }
                  }}
                >
                  تعديل الاسم
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("departments")
                      .update({
                        is_active: !department.is_active,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", department.id);
                    if (error) toast.error("تعذّر تحديث حالة القسم");
                    else {
                      toast.success(department.is_active ? "تم إيقاف القسم" : "تم تفعيل القسم");
                      qc.invalidateQueries();
                    }
                  }}
                >
                  {department.is_active ? "إيقاف" : "تفعيل"}
                </Button>
              </div>
            </li>
          ))}
          {departments.data?.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">لا توجد أقسام بعد.</li>
          )}
        </ul>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-bold">مادة جديدة</h2>
          <form onSubmit={addSubject} className="mt-3 space-y-2">
            <Input
              placeholder="اسم المادة"
              value={subj.name}
              onChange={(e) => setSubj({ ...subj, name: e.target.value })}
            />
            <Input
              placeholder="الكود"
              value={subj.code}
              onChange={(e) => setSubj({ ...subj, code: e.target.value })}
            />
            <select
              className={sel}
              value={subj.department_id}
              onChange={(e) => setSubj({ ...subj, department_id: e.target.value })}
            >
              <option value="">مادة مشتركة بين الأقسام</option>
              {(departments.data ?? [])
                .filter((d) => d.is_active)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
            <Input
              placeholder="الفرقة"
              value={subj.level}
              onChange={(e) => setSubj({ ...subj, level: e.target.value })}
            />
            <Input
              placeholder="الترم"
              value={subj.term}
              onChange={(e) => setSubj({ ...subj, term: e.target.value })}
            />
            <Button disabled={busy} className="w-full">
              إضافة
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="font-bold">إضافة محاضرة</h2>
          <form onSubmit={addLecture} className="mt-3 space-y-2">
            <select
              className={sel}
              value={lec.subject_id}
              onChange={(e) => setLec({ ...lec, subject_id: e.target.value })}
            >
              <option value="">اختر المادة…</option>
              {opts}
            </select>
            <Input
              placeholder="عنوان المحاضرة"
              required
              maxLength={180}
              value={lec.title}
              onChange={(e) => setLec({ ...lec, title: e.target.value })}
            />
            <Input
              type="number"
              placeholder="رقم المحاضرة"
              min={1}
              required
              value={lec.week}
              onChange={(e) => setLec({ ...lec, week: e.target.value })}
            />
            <Input
              placeholder="وصف مختصر"
              value={lec.description}
              onChange={(e) => setLec({ ...lec, description: e.target.value })}
            />
            <Input
              placeholder="اسم الملف الظاهر للطالب"
              value={lec.fileName}
              onChange={(e) => setLec({ ...lec, fileName: e.target.value })}
              required
              maxLength={180}
            />
            <Input
              dir="ltr"
              placeholder="رابط Google Drive أو الملف"
              value={lec.fileUrl}
              onChange={(e) => setLec({ ...lec, fileUrl: e.target.value })}
              required
              type="url"
            />
            <select
              className={sel}
              aria-label="نوع الملف"
              value={lec.resourceType}
              onChange={(e) => setLec({ ...lec, resourceType: e.target.value as typeof lec.resourceType })}
            >
              <option value="pdf">ملف PDF</option>
              <option value="video">فيديو</option>
              <option value="external">رابط خارجي</option>
              <option value="other">ملف آخر</option>
            </select>
            <p className="text-xs text-muted-foreground">
              الملفات تبقى على Google Drive أو الاستضافة الخارجية؛ المنصة تحفظ الاسم والرابط فقط.
            </p>
            <Button disabled={busy} className="w-full">
              حفظ المحاضرة
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="font-bold">موعد / امتحان</h2>
          <form onSubmit={addEvent} className="mt-3 space-y-2">
            <select
              className={sel}
              value={ev.kind}
              onChange={(e) => setEv({ ...ev, kind: e.target.value })}
            >
              {Object.entries(kindLabel).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              className={sel}
              value={ev.subject_id}
              onChange={(e) => setEv({ ...ev, subject_id: e.target.value })}
            >
              <option value="">بدون مادة</option>
              {opts}
            </select>
            <Input
              placeholder="العنوان"
              value={ev.title}
              onChange={(e) => setEv({ ...ev, title: e.target.value })}
            />
            <Input
              type="datetime-local"
              value={ev.starts_at}
              onChange={(e) => setEv({ ...ev, starts_at: e.target.value })}
            />
            <Input
              placeholder="المكان"
              value={ev.location}
              onChange={(e) => setEv({ ...ev, location: e.target.value })}
            />
            <Input
              placeholder="ملاحظات"
              value={ev.notes}
              onChange={(e) => setEv({ ...ev, notes: e.target.value })}
            />
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">القسم المستهدف</legend>
              <p className="text-xs text-muted-foreground">عدم اختيار أقسام يعني جميع الأقسام.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {(departments.data ?? [])
                  .filter((d) => d.is_active)
                  .map((department) => (
                    <label key={department.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ev.targetDepartmentIds.includes(department.id)}
                        onChange={(e) =>
                          setEv({
                            ...ev,
                            targetDepartmentIds: e.target.checked
                              ? [...ev.targetDepartmentIds, department.id]
                              : ev.targetDepartmentIds.filter((id) => id !== department.id),
                          })
                        }
                      />
                      {department.name}
                    </label>
                  ))}
              </div>
            </fieldset>
            <Input
              placeholder="الفرق المستهدفة (اختياري، افصل بينها بفاصلة)"
              value={eventLevels}
              onChange={(e) => setEventLevels(e.target.value)}
            />
            <Button disabled={busy} className="w-full">
              إضافة
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-bold">إضافة مورد برابط</h2>
        <form onSubmit={addResource} className="mt-3 grid gap-2 md:grid-cols-2">
          <select
            className={sel}
            value={resource.lecture_id}
            onChange={(e) => setResource({ ...resource, lecture_id: e.target.value })}
          >
            <option value="">اختر المحاضرة من المواد</option>
            {(subjects.data ?? []).flatMap((subject) =>
              (subject.id === view ? (lectures.data ?? []) : []).map((lecture) => (
                <option key={lecture.id} value={lecture.id}>
                  {subject.name} · {lecture.title}
                </option>
              )),
            )}
          </select>
          <Input
            placeholder="اسم الملف أو المورد"
            value={resource.name}
            onChange={(e) => setResource({ ...resource, name: e.target.value })}
            required
            maxLength={180}
          />
          <Input
            className="md:col-span-2"
            dir="ltr"
            placeholder="رابط Google Drive أو رابط خارجي"
            value={resource.url}
            onChange={(e) => setResource({ ...resource, url: e.target.value })}
            required
          />
          <p className="text-xs text-muted-foreground md:col-span-2">
            صلاحية فتح رابط Drive تعتمد على إعدادات المشاركة في Google Drive. لا تضع بيانات اعتماد
            أو روابط خاصة مكشوفة هنا.
          </p>
          <Input
            placeholder="وصف مختصر (اختياري)"
            value={resource.description}
            onChange={(e) => setResource({ ...resource, description: e.target.value })}
          />
          <select
            className={sel}
            value={resource.resource_type}
            onChange={(e) =>
              setResource({
                ...resource,
                resource_type: e.target.value as typeof resource.resource_type,
              })
            }
          >
            <option value="pdf">PDF</option>
            <option value="video">فيديو</option>
            <option value="external">رابط خارجي</option>
            <option value="other">ملف آخر</option>
          </select>
          <Button disabled={busy || !view} className="md:col-span-2">
            حفظ الرابط
          </Button>
        </form>
        {!view && (
          <p className="mt-2 text-xs text-muted-foreground">
            اختر مادة من قائمة المواد لعرض محاضراتها وإضافة موارد إليها.
          </p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="font-bold">إدارة المحتوى السابق</h2>
        <p className="mt-1 text-sm text-muted-foreground">اختر القسم والمادة لمراجعة المحاضرات وملفاتها وترتيبها.</p>
        <Input
          className="mt-3"
          placeholder="ابحث عن مادة"
          value={materialSearch}
          onChange={(e) => setMaterialSearch(e.target.value)}
        />
        <select
          className={`${sel} mt-2 max-w-xs`}
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          aria-label="تصفية المواد حسب القسم"
        >
          <option value="all">كل الأقسام</option>
          {(departments.data ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <ul className="mt-2 divide-y text-sm">
          {(subjects.data ?? [])
            .filter((subject) => subjectFilter === "all" || subject.department_id === subjectFilter)
            .filter((subject) => subject.name.toLowerCase().includes(materialSearch.trim().toLowerCase()))
            .map((s) => (
              <li key={s.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="text-start font-semibold text-primary"
                    onClick={() => setView(view === s.id ? "" : s.id)}
                  >
                    {s.name}
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                      {departments.data?.find((d) => d.id === s.department_id)?.name ?? "مشتركة"}
                    </span>
                  </button>
                  <select
                    aria-label={`قسم مادة ${s.name}`}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={s.department_id ?? ""}
                    onChange={async (e) => {
                      const { error } = await supabase
                        .from("subjects")
                        .update({ department_id: e.target.value || null })
                        .eq("id", s.id);
                      if (error) toast.error("تعذّر ربط المادة بالقسم");
                      else {
                        toast.success("تم تحديث القسم");
                        qc.invalidateQueries();
                      }
                    }}
                  >
                    <option value="">مشتركة</option>
                    {(departments.data ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => delRow("subjects", s.id)}>
                    حذف
                  </Button>
                </div>
                {view === s.id && (
                  <div className="mt-3 space-y-2">
                  <Input
                    placeholder="ابحث عن محاضرة أو ملف"
                    value={lectureSearch}
                    onChange={(e) => setLectureSearch(e.target.value)}
                  />
                  <ul className="space-y-2 ps-2 text-sm">
                    {(lectures.data ?? []).filter((lecture) => {
                      const term = lectureSearch.trim().toLowerCase();
                      const names = (resources.data ?? [])
                        .filter((item) => item.lecture_id === lecture.id)
                        .map((item) => item.name.toLowerCase());
                      return !term || lecture.title.toLowerCase().includes(term) || names.some((name) => name.includes(term));
                    }).length === 0 && (
                      <li className="text-muted-foreground">لا محاضرات</li>
                    )}
                    {(lectures.data ?? []).filter((lecture) => {
                      const term = lectureSearch.trim().toLowerCase();
                      const names = (resources.data ?? [])
                        .filter((item) => item.lecture_id === lecture.id)
                        .map((item) => item.name.toLowerCase());
                      return !term || lecture.title.toLowerCase().includes(term) || names.some((name) => name.includes(term));
                    }).map((l) => (
                      <li key={l.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">المحاضرة {l.week ?? "—"}: {l.title}{l.file_path ? " · ملف قديم مرفوع" : ""}</span>
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" onClick={() => setEditingLecture({
                              id: l.id, title: l.title, week: String(l.week ?? ""), description: l.description ?? "",
                              external_url: l.external_url ?? "",
                            })}>تعديل</Button>
                            <Button size="sm" variant="destructive" onClick={() => delLecture(l.id, l.file_path)}>حذف المحاضرة</Button>
                          </div>
                        </div>
                        {editingLecture?.id === l.id && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Input placeholder="عنوان المحاضرة" value={editingLecture.title} onChange={(e) => setEditingLecture({ ...editingLecture, title: e.target.value })} />
                            <Input type="number" min={1} placeholder="رقم المحاضرة" value={editingLecture.week} onChange={(e) => setEditingLecture({ ...editingLecture, week: e.target.value })} />
                            <Input className="sm:col-span-2" placeholder="وصف المحاضرة" value={editingLecture.description} onChange={(e) => setEditingLecture({ ...editingLecture, description: e.target.value })} />
                            <Input className="sm:col-span-2" type="url" placeholder="رابط المحاضرة القديم (اختياري)" value={editingLecture.external_url} onChange={(e) => setEditingLecture({ ...editingLecture, external_url: e.target.value })} />
                            <Button size="sm" onClick={saveLectureEdit}>حفظ التعديل</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingLecture(null)}>إلغاء</Button>
                          </div>
                        )}
                        <ul className="mt-2 space-y-2 border-t pt-2 text-xs text-muted-foreground">
                          {(resources.data ?? [])
                            .filter((item) => item.lecture_id === l.id)
                            .map((item) => (
                              <li key={item.id} className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">{item.name}</span>
                                <span className="max-w-full truncate" dir="ltr">{item.url}</span>
                                <span>{item.resource_type}</span>
                                <time>{fmtDate(item.created_at, true)}</time>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => editResource(item)}
                                >
                                  تعديل
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteResource(item.id)}
                                >
                                  حذف الرابط
                                </Button>
                              </li>
                            ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                  </div>
                )}
              </li>
            ))}
        </ul>
      </Card>
      <Card className="mt-4">
        <h2 className="font-bold">المواعيد القادمة</h2>
        <ul className="mt-2 divide-y text-sm">
          {(events.data ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span>
                {kindLabel[e.kind]}: {e.title} · {fmtDate(e.starts_at, true)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => delRow("events", e.id)}>
                حذف
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
