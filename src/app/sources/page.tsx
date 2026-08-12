import inventory from "@/data/rock-island-sources.json";
import {
  ABSENT_VALUE,
  isUnmeasured,
  statusLabel,
  type SourceInventory,
  type SourceRow,
  type UnavailableSignal,
} from "@/lib/sources";

export const metadata = { title: "Data sources — Rock Island County, IL" };

const data = inventory as SourceInventory;

const toneClass: Record<"ok" | "warn" | "gap", string> = {
  ok: "border-emerald-600/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
  warn: "border-amber-600/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
  gap: "border-black/25 text-black/55 dark:border-white/30 dark:text-white/55",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z]+/g, "-");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
        {label}
      </dt>
      <dd className="text-sm break-words text-black/75 dark:text-white/75">{children}</dd>
    </div>
  );
}

function SourceCard({ source }: { source: SourceRow }) {
  const status = statusLabel(source.status);
  const throughput = isUnmeasured(source.throughput) ? ABSENT_VALUE : source.throughput;
  const licence = isUnmeasured(source.licence) ? ABSENT_VALUE : source.licence;

  return (
    <article
      data-testid={`source-card-${source.id}`}
      className="flex flex-col gap-3 rounded-lg border border-black/15 p-4 dark:border-white/20"
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-medium">{source.name}</h3>
          <span
            className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${toneClass[status.tone]}`}
          >
            {status.text}
          </span>
        </div>
        <p className="text-xs text-black/55 dark:text-white/55">{source.publisher}</p>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs break-all text-black/60 underline hover:text-black dark:text-white/60 dark:hover:text-white"
          >
            {source.url}
          </a>
        ) : (
          <p className="text-xs text-black/45 dark:text-white/45">
            No URL — no online source exists for this jurisdiction.
          </p>
        )}
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Access method">{source.accessMethod}</Field>
        <Field label="Records">
          {source.recordCount === null ? (
            <span className="text-black/50 dark:text-white/50">—</span>
          ) : (
            source.recordCount.toLocaleString("en-US")
          )}
        </Field>
        <Field label="Throughput">{throughput}</Field>
        <Field label="Feasibility (48-hour gate)">
          <code className="rounded-sm bg-black/[.06] px-1 py-0.5 text-xs dark:bg-white/[.10]">
            {source.feasibility}
          </code>
        </Field>
        <Field label="Licence">{licence}</Field>
        <Field label="Verified">{source.verifiedAt}</Field>
      </dl>

      <div>
        <dt className="text-[10px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Constraints
        </dt>
        <dd className="mt-0.5 text-sm leading-relaxed break-words text-black/70 dark:text-white/70">
          {source.constraints}
        </dd>
      </div>
    </article>
  );
}

function SignalRow({ signal }: { signal: UnavailableSignal }) {
  return (
    <article
      data-testid={`unavailable-signal-${slug(signal.signal)}`}
      className="flex flex-col gap-2 rounded-lg border border-black/15 p-4 dark:border-white/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{signal.signal}</h3>
        <span
          className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${
            signal.verdict === "public-source-found" ? toneClass.ok : toneClass.gap
          }`}
        >
          {signal.verdict}
        </span>
      </div>
      <p className="text-xs text-black/55 dark:text-white/55">{signal.assignmentLine}</p>
      <p className="text-sm leading-relaxed break-words text-black/80 dark:text-white/80">
        {signal.uiStatement}
      </p>
      <div>
        <dt className="text-[10px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          What was checked
        </dt>
        <dd className="mt-0.5 text-sm leading-relaxed break-words text-black/65 dark:text-white/65">
          {signal.whatWasChecked}
        </dd>
      </div>
    </article>
  );
}

export default function SourcesPage() {
  // Group by category, preserving the order categories first appear in the data.
  const categories: string[] = [];
  for (const source of data.sources) {
    if (!categories.includes(source.category)) categories.push(source.category);
  }

  return (
    <article data-testid="sources-page" className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Reference
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Rock Island County data sources</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-black/65 dark:text-white/65">
          Every public data source located for {data.countyName}, with how it is reached, how fast
          it is, what constrains it, and a 48-hour feasibility decision. Sources we could not reach
          say so — and say what that does and does not prove. Signals with no public source at all
          are listed at the bottom rather than quietly filled in.{" "}
          <a
            href={data.findingsDocUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-black dark:hover:text-white"
          >
            Full findings document (source-discovery run)
          </a>
          .
        </p>
      </header>

      <section
        data-testid="sources-egress-note"
        className="max-w-3xl rounded-lg border border-amber-600/30 bg-amber-500/[.06] p-4 dark:border-amber-400/30 dark:bg-amber-400/[.06]"
      >
        <h2 className="text-sm font-medium">Probing limitation</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-black/75 dark:text-white/75">
          {data.egressNote}
        </p>
        <p className="mt-2 text-xs text-black/50 dark:text-white/50">
          Egress country at discovery time: {data.egressCountry} · Catalog generated{" "}
          {data.generatedAt}
        </p>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold tracking-tight">Sources</h2>
        {categories.map((category) => (
          <div key={category} className="flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
              {category}
            </h3>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {data.sources
                .filter((source) => source.category === category)
                .map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
            </div>
          </div>
        ))}
      </section>

      <section data-testid="unavailable-signals" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Signals with no public source</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-black/65 dark:text-white/65">
          The pipeline assignment asks for four derived signals by name. Each is answered with a
          named public source or an explicit gap, plus what was checked to reach that conclusion. A
          proxy is never recorded as the real thing.
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.unavailableSignals.map((signal) => (
            <SignalRow key={signal.signal} signal={signal} />
          ))}
        </div>
      </section>
    </article>
  );
}
