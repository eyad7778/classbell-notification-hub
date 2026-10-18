import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BookOpen, CalendarClock, Megaphone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePreferences } from "@/hooks/use-preferences";
import { getPushConfig, savePushSubscription } from "@/lib/push.functions";
import { getActivePushRegistration, subscribeWithKey } from "@/lib/push-client";
import { pushErrorMessage } from "@/lib/push-errors";

type PermissionState = NotificationPermission | "unsupported";

const steps = [
  {
    icon: BookOpen,
    title: ["مرحبًا بك في لوحة الطالب", "Welcome to your student dashboard"],
    body: [
      "هنا تجد كل ما يخص دراستك في مكان واحد. هذه جولة قصيرة للتعرّف على الأقسام قبل البدء.",
      "Your study tools are collected here. This short tour introduces the main sections before you begin.",
    ],
  },
  {
    icon: BookOpen,
    title: ["المواد والمحاضرات", "Subjects and lectures"],
    body: [
      "افتح «المواد» للوصول إلى محاضرات قسمك وفرقتك والملفات والروابط المرتبطة بكل مادة.",
      "Open Subjects to find lectures, files, and links for your department and study level.",
    ],
  },
  {
    icon: Megaphone,
    title: ["الإعلانات والمواعيد", "Announcements and schedule"],
    body: [
      "تابع الإعلانات المخصصة لك، وراجع مواعيد المحاضرات والامتحانات والتكليفات من شريط التنقل.",
      "Follow announcements for your department and check lectures, exams, and assignments in the schedule.",
    ],
  },
  {
    icon: UserRound,
    title: ["الحساب والإشعارات", "Account and notifications"],
    body: [
      "من «حسابي» تتابع الاشتراك وربط Telegram. فعّل إذن إشعارات المتصفح لتصلك التنبيهات أثناء استخدام الموقع.",
      "Use Account to manage your subscription and Telegram link. Allow browser notifications to receive alerts while the site is open.",
    ],
  },
] as const;

export function StudentOnboarding({ userId }: { userId: string | null }) {
  const { language } = usePreferences();
  const english = language === "en";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [permission, setPermission] = useState<PermissionState>("unsupported");
  const [pushState, setPushState] = useState<"idle" | "connecting" | "enabled" | "error">("idle");
  const [pushError, setPushError] = useState("");
  const getConfig = useServerFn(getPushConfig);
  const saveSubscription = useServerFn(savePushSubscription);

  useEffect(() => {
    if (!userId) return;
    setOpen(window.localStorage.getItem(`smart-student-tour:${userId}`) !== "done");
    if ("Notification" in window) setPermission(Notification.permission);
    if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
      void getConfig()
        .then(async ({ publicKey }) => {
          if (!publicKey) return;
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription = await registration?.pushManager.getSubscription();
          const json = subscription?.toJSON();
          if (subscription && json?.keys?.p256dh && json.keys.auth) {
            await saveSubscription({ data: {
              endpoint: subscription.endpoint,
              keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
            } });
            setPushState("enabled");
          }
          else {
            setStep(steps.length - 1);
            setOpen(true);
          }
        })
        .catch((error: unknown) => {
          setPushState("error");
          setPushError(pushErrorMessage(error, english));
          setStep(steps.length - 1);
          setOpen(true);
        });
    }
  }, [getConfig, saveSubscription, userId, english]);

  const current = steps[step] ?? steps[0];
  const permissionGranted = permission === "granted" || permission === "unsupported";
  const isLastStep = step === steps.length - 1;

  async function enablePush() {
    if (pushState === "connecting") return;
    setPushError("");
    setPushState("connecting");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("This browser does not support device push notifications.");
      }
      if (!("Notification" in window)) {
        throw new Error("On iPhone, add the site to the Home Screen first, then open it from there.");
      }
      const granted = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        setPushState("idle");
        return;
      }
      const config = await getConfig();
      if (!config.publicKey) throw new Error("Web Push is not configured on the server yet.");
      const registration = await getActivePushRegistration();
      const subscription = await subscribeWithKey(registration, config.publicKey);
      const json = subscription.toJSON();
      if (!json.keys?.["p256dh"] || !json.keys["auth"]) throw new Error("Could not read the browser push keys.");
      await saveSubscription({ data: {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys["p256dh"], auth: json.keys["auth"] },
      } });
      setPushState("enabled");
    } catch (error) {
      setPushState("error");
      setPushError(pushErrorMessage(error, english));
    }
  }

  function finish() {
    if (!userId || !permissionGranted) return;
    window.localStorage.setItem(`smart-student-tour:${userId}`, "done");
    setOpen(false);
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && !permissionGranted) return;
    if (!nextOpen) finish();
    else setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent dir={english ? "ltr" : "rtl"}>
        <DialogHeader>
          <div className="mb-3 grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
            {isLastStep ? <Bell className="size-5" /> : <current.icon className="size-5" />}
          </div>
          <DialogTitle>{current.title[english ? 1 : 0]}</DialogTitle>
          <DialogDescription className="leading-7">
            {current.body[english ? 1 : 0]}
          </DialogDescription>
        </DialogHeader>

        {isLastStep && (
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-medium">
              {pushState === "enabled"
                ? english
                  ? "Device notifications are connected."
                  : "تم ربط إشعارات الجهاز بنجاح."
                : permission === "granted"
                ? english
                  ? "Browser permission is granted. Connect this device below to receive notifications when the app is closed."
                  : "إذن المتصفح مفعّل. اربط هذا الجهاز أدناه لتصلك الإشعارات عند إغلاق التطبيق."
                : permission === "denied"
                  ? english
                    ? "Notifications are blocked. Change this site's permission in your browser settings, then reload."
                    : "الإشعارات محظورة. غيّر إذن هذا الموقع من إعدادات المتصفح ثم أعد تحميل الصفحة."
                  : permission === "unsupported"
                    ? english
                      ? "This browser does not support notifications. You can still read in-app and Telegram alerts."
                      : "هذا المتصفح لا يدعم الإشعارات. ستظل إشعارات التطبيق وTelegram متاحة."
                    : english
                      ? "Allow browser notifications to continue."
                      : "اسمح بإشعارات المتصفح للمتابعة."}
            </p>
            {permission !== "unsupported" && pushState !== "enabled" && (
              <Button type="button" onClick={enablePush} disabled={pushState === "connecting"}>
                <Bell className="size-4" />
                {pushState === "connecting"
                  ? english ? "Connecting…" : "جارٍ الربط…"
                  : permission === "granted"
                  ? english ? "Connect this device" : "ربط هذا الجهاز"
                  : english ? "Enable device notifications" : "تفعيل إشعارات الجهاز"}
              </Button>
            )}
            {pushError && <p role="alert" className="text-sm text-destructive">{pushError}</p>}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{english ? `Step ${step + 1} of ${steps.length}` : `الخطوة ${step + 1} من ${steps.length}`}</span>
          <div className="flex gap-1" aria-hidden="true">
            {steps.map((item, index) => (
              <span
                key={item.title[0]}
                className={`h-1.5 w-5 rounded-full ${index === step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </div>
        <DialogFooter>
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              {english ? "Back" : "السابق"}
            </Button>
          )}
          {isLastStep ? (
            <Button type="button" onClick={finish} disabled={!permissionGranted}>
              {english ? "Start studying" : "ابدأ الدراسة"}
            </Button>
          ) : (
            <Button type="button" onClick={() => setStep(step + 1)}>
              {english ? "Continue" : "متابعة"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
