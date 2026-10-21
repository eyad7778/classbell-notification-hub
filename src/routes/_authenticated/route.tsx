import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // This is a navigation guard, not authorization. Database RLS and server
    // functions still verify the token; don't round-trip auth on every click.
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/login" });
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});
