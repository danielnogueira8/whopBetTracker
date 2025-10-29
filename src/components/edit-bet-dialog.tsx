"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useWhop } from "~/lib/whop-context";
import { getBetCategoryLabel } from "~/lib/bet-category-utils";

interface EditBetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bet: any;
}

export function EditBetDialog({ open, onOpenChange, bet }: EditBetDialogProps) {
  const queryClient = useQueryClient();
  const { experience } = useWhop();
  
  const [sport, setSport] = useState("");
  const [league, setLeague] = useState("");
  const [game, setGame] = useState("");
  const [outcome, setOutcome] = useState("");
  const [betCategory, setBetCategory] = useState("");
  const [oddFormat, setOddFormat] = useState<"american" | "decimal" | "fractional">("american");
  const [oddValue, setOddValue] = useState("");
  const [unitsInvested, setUnitsInvested] = useState("");
  const [dollarsInvested, setDollarsInvested] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<"pending" | "win" | "lose" | "returned">("pending");

  useEffect(() => {
    if (bet) {
      setSport(bet.sport || "");
      setLeague(bet.league || "");
      setGame(bet.game || "");
      setOutcome(bet.outcome || "");
      setBetCategory(bet.betCategory || "");
      setOddFormat(bet.oddFormat || "american");
      setOddValue(bet.oddValue?.toString() || "");
      setUnitsInvested(bet.unitsInvested || "");
      setDollarsInvested(bet.dollarsInvested || "");
      setNotes(bet.notes || "");
      setResult(bet.result || "pending");
    }
  }, [bet]);

  const updateBet = useMutation({
    mutationFn: async (betData: any) => {
      if (!experience) throw new Error("Experience not found");
      const response = await fetch(`/api/bets/${bet.id}?experienceId=${experience.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(betData),
      });
      if (!response.ok) throw new Error("Failed to update bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-bets"] });
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateBet.mutate({
      sport,
      league: league || null,
      game,
      outcome,
      betCategory,
      oddFormat,
      oddValue,
      unitsInvested: unitsInvested || null,
      dollarsInvested: dollarsInvested || null,
      notes: notes || null,
      result,
    });
  };

  if (!bet) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pt-6 pb-4">
          <DialogTitle>Edit Bet</DialogTitle>
          <DialogDescription>
            Update the details of your bet
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-1 py-2">
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="sport">Sport</Label>
                <Input
                  id="sport"
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  placeholder="e.g., Basketball, Football"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="league">League (optional)</Label>
                <Input
                  id="league"
                  value={league}
                  onChange={(e) => setLeague(e.target.value)}
                  placeholder="e.g., NFL, NCAAF, ATP"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="game">Game</Label>
                <Input
                  id="game"
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                  placeholder="e.g., Lakers vs Warriors"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bet-category">Bet Category</Label>
                <Select
                  value={betCategory}
                  onValueChange={setBetCategory}
                >
                  <SelectTrigger id="bet-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="game_match">Match Bets</SelectItem>
                    <SelectItem value="player">Prop Bets</SelectItem>
                    <SelectItem value="team">Team Bets</SelectItem>
                    <SelectItem value="corners_cards">Corners & Cards</SelectItem>
                    <SelectItem value="period_time">Period / Time-Based</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="outcome">Outcome</Label>
                <Input
                  id="outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="e.g., Lakers win, Over 2.5, First Goalscorer, etc."
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="odd-format">Odd Format</Label>
                  <Select
                    value={oddFormat}
                    onValueChange={(value: "american" | "decimal" | "fractional") =>
                      setOddFormat(value)
                    }
                  >
                    <SelectTrigger id="odd-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="american">American</SelectItem>
                      <SelectItem value="decimal">Decimal</SelectItem>
                      <SelectItem value="fractional">Fractional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="odd-value">Odds Value</Label>
                  <Input
                    id="odd-value"
                    type="number"
                    step="0.01"
                    value={oddValue}
                    onChange={(e) => setOddValue(e.target.value)}
                    placeholder={
                      oddFormat === "american"
                        ? "+150 or -200"
                        : oddFormat === "decimal"
                        ? "2.50"
                        : "3/2"
                    }
                    required
                  />
                </div>
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
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional context or thoughts about this bet..."
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="result">Result</Label>
                <Select
                  value={result}
                  onValueChange={(value: "pending" | "win" | "lose" | "returned") =>
                    setResult(value)
                  }
                >
                  <SelectTrigger id="result">
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
          </div>
          <DialogFooter className="pb-4 pt-4 border-t mt-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateBet.isPending}>
              {updateBet.isPending ? "Updating..." : "Update Bet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

