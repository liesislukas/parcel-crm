export type NavSection = {
  slug: string;
  href: string;
  label: string;
  blurb: string;
  planned: string[];
};

/** The seven sections of the acquisition workflow. Live routes, filled in by later issues. */
export const sections: NavSection[] = [
  {
    slug: "map",
    href: "/",
    label: "Map",
    blurb:
      "Interactive Rock Island County, IL parcel map — draw a contiguous shape, highlight every parcel inside it, and inspect power infrastructure nearby.",
    planned: [
      "Display Rock Island County, IL parcel data on an interactive map",
      "Select individual parcels from the map",
      "Display substations and power infrastructure where data is available",
    ],
  },
  {
    slug: "projects",
    href: "/projects",
    label: "Projects",
    blurb:
      "Proposed data-center sites assembled from adjacent parcels, with combined acreage, power access, and acquisition stage.",
    planned: [
      "Group adjacent parcels into a proposed data-center project",
      "Calculate the combined acreage of grouped parcels",
      "Filter projects by county, acreage, power access, outreach status, and acquisition stage",
    ],
  },
  {
    slug: "owners",
    href: "/owners",
    label: "Owners",
    blurb:
      "CRM records for every parcel owner — ownership details, mailing addresses, assessed values, and mocked contact data.",
    planned: [
      "Store parcel identifiers, ownership details, assessed values, and mailing addresses",
      "Attach mocked contact information to the appropriate owner records",
      "Record owner interest, asking price, and acquisition status",
    ],
  },
  {
    slug: "acquisitions",
    href: "/acquisitions",
    label: "Acquisitions",
    blurb:
      "Owner interest, asking price and acquisition stage for every owner, parcel, and proposed project, with the tasks assigned against each.",
    planned: [
      "Record owner interest, asking price, and acquisition status",
      "Assign acquisition tasks and next steps to team members",
    ],
  },
  {
    slug: "campaigns",
    href: "/campaigns",
    label: "Campaigns",
    blurb:
      "Simulated outreach to owners over email, direct mail, and SMS. Nothing is ever actually sent.",
    planned: [
      "Support mocked email, direct-mail, and SMS acquisition campaigns",
      "Track messages, responses, follow-ups, and contact history (all simulated)",
      "Simulate the full lifecycle: sent, received, link clicked, bounced, replied",
    ],
  },
  {
    slug: "tasks",
    href: "/tasks",
    label: "Tasks",
    blurb:
      "Acquisition tasks and next steps assigned to team members against an owner, parcel, or project.",
    planned: [
      "Assign acquisition tasks and next steps to team members",
      "Track next-step status for a selected owner, parcel, or project",
    ],
  },
  {
    slug: "export",
    href: "/export",
    label: "Export",
    blurb:
      "Download parcel, owner, and campaign activity as a dataset for further analysis outside the CRM.",
    planned: ["Export parcel, owner, and campaign data for further analysis"],
  },
];

export type FutureSection = { label: string; blurb: string };

/**
 * Assignment acceptance criterion: "Show (disabled) sections on the CRM that would expand
 * the CRM beyond the initial acquisition workflow." These render visibly greyed out and
 * labelled — never hidden, and never navigable.
 */
export const futureSections: FutureSection[] = [
  {
    label: "Due Diligence",
    blurb: "Title search, easements, environmental and survey review per parcel.",
  },
  {
    label: "Offers & Contracts",
    blurb: "Letters of intent, purchase agreements, and option contracts.",
  },
  {
    label: "Closing & Escrow",
    blurb: "Escrow milestones, funding, and recorded deed tracking.",
  },
  {
    label: "Entitlements & Permitting",
    blurb: "Zoning changes, rezoning applications, and county permit status.",
  },
  {
    label: "Power & Utility Studies",
    blurb: "Interconnection queue position, load studies, and utility correspondence.",
  },
  {
    label: "Portfolio Analytics",
    blurb: "Pipeline value, cost per acre, and acquisition velocity across projects.",
  },
  {
    label: "Team & Permissions",
    blurb: "Roles, territory assignment, and per-record access control.",
  },
  {
    label: "Integrations",
    blurb: "Sync to external CRM, GIS, and the Elephant Oracle open-data MCP.",
  },
];
