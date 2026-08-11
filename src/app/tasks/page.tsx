import { SectionPage } from "@/components/SectionPage";
import { sections } from "@/lib/nav";

const section = sections.find((s) => s.slug === "tasks")!;

export default function TasksPage() {
  return <SectionPage section={section} />;
}
