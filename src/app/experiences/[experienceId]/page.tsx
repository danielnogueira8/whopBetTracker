"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWhop } from "~/lib/whop-context";

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { experience } = useWhop();

  useEffect(() => {
    if (!experience) return;
    // Redirect to upcoming-bets by default, preserving query params
    const query = searchParams?.toString()
    const url = `/experiences/${experience.id}/upcoming-bets${query ? `?${query}` : ''}`
    router.replace(url);
  }, [router, experience?.id, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
