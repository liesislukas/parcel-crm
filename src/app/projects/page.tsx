import { Suspense } from "react";
import ProjectsExplorer from "@/components/projects/ProjectsExplorer";
import { sections } from "@/lib/nav";

const section = sections.find((s) => s.slug === "projects")!;

export default function ProjectsPage() {
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

      <Suspense fallback={<p data-testid="projects-loading">Loading projects…</p>}>
        <ProjectsExplorer />
      </Suspense>
    </article>
  );
}
