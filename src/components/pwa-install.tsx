import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaInstall() {
  const { language } = usePreferences();
  const english = language === "en";
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [manualHelp, setManualHelp] = useState(false);
  const [installError, setInstallError] = useState("");

  useEffect(() => {
    const refreshInstalled = () => {
      setInstalled(
        isStandalone() || window.localStorage.getItem("smart-study-installed") === "yes",
      );
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      window.localStorage.setItem("smart-study-installed", "yes");
      setInstalled(true);
      setInstallPrompt(null);
    };
    refreshInstalled();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installAndroid() {
    if (!installPrompt) {
      setManualHelp(true);
      setHelpOpen(true);
      return;
    }
    setInstallError("");
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") setInstalled(true);
    } catch (error) {
      console.error("PWA installation prompt failed", error);
      setManualHelp(true);
      setHelpOpen(true);
      setInstallError(
        english
          ? "Could not open the installation prompt. Use the browser menu to install the app."
          : "تعذّر فتح نافذة التثبيت. استخدم قائمة المتصفح لتثبيت التطبيق.",
      );
    }
  }

  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <>
      {installed ? (
        <p role="status" className="mt-4 text-sm font-semibold text-cyan-100">
          {english ? "Smart Study is already installed." : "تطبيق Smart Study مثبت بالفعل."}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2" dir={english ? "ltr" : "rtl"}>
          <Button type="button" variant="secondary" onClick={installAndroid}>
            <Download className="size-4" />
            {english ? "Install on Android" : "تثبيت التطبيق على Android"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              setManualHelp(false);
              setHelpOpen(true);
            }}
          >
            <Smartphone className="size-4" />
            {english ? "Install on iPhone" : "تثبيت التطبيق على iPhone"}
          </Button>
        </div>
      )}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent dir={english ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle>
              {manualHelp
                ? english ? "Install Smart Study" : "تثبيت Smart Study"
                : english ? "Add Smart Study to your iPhone" : "إضافة Smart Study إلى iPhone"}
            </DialogTitle>
          </DialogHeader>
          {manualHelp ? (
            <ol className="list-inside list-decimal space-y-3 text-sm leading-7">
              <li>{english ? "Open this website in Chrome." : "افتح الموقع في متصفح Chrome."}</li>
              <li>{english ? "Open the browser menu and choose Install app or Add to Home screen." : "افتح قائمة المتصفح واختر تثبيت التطبيق أو الإضافة إلى الشاشة الرئيسية."}</li>
              <li>{english ? "Confirm the installation." : "أكّد التثبيت."}</li>
            </ol>
          ) : (
            <ol className="list-inside list-decimal space-y-3 text-sm leading-7">
              <li>{english ? "Open this website in Safari." : "افتح الموقع من Safari."}</li>
              <li>{english ? "Tap the Share button." : "اضغط زر المشاركة."}</li>
              <li>{english ? "Choose “Add to Home Screen”." : "اختر “Add to Home Screen” أو “إضافة إلى الشاشة الرئيسية”."}</li>
              <li>{english ? "Tap Add." : "اضغط «إضافة»."}</li>
            </ol>
          )}
          {installError && <p role="alert" className="text-sm text-destructive">{installError}</p>}
          {ios && !manualHelp && (
            <p className="text-xs text-muted-foreground">
              {english
                ? "Safari adds the app manually; this button does not install it automatically."
                : "تتم الإضافة يدويًا من Safari؛ هذا الزر لا يثبّت التطبيق تلقائيًا."}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
