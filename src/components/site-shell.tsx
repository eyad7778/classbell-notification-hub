import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { PreferenceControls, usePreferences } from "@/hooks/use-preferences";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold text-navy">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <GraduationCap className="size-5" />
      </span>
      <span className="text-lg" dir="ltr">Smart Student</span>
    </Link>
  );
}

export function SiteHeader() {
  const { session, isLoading } = useSession();
  const { language } = usePreferences();
  const english = language === "en";

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link to="/" className="hover:text-foreground" activeOptions={{ exact: true }} activeProps={{ className: "text-foreground font-semibold" }}>{english ? "Home" : "الرئيسية"}</Link>
          <Link to="/about" className="hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }}>{english ? "About" : "عن المشروع"}</Link>
          <Link to="/designer" className="hover:text-foreground" activeProps={{ className: "text-foreground font-semibold" }}>{english ? "Designer" : "المصمم"}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <PreferenceControls />
          {session ? (
            <Button asChild size="sm"><Link to="/app">{english ? "Student portal" : "لوحة الطالب"}</Link></Button>
          ) : !isLoading && (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/login">{english ? "Log in" : "دخول"}</Link></Button>
              <Button asChild size="sm"><Link to="/signup">{english ? "Create account" : "إنشاء حساب"}</Link></Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { language } = usePreferences();
  const english = language === "en";

  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row">
        <Logo />
        <p>{english ? "Independent student services app — not officially affiliated with the institute." : "تطبيق خدمات طلابية مستقل — غير تابع رسميًا لإدارة المعهد."}</p>
        <div className="flex gap-4">
          <Link to="/about" className="hover:text-foreground">{english ? "About" : "عن المشروع"}</Link>
          <Link to="/designer" className="hover:text-foreground">{english ? "Designer" : "المصمم"}</Link>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
