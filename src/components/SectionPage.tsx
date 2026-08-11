import type { NavSection } from "@/lib/nav";

/** Placeholder body for a workflow section. Later issues replace this with the real panel. */
export function SectionPage({ section }: { section: NavSection }) {
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

      <section className="max-w-2xl rounded-lg border border-dashed border-black/15 p-5 dark:border-white/20">
        <h2 className="text-sm font-medium">Not built yet</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          This deployment is the application shell. The panel below is what this section will carry:
        </p>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-black/70 dark:text-white/70">
          {section.planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
