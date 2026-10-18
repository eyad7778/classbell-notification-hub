import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth-card";
import { supabase } from "@/integrations/supabase/client";
import { authErrorAr, isValidEgyptPhone, normalizePhone, phoneToEmail } from "@/lib/auth";
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "إنشاء حساب — Smart Student" },
      { name: "description", content: "أنشئ حسابك الطلابي في Smart Student خلال دقيقة." },
      { property: "og:title", content: "إنشاء حساب — Smart Student" },
      { property: "og:description", content: "انضم إلى Smart Student برقم هاتفك." },
    ],
  }),
  component: Signup,
});

function Signup() {
  const navigate = useNavigate();
  const t = useText();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    studentCode: "",
    departmentId: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const departments = useQuery({
    queryKey: ["signup-departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const name = form.name.trim();
    const p = normalizePhone(form.phone);
    const studentCode = form.studentCode.trim();
    if (name.length < 5 || !name.includes(" "))
      return setError(t("اكتب اسمك الكامل (الاسم الأول واسم العائلة على الأقل).", "Enter your full name (first and last name)."));
    if (!isValidEgyptPhone(p)) return setError(t("أدخل رقم هاتف مصري صحيح مثل 01012345678.", "Enter a valid Egyptian phone number, e.g. 01012345678."));
    if (studentCode.length < 2 || studentCode.length > 40)
      return setError(t("أدخل كود الطالب الموجود على الكارنيه.", "Enter the student code printed on your ID."));
    if (
      !form.departmentId ||
      !departments.data?.some((department) => department.id === form.departmentId)
    )
      return setError(t("اختر قسمًا دراسيًا متاحًا.", "Choose an available department."));
    if (form.password.length < 8) return setError(t("كلمة المرور يجب ألا تقل عن 8 أحرف.", "Password must be at least 8 characters."));
    if (form.password !== form.confirm) return setError(t("كلمتا المرور غير متطابقتين.", "Passwords do not match."));
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(p),
      password: form.password,
      options: {
        data: {
          full_name: name,
          phone: p,
          student_code: studentCode,
          department_id: form.departmentId,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      if (
        error.message.toLowerCase().includes("student_code") ||
        error.message.toLowerCase().includes("profiles_student_code_unique")
      )
        return setError(t("كود الطالب مسجل بالفعل.", "This student code is already registered."));
      return setError(t(authErrorAr(error.message), "Could not create your account. Check your details and try again."));
    }
    if (!data.session) return setError(t("تم إنشاء الحساب. سجّل الدخول الآن.", "Account created. Sign in to continue."));
    navigate({ to: "/app" });
  }

  return (
    <AuthCard
      title={t("إنشاء حساب جديد", "Create your account")}
      subtitle={t("خطوة واحدة وتبدأ رحلتك مع Smart Student.", "One step to get started with Smart Student.")}
      footer={
        <>
          {t("لديك حساب بالفعل؟", "Already have an account?")}{" "}
          <Link to="/login" className="font-semibold text-primary">
            {t("سجّل الدخول", "Sign in")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">{t("الاسم الكامل", "Full name")}</Label>
          <Input id="name" autoComplete="name" value={form.name} onChange={set("name")} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t("رقم الهاتف", "Phone number")}</Label>
          <Input
            id="phone"
            inputMode="tel"
            dir="ltr"
            className={t("text-right", "text-left")}
            autoComplete="tel"
            value={form.phone}
            onChange={set("phone")}
            placeholder="01xxxxxxxxx"
            required
          />
          <p className="text-xs leading-6 text-muted-foreground">
            {t("يرجى إدخال رقم الهاتف المرتبط بحساب Telegram الذي تستخدمه، حتى تتمكن من ربط حسابك واستقبال إشعارات المنصة عليه. إدخال الرقم وحده لا يعني اكتمال ربط Telegram؛ ستحتاج إلى الضغط على زر ربط حساب Telegram بعد تفعيل اشتراكك.", "Use the phone number linked to your Telegram account. You can connect Telegram and receive platform notifications after your subscription is activated.")}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="student-code">{t("كود الطالب بالكارنيه", "Student ID code")}</Label>
          <Input
            id="student-code"
            value={form.studentCode}
            onChange={set("studentCode")}
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="department">{t("القسم الدراسي", "Department")}</Label>
          <select
            id="department"
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            required
            disabled={departments.isLoading || !departments.data?.length}
          >
            <option value="">
              {departments.isLoading
                ? t("جارٍ تحميل الأقسام…", "Loading departments…")
                : departments.data?.length
                  ? t("اختر القسم", "Choose a department")
                  : t("لا توجد أقسام متاحة حاليًا", "No departments are currently available")}
            </option>
            {departments.data?.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          {departments.isError && (
            <p role="alert" className="text-xs text-destructive">
              {t("تعذّر تحميل الأقسام. أعد تحميل الصفحة أو تواصل مع الإدارة.", "Could not load departments. Reload the page or contact the administration.")}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">{t("كلمة المرور", "Password")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={set("password")}
                className="pe-10"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? t("إخفاء كلمة المرور", "Hide password") : t("عرض كلمة المرور", "Show password")}
                className="absolute inset-y-0 end-2 text-muted-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("تأكيد كلمة المرور", "Confirm password")}</Label>
            <div className="relative">
              <Input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirm}
                onChange={set("confirm")}
                className="pe-10"
                required
              />
              <button
                type="button"
                aria-label={showConfirm ? t("إخفاء كلمة المرور", "Hide password") : t("عرض كلمة المرور", "Show password")}
                className="absolute inset-y-0 end-2 text-muted-foreground"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />} {t("إنشاء حساب", "Create account")}
        </Button>
      </form>
    </AuthCard>
  );
}
