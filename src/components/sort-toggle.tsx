"use client";

import { Button } from "~/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

export function SortToggle({ value, onChange }: { value: "asc" | "desc"; onChange: (next: "asc" | "desc") => void }) {
  const isAsc = value === "asc";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 ml-1"
      aria-label={`Sort ${isAsc ? "ascending" : "descending"}`}
      onClick={() => onChange(isAsc ? "desc" : "asc")}
    >
      {isAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </Button>
  );
}


