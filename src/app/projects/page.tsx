import ProjectsPanel from "@/components/projects/ProjectsPanel";

export default function ProjectsPage() {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Acquisition workflow
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-black/65 dark:text-white/65">
          Proposed data-center sites assembled from adjacent parcels, with combined acreage and
          contiguity.
        </p>
      </header>

      <ProjectsPanel />
    </article>
  );
}
