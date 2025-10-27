"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWhop } from "~/lib/whop-context";

export default function Page() {
  const router = useRouter();
  const { experience } = useWhop();

  useEffect(() => {
    if (!experience) return;
    // Redirect to upcoming-bets by default
    router.replace(`/experiences/${experience.id}/upcoming-bets`);
  }, [router, experience?.id]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
