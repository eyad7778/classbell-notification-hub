import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Languages, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Language = "ar" | "en";
export type ColorMode = "light" | "dark";

type Preferences = {
  language: Language;
  colorMode: ColorMode;
  toggleLanguage: () => void;
  toggleColorMode: () => void;
};

const PreferencesContext = createContext<Preferences | null>(null);

function storedValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return allowed.find((option) => option === value) ?? fallback;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ar");
  const [colorMode, setColorMode] = useState<ColorMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLanguage(storedValue<Language>("smart-student-language", ["ar", "en"], "ar"));
    setColorMode(storedValue<ColorMode>("smart-student-color-mode", ["light", "dark"], "light"));
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.classList.toggle("dark", colorMode === "dark");
    if (!ready) return;
    window.localStorage.setItem("smart-student-language", language);
    window.localStorage.setItem("smart-student-color-mode", colorMode);
  }, [colorMode, language, ready]);

  return (
    <PreferencesContext.Provider
      value={{
        language,
        colorMode,
        toggleLanguage: () => setLanguage((current) => (current === "ar" ? "en" : "ar")),
        toggleColorMode: () => setColorMode((current) => (current === "light" ? "dark" : "light")),
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error("usePreferences must be used inside PreferencesProvider");
  return preferences;
}

export function useText() {
  const { language } = usePreferences();
  return (arabic: string, english: string) => (language === "en" ? english : arabic);
}

export function PreferenceControls() {
  const { language, colorMode, toggleLanguage, toggleColorMode } = usePreferences();
  const nextLanguage = language === "ar" ? "English" : "العربية";
  const nextMode = colorMode === "light" ? "الوضع الداكن" : "الوضع الفاتح";

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={nextMode}
        aria-label={nextMode}
        onClick={toggleColorMode}
      >
        {colorMode === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        title={`تغيير اللغة إلى ${nextLanguage}`}
        aria-label={`تغيير اللغة إلى ${nextLanguage}`}
        onClick={toggleLanguage}
      >
        <Languages className="size-4" />
        {language === "ar" ? "EN" : "عربي"}
      </Button>
    </div>
  );
}