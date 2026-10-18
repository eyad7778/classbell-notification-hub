import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/site-shell";
import { useMe } from "@/hooks/use-me";
import { ErrorBox, Loading } from "@/components/app-ui";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "الرئيسية والمدفوعات", exact: true },
  { to: "/admin/students", label: "الطلاب" },
  { to: "/admin/content", label: "الأقسام والمحتوى" },
  { to: "/admin/messages", label: "الإعلانات والإشعارات" },
  { to: "/admin/settings", label: "الإعدادات" },
] as const;

function AdminLayout() {
  const me = useMe();
  if (me.isLoading) return <Loading />;
  if (!me.data?.isStaff)
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorBox text="هذه الصفحة للإدارة فقط." />
        <Link to="/app" className="mt-4 block text-primary">
          العودة
        </Link>
      </div>
    );
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full bg-navy px-2 py-0.5 text-xs text-primary-foreground">
              الإدارة
            </span>
          </div>
          <Link to="/app" className="flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowRight className="size-4" /> واجهة الطالب
          </Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: "exact" in n }}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              activeProps={{ className: "bg-primary-soft font-semibold text-accent-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
