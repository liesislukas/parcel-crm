import { SectionPage } from "@/components/SectionPage";
import { sections } from "@/lib/nav";

const section = sections.find((s) => s.slug === "owners")!;

export default function OwnersPage() {
  return <SectionPage section={section} />;
}
