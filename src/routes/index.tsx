import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, BookOpen, CalendarClock, CreditCard, Megaphone, Send, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/site-shell";
import { useSettings } from "@/hooks/use-settings";
import { usePreferences } from "@/hooks/use-preferences";
import { useSession } from "@/hooks/use-session";
import hero from "@/assets/hero.jpg";
import designerPhoto from "@/assets/designer-photo.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Student — خدماتك الطلابية في مكان واحد" },
      { name: "description", content: "تطبيق خدمات طلابية يجمع الإعلانات والمحاضرات والمواعيد والإشعارات عبر Telegram في مكان واحد." },
      { property: "og:title", content: "Smart Student — خدماتك الطلابية في مكان واحد" },
      { property: "og:description", content: "الإعلانات والمحاضرات والمواعيد والإشعارات في تطبيق واحد بدل المجموعات المتفرقة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function whatsappHref(value: string) {
  const phone = value.trim();
  if (/^https?:\/\//i.test(phone)) return phone;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  return digits ? `https://wa.me/${digits}` : "#";
}

const features = [
  { icon: Megaphone, title: ["الإعلانات أولًا بأول", "Updates as they happen"], text: ["أخبار وإعلانات منظّمة بدل البحث في عشرات المجموعات.", "Stay on top of organized notices without searching through group chats."] },
  { icon: BookOpen, title: ["المواد والمحاضرات", "Subjects and lectures"], text: ["ملفات كل مادة مرتبة حسب الأسبوع وجاهزة للتحميل.", "Find lecture files organized by subject and week."] },
  { icon: CalendarClock, title: ["المواعيد والامتحانات", "Dates and exams"], text: ["جدول المحاضرات والامتحانات والتكليفات في مكان واحد.", "Keep lectures, exams, and assignments in one schedule."] },
  { icon: Bell, title: ["إشعارات فورية", "Timely notifications"], text: ["تنبيهات داخل التطبيق وعلى Telegram لكل جديد يخصك.", "Get relevant updates in the app and on Telegram."] },
];

const steps = [
  { icon: UserPlus, title: ["أنشئ حسابك", "Create your account"], text: ["بالاسم ورقم الهاتف وكلمة مرور.", "Sign up with your name, phone number, and password."] },
  { icon: CreditCard, title: ["فعّل اشتراكك", "Activate your subscription"], text: ["ادفع بإحدى الطرق المتاحة وأرسل بيانات العملية للمراجعة.", "Pay using an available method and send the details for review."] },
  { icon: Send, title: ["اربط Telegram", "Connect Telegram"], text: ["بضغطة واحدة لتصلك الإشعارات مباشرة.", "Link your account to receive Telegram notifications."] },
  { icon: ShieldCheck, title: ["ابدأ الاستخدام", "Start studying"], text: ["وصول كامل للمحتوى طوال مدة الاشتراك.", "Access your study content while your subscription is active."] },
];

function Index() {
  const { data: s } = useSettings();
  const { language } = usePreferences();
  const { session } = useSession();
  const english = language === "en";
  return (
    <PublicLayout>
      <section className="brand-hero relative isolate overflow-hidden text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100 backdrop-blur">
              <span className="size-1.5 rounded-full bg-[#28e4e8] shadow-[0_0_10px_#28e4e8]" />
              {english ? "For students of Pharaos Higher Institute for Computers, Information Systems and Management" : "لطلاب معهد الفراعنة العالي للحاسب ونظم المعلومات والإدارة"}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-white md:text-5xl">
              {english ? <>Your student life, <span className="text-[#2ce0e4]">in one place</span></> : <>حياتك الدراسية، <span className="text-[#2ce0e4]">في مكان واحد</span></>}
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-8 text-blue-50/75">
              {english ? "Smart Student brings announcements, lectures, schedules, and notifications together, without scattered WhatsApp and Telegram groups." : "Smart Student يجمع الإعلانات والمحاضرات والمواعيد والإشعارات، ويريحك من فوضى مجموعات الواتساب والتليجرام المتفرقة."}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {session ? (
                <Button asChild size="lg"><Link to="/app">{english ? "Open student portal" : "افتح لوحة الطالب"}</Link></Button>
              ) : (
                <>
                  <Button asChild size="lg"><Link to="/signup">{english ? "Create an account" : "إنشاء حساب مجاني"}</Link></Button>
                  <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link to="/login">{english ? "I have an account" : "لدي حساب"}</Link></Button>
                </>
              )}
            </div>
          </div>
          <img src={hero} alt={english ? "Smart Student app on a phone" : "واجهة تطبيق Smart Student على الهاتف"} width={1024} height={896} className="mx-auto w-full max-w-md" />
        </div>
      </section>

      <section className="border-b bg-muted/30 px-4 py-12 md:py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="max-w-md">
            <p className="text-sm font-semibold uppercase text-primary">{english ? "Student workspace" : "مساحة الطالب"}</p>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">{english ? "Your study dashboard, at a glance" : "لقطة سريعة من لوحتك الدراسية"}</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{english ? "Subjects, announcements, and upcoming dates stay organized in one focused view." : "المواد والإعلانات والمواعيد القادمة، مرتبة في شاشة واحدة واضحة."}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-card" aria-label={english ? "Student dashboard preview" : "معاينة لوحة الطالب"}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <p className="text-xs text-muted-foreground">Smart Student</p>
                <h3 className="mt-1 font-bold">{english ? "Good morning, student" : "صباح الخير، يا طالب"}</h3>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{english ? "Active" : "اشتراك نشط"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {[
                { label: english ? "Subjects" : "المواد", value: "6", color: "bg-sky-100 text-sky-900" },
                { label: english ? "Lectures" : "المحاضرات", value: "18", color: "bg-violet-100 text-violet-900" },
                { label: english ? "New notices" : "إعلانات جديدة", value: "3", color: "bg-amber-100 text-amber-900" },
                { label: english ? "Upcoming" : "مواعيد قادمة", value: "2", color: "bg-rose-100 text-rose-900" },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-xl p-3 ${stat.color}`}>
                  <p className="text-xs font-medium">{stat.label}</p>
                  <p className="mt-1 text-2xl font-extrabold">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-bold">{english ? "My subjects" : "موادي الدراسية"}</h4>
                  <BookOpen className="size-4 text-sky-700" />
                </div>
                <div className="space-y-2 text-sm">
                  {[english ? "Information Systems" : "نظم المعلومات", english ? "Database Fundamentals" : "أساسيات قواعد البيانات", english ? "Web Programming" : "برمجة الويب"].map((subject, index) => (
                    <div key={subject} className="flex items-center gap-3 border-b pb-2 last:border-0">
                      <span className={`size-2 rounded-full ${["bg-sky-500", "bg-amber-500", "bg-emerald-500"][index]}`} />
                      <span>{subject}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-bold">{english ? "Coming up" : "القادم"}</h4>
                  <CalendarClock className="size-4 text-rose-700" />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 p-3 text-rose-950"><span>{english ? "Database lecture" : "محاضرة قواعد البيانات"}</span><span className="text-xs">09:00</span></div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-amber-950"><span>{english ? "Web programming exam" : "امتحان برمجة الويب"}</span><span className="text-xs">Thu</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b bg-card px-4 py-12 md:py-16">
        <div className="mx-auto grid max-w-5xl items-center gap-8 sm:grid-cols-[minmax(180px,260px)_1fr] sm:gap-12">
          <img
            src={designerPhoto}
            alt={english ? "Smart Student designer" : "مصمم تطبيق Smart Student"}
            width={1067}
            height={1280}
            className="mx-auto aspect-[4/5] w-full max-w-56 rounded-2xl border bg-muted object-cover shadow-card sm:mx-0"
          />
          <div>
            <p className="text-sm font-semibold text-primary">{english ? "Meet the designer" : "عن المصمم"}</p>
            <h2 className="mt-2 text-2xl font-bold">{s?.designer_name || (english ? "Smart Student designer" : "مصمم Smart Student")}</h2>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
              {english ? "A student-focused platform designed to bring study resources and updates together." : s?.designer_bio || "منصة طلابية تجمع المواد والإعلانات والمواعيد في تجربة واحدة منظمة."}
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/designer">{english ? "About the designer" : "اعرف المزيد عن المصمم"}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold md:text-3xl">{english ? "What you can do" : "ماذا يقدم لك التطبيق؟"}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title[0]} className="rounded-2xl border bg-card p-5 shadow-card">
              <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"><f.icon className="size-5" /></span>
              <h3 className="mt-4 font-bold">{f.title[english ? 1 : 0]}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{f.text[english ? 1 : 0]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold md:text-3xl">{english ? "Getting started" : "كيف تبدأ؟"}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {steps.map((st, i) => (
              <li key={st.title[0]} className="relative">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
                  <st.icon className="size-5 text-primary" />
                </div>
                <h3 className="mt-3 font-bold">{st.title[english ? 1 : 0]}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{st.text[english ? 1 : 0]}</p>
              </li>
            ))}
          </ol>
          {s && (
            <p className="mt-8 rounded-xl bg-primary-soft px-4 py-3 text-sm text-accent-foreground">
              {english ? "Annual subscription:" : "الاشتراك السنوي:"} <b>{s.subscription_price} {s.currency}</b> {english ? <>for <b>one year</b>.</> : <>لمدة <b>سنة واحدة</b>.</>}
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="rounded-3xl bg-navy p-8 text-primary-foreground md:p-12">
          <h2 className="text-2xl font-bold text-primary-foreground md:text-3xl">{english ? "Need help?" : "تحتاج مساعدة؟"}</h2>
          <p className="mt-2 opacity-80">{english ? "Contact support with questions about your account or subscription." : "فريق الدعم متاح للرد على استفساراتك حول الحساب والاشتراك."}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            {s?.support_phone && <a href={whatsappHref(s.support_phone)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary-foreground/10 px-3 py-2 transition hover:bg-primary-foreground/20" dir="ltr">واتساب · {s.support_phone}</a>}
            {s?.support_email && <a href={`mailto:${s.support_email}`} className="rounded-lg bg-primary-foreground/10 px-3 py-2 transition hover:bg-primary-foreground/20" dir="ltr">{s.support_email}</a>}
            {s?.support_telegram && <a href={/^https?:\/\//i.test(s.support_telegram) ? s.support_telegram : `https://t.me/${s.support_telegram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary-foreground/10 px-3 py-2 transition hover:bg-primary-foreground/20" dir="ltr">{s.support_telegram}</a>}
            {!s?.support_phone && !s?.support_email && !s?.support_telegram && (
              <span className="opacity-70">ستُضاف بيانات التواصل قريبًا من الإدارة.</span>
            )}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
