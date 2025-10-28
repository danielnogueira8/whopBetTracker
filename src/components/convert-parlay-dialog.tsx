"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWhop } from "~/lib/whop-context";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface UpcomingParlay {
  id: string;
  name: string;
  combinedOddFormat: "american" | "decimal" | "fractional";
  combinedOddValue: string;
  unitsInvested: string | null;
  legs: {
    id: string;
    sport: string;
    game: string;
    outcome: string;
    oddFormat: "american" | "decimal" | "fractional";
    oddValue: string;
    result: "pending" | "win" | "lose" | "returned";
    legOrder: number;
  }[];
  explanation: string | null;
}

interface ConvertParlayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parlay: UpcomingParlay | null;
}

export function ConvertParlayDialog({
  open,
  onOpenChange,
  parlay,
}: ConvertParlayDialogProps) {
  const queryClient = useQueryClient();
  const [legResults, setLegResults] = useState<Record<string, "win" | "lose" | "returned">>({});

  const { experience } = useWhop();

  const convertParlay = useMutation({
    mutationFn: async (parlayData: any) => {
      if (!parlayData.experienceId) throw new Error("Experience ID is required");
      const response = await fetch(`/api/parlays/${parlay?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parlayData),
      });
      if (!response.ok) throw new Error("Failed to convert parlay");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-parlays"] });
      queryClient.invalidateQueries({ queryKey: ["community-bets"] });
      queryClient.invalidateQueries({ queryKey: ["parlays"] });
      onOpenChange(false);
      // Reset form
      setLegResults({});
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!experience || !parlay) return;

    // Update leg results
    const updatedLegs = parlay.legs.map((leg) => ({
      ...leg,
      result: legResults[leg.id] || "pending",
    }));

    const parlayData = {
      experienceId: experience.id,
      isUpcomingBet: false,
      isCommunityBet: true,
      legs: updatedLegs,
    };

    convertParlay.mutate(parlayData);
  };

  const updateLegResult = (legId: string, result: "win" | "lose" | "returned") => {
    setLegResults((prev) => ({
      ...prev,
      [legId]: result,
    }));
  };

  if (!parlay) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pt-6 pb-4">
          <DialogTitle>Convert to Community Parlay</DialogTitle>
          <DialogDescription>
            Convert this parlay to a tracked community bet. Set the outcome for each leg.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-1 py-2">
            <div className="grid gap-4">
              <div className="p-4 border rounded-md bg-muted/50 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Parlay Details</p>
                <div className="space-y-1 text-sm">
                  <p><strong>Name:</strong> {parlay.name}</p>
                  <p><strong>Combined Odds:</strong> {parlay.combinedOddValue} ({parlay.combinedOddFormat})</p>
                  <p><strong>Legs:</strong> {parlay.legs.length}</p>
                </div>
              </div>

              <div className="space-y-4">
                <Label>Set Result for Each Leg</Label>
                {parlay.legs.map((leg, index) => (
                  <div key={leg.id} className="p-4 border rounded-md space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">Leg {index + 1}: {leg.sport}</p>
                        <p className="text-sm text-muted-foreground">{leg.game}</p>
                        <p className="text-xs text-muted-foreground">{leg.outcome}</p>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`result-${leg.id}`}>Result</Label>
                      <Select
                        value={legResults[leg.id] || "pending"}
                        onValueChange={(value: "win" | "lose" | "returned" | "pending") =>
                          updateLegResult(leg.id, value as "win" | "lose" | "returned")
                        }
                      >
                        <SelectTrigger id={`result-${leg.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="win">Win</SelectItem>
                          <SelectItem value="lose">Lose</SelectItem>
                          <SelectItem value="returned">Returned</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="pb-4 pt-4 border-t mt-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={convertParlay.isPending}>
              {convertParlay.isPending ? "Converting..." : "Convert Parlay"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

