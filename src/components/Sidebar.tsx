"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { futureSections, referenceSections, sections } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="CRM sections"
      className="flex w-full shrink-0 flex-col gap-8 border-b border-black/10 bg-black/[.02] p-5 sm:w-72 sm:border-r sm:border-b-0 dark:border-white/15 dark:bg-white/[.03]"
    >
      <div>
        <Link href="/" className="block">
          <span className="text-base font-semibold tracking-tight">Parcel CRM</span>
          <span className="mt-0.5 block text-xs text-black/55 dark:text-white/55">
            Rock Island County, IL
          </span>
        </Link>
      </div>

      <div>
        <h2 className="mb-2 px-2 text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Acquisition workflow
        </h2>
        <ul className="flex flex-col gap-0.5">
          {sections.map((section) => {
            const isActive = pathname === section.href;
            return (
              <li key={section.slug}>
                <Link
                  href={section.href}
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`nav-${section.slug}`}
                  className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-black/[.07] font-medium text-black dark:bg-white/[.12] dark:text-white"
                      : "text-black/75 hover:bg-black/[.04] dark:text-white/75 dark:hover:bg-white/[.06]"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 px-2 text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Reference
        </h2>
        <ul className="flex flex-col gap-0.5">
          {referenceSections.map((section) => {
            const isActive = pathname === section.href;
            return (
              <li key={section.slug}>
                <Link
                  href={section.href}
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`nav-${section.slug}`}
                  className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-black/[.07] font-medium text-black dark:bg-white/[.12] dark:text-white"
                      : "text-black/75 hover:bg-black/[.04] dark:text-white/75 dark:hover:bg-white/[.06]"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h2 className="mb-1 px-2 text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Beyond this milestone
        </h2>
        <p className="mb-2 px-2 text-[11px] text-black/45 dark:text-white/45">
          Disabled — out of scope for the acquisition workflow.
        </p>
        <ul className="flex flex-col gap-0.5">
          {futureSections.map((section) => (
            <li key={section.label}>
              <span
                aria-disabled="true"
                title="Out of scope for this milestone"
                data-testid={`nav-disabled-${section.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                className="flex cursor-not-allowed items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-black/35 select-none dark:text-white/30"
              >
                {section.label}
                <span className="rounded-sm border border-current px-1 text-[9px] tracking-wide uppercase opacity-80">
                  Soon
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
