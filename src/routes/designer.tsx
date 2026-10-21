import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site-shell";
import { useSettings } from "@/hooks/use-settings";
import { usePreferences } from "@/hooks/use-preferences";
import designerPhoto from "@/assets/designer-photo.webp";

export const Route = createFileRoute("/designer")({
  head: () => ({
    meta: [
      { title: "مصمم التطبيق — Smart Student" },
      { name: "description", content: "نبذة عن مصمم ومطوّر تطبيق Smart Student." },
      { property: "og:title", content: "مصمم تطبيق Smart Student" },
      { property: "og:description", content: "تعرّف على صاحب فكرة Smart Student ومطوّره." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Designer,
});

function Designer() {
  const { data: s } = useSettings();
  const { language } = usePreferences();
  const english = language === "en";
  return (
    <PublicLayout>
      <div className="mx-auto grid max-w-4xl items-center gap-8 px-4 py-14 md:grid-cols-[0.8fr_1.2fr] md:gap-12 md:py-20">
        <img
          src={designerPhoto}
          decoding="async"
          alt={english ? "Smart Student designer" : "مصمم تطبيق Smart Student"}
          width={1067}
          height={1280}
          className="mx-auto aspect-[4/5] w-full max-w-xs rounded-2xl border bg-muted object-cover shadow-card"
        />
        <div className="text-center md:text-start">
          <p className="text-sm font-semibold text-primary">Smart Student</p>
          <h1 className="mt-3 text-3xl font-extrabold">{s?.designer_name || (english ? "App designer" : "مصمم التطبيق")}</h1>
          <p className="mt-4 whitespace-pre-line leading-8 text-muted-foreground">{english ? "Designer and developer of Smart Student." : s?.designer_bio}</p>
          {s?.designer_contact && <p className="mt-6 text-sm" dir="ltr">{s.designer_contact}</p>}
        </div>
      </div>
    </PublicLayout>
  );
}
