/**
 * A mocked five-person team roster. There is no authentication and no user accounts in
 * this build — every assignee here is invented for the demo and labelled as such wherever
 * it renders (see `TEAM_ROSTER_NOTE`).
 */

export type TeamMember = { id: string; name: string; role: string; initials: string };

export const TEAM_MEMBERS: TeamMember[] = [
  { id: "tm-avery-cole", name: "Avery Cole", role: "Acquisitions Lead", initials: "AC" },
  { id: "tm-jordan-pike", name: "Jordan Pike", role: "Land Agent", initials: "JP" },
  { id: "tm-riley-nunez", name: "Riley Nunez", role: "Title and Diligence", initials: "RN" },
  { id: "tm-sam-okafor", name: "Sam Okafor", role: "Outreach Coordinator", initials: "SO" },
  { id: "tm-devin-shah", name: "Devin Shah", role: "Site Engineer", initials: "DS" },
];

export const TEAM_ROSTER_NOTE =
  "Mocked team roster — this build has no authentication or user accounts.";

export function memberById(id: string): TeamMember | null {
  return TEAM_MEMBERS.find((m) => m.id === id) ?? null;
}

export function memberName(id: string): string {
  return memberById(id)?.name ?? "Unassigned";
}
