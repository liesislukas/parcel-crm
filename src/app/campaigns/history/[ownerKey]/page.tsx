"use client";
import { use } from "react";
import { ContactHistory } from "@/components/campaigns/ContactHistory";

export default function Page({ params }: { params: Promise<{ ownerKey: string }> }) {
  const { ownerKey } = use(params);
  return <ContactHistory ownerKey={ownerKey} />;
}
