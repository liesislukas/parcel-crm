import ProjectDetailPanel from "@/components/projects/ProjectDetailPanel";

export default async function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  return <ProjectDetailPanel id={id} />;
}
