import { SectionPage } from "@/components/SectionPage";
import { sections } from "@/lib/nav";

const section = sections.find((s) => s.slug === "projects")!;

export default function ProjectsPage() {
  return <SectionPage section={section} />;
}
