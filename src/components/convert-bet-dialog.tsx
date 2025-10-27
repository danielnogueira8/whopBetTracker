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

interface UpcomingBet {
  id: string;
  sport: string;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
  explanation: string;
  eventDate: string;
}

interface ConvertBetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bet: UpcomingBet | null;
}

export function ConvertBetDialog({
  open,
  onOpenChange,
  bet,
}: ConvertBetDialogProps) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<"win" | "lose" | "returned">("win");
  const [unitsInvested, setUnitsInvested] = useState("");
  const [dollarsInvested, setDollarsInvested] = useState("");

  const { experience } = useWhop();

  if (!experience) return null;

  const convertBet = useMutation({
    mutationFn: async (betData: any) => {
      const response = await fetch(`/api/upcoming-bets/${bet?.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...betData,
          experienceId: experience.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to convert bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-bets"] });
      queryClient.invalidateQueries({ queryKey: ["community-bets"] });
      onOpenChange(false);
      // Reset form
      setResult("win");
      setUnitsInvested("");
      setDollarsInvested("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const betData = {
      result,
      unitsInvested: unitsInvested ? parseFloat(unitsInvested) : null,
      dollarsInvested: dollarsInvested ? parseFloat(dollarsInvested) : null,
    };

    convertBet.mutate(betData);
  };

  if (!bet) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to Community Bet</DialogTitle>
          <DialogDescription>
            Convert this prediction to a tracked community bet with results.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="p-4 border rounded-md bg-muted/50 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Bet Details</p>
              <div className="space-y-1 text-sm">
                <p><strong>Sport:</strong> {bet.sport}</p>
                <p><strong>Game:</strong> {bet.game}</p>
                <p><strong>Outcome:</strong> {bet.outcome}</p>
                <p><strong>Odds:</strong> {bet.oddValue} ({bet.oddFormat})</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="result">Result</Label>
              <Select
                value={result}
                onValueChange={(value: "win" | "lose" | "returned") =>
                  setResult(value)
                }
              >
                <SelectTrigger id="result">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="win">Win</SelectItem>
                  <SelectItem value="lose">Lose</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="units-invested">Units Invested (optional)</Label>
                <Input
                  id="units-invested"
                  type="number"
                  step="0.01"
                  value={unitsInvested}
                  onChange={(e) => setUnitsInvested(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dollars-invested">$ Invested (optional)</Label>
                <Input
                  id="dollars-invested"
                  type="number"
                  step="0.01"
                  value={dollarsInvested}
                  onChange={(e) => setDollarsInvested(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={convertBet.isPending}>
              {convertBet.isPending ? "Converting..." : "Convert Bet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

