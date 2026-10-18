import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth-card";
import { supabase } from "@/integrations/supabase/client";
import { authErrorAr, isValidEgyptPhone, normalizePhone, phoneToEmail } from "@/lib/auth";
import { useSession } from "@/hooks/use-session";
import { usePreferences } from "@/hooks/use-preferences";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — Smart Student" },
      { name: "description", content: "سجّل دخولك إلى Smart Student برقم هاتفك." },
      { property: "og:title", content: "تسجيل الدخول — Smart Student" },
      { property: "og:description", content: "ادخل إلى حسابك الطلابي." },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { session, isLoading } = useSession();
  const { language } = usePreferences();
  const english = language === "en";
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && session) navigate({ to: "/app", replace: true });
  }, [isLoading, navigate, session]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const p = normalizePhone(phone);
    if (!isValidEgyptPhone(p)) return setError(english ? "Enter a valid Egyptian phone number, e.g. 01012345678." : "أدخل رقم هاتف مصري صحيح مثل 01012345678.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: phoneToEmail(p), password });
    setLoading(false);
    if (error) return setError(english ? "The phone number or password is incorrect." : authErrorAr(error.message));
    navigate({ to: "/app" });
  }

  return (
    <AuthCard
      title={english ? "Welcome back" : "أهلًا بعودتك"}
      subtitle={english ? "Sign in with your phone number and password." : "سجّل الدخول برقم هاتفك وكلمة المرور."}
      footer={<>{english ? "Don't have an account?" : "ليس لديك حساب؟"} <Link to="/signup" className="font-semibold text-primary">{english ? "Create one" : "أنشئ حسابًا"}</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="phone">{english ? "Phone number" : "رقم الهاتف"}</Label>
          <Input id="phone" inputMode="tel" dir="ltr" className="text-right" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{english ? "Password" : "كلمة المرور"}</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />} {english ? "Sign in" : "دخول"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{english ? "Forgot your password? Contact support to reset it." : "نسيت كلمة المرور؟ تواصل مع الدعم لإعادة تعيينها."}</p>
      </form>
    </AuthCard>
  );
}
