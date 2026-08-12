"use client";
import { use } from "react";
import { CampaignDetail } from "@/components/campaigns/CampaignDetail";

export default function Page({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  return <CampaignDetail campaignId={campaignId} />;
}
