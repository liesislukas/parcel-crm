import { SectionPage } from "@/components/SectionPage";
import { sections } from "@/lib/nav";

const section = sections.find((s) => s.slug === "campaigns")!;

export default function CampaignsPage() {
  return <SectionPage section={section} />;
}
