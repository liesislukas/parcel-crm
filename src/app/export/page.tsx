import ExportPanel from "@/components/export/ExportPanel";
import { sections } from "@/lib/nav";

const section = sections.find((s) => s.slug === "export")!;

export default function ExportPage() {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Acquisition workflow
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{section.label}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-black/65 dark:text-white/65">
          {section.blurb}
        </p>
      </header>

      <ExportPanel />
    </article>
  );
}
