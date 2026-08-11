import { SectionPage } from "@/components/SectionPage";
import { sections } from "@/lib/nav";

const section = sections.find((s) => s.slug === "export")!;

export default function ExportPage() {
  return <SectionPage section={section} />;
}
