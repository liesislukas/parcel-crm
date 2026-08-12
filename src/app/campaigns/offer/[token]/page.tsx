"use client";
import { use } from "react";
import { OfferLanding } from "@/components/campaigns/OfferLanding";

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <OfferLanding token={token} />;
}
