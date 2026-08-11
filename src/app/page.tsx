import MapSection from "@/components/map/MapSection";
import { futureSections } from "@/lib/nav";

export default function MapPage() {
  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="parcel-map-heading">
        <h1 id="parcel-map-heading" className="text-lg font-semibold tracking-tight">
          Rock Island County parcel map
        </h1>
        <MapSection />
      </section>

      <section aria-labelledby="future-scope">
        <h2 id="future-scope" className="text-lg font-semibold tracking-tight">
          Beyond this milestone
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-black/60 dark:text-white/60">
          These sections would expand the CRM past the initial acquisition workflow. They are shown{" "}
          <strong className="font-medium">disabled</strong> and are not part of this milestone.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {futureSections.map((section) => (
            <li
              key={section.label}
              data-testid={`future-${section.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className="cursor-not-allowed rounded-lg border border-black/10 bg-black/[.02] p-4 opacity-55 select-none dark:border-white/15 dark:bg-white/[.03]"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{section.label}</h3>
                <span className="rounded-sm border border-current px-1.5 py-0.5 text-[9px] tracking-wide uppercase">
                  Disabled
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-black/60 dark:text-white/60">
                {section.blurb}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
