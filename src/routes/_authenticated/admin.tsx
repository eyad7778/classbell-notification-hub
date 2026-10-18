import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/site-shell";
import { useMe } from "@/hooks/use-me";
import { ErrorBox, Loading } from "@/components/app-ui";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "الرئيسية والمدفوعات", exact: true, permission: "payments" },
  { to: "/admin/students", label: "الطلاب", permission: "students" },
  { to: "/admin/content", label: "الأقسام والمحتوى", permission: "content" },
  { to: "/admin/messages", label: "الإعلانات والإشعارات", permission: "communications" },
  { to: "/admin/settings", label: "الإعدادات", permission: "owner" },
] as const;

function AdminLayout() {
  const me = useMe();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (me.isLoading) return <Loading />;
  const isOwner = !!me.data?.isOwner;
  const permissions = me.data?.permissions ?? [];
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const currentPage = nav.find((item) => item.to === "/admin" ? normalizedPath === "/admin" : normalizedPath.startsWith(item.to));
  const canOpenPage = isOwner || (!!currentPage && currentPage.permission !== "owner" && permissions.includes(currentPage.permission));
  if (!me.data?.isStaff || !canOpenPage)
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
          {nav.filter((n) => isOwner || (n.permission !== "owner" && permissions.includes(n.permission))).map((n) => (
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
