"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface CreateBetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCommunityBet?: boolean;
}

export function CreateBetDialog({
  open,
  onOpenChange,
  isCommunityBet = false,
}: CreateBetDialogProps) {
  const queryClient = useQueryClient();
  const [sport, setSport] = useState("");
  const [game, setGame] = useState("");
  const [outcome, setOutcome] = useState("");
  const [betCategory, setBetCategory] = useState<string>("game_match");
  const [oddFormat, setOddFormat] = useState<"american" | "decimal" | "fractional">("american");
  const [oddValue, setOddValue] = useState("");
  const [unitsInvested, setUnitsInvested] = useState("");
  const [dollarsInvested, setDollarsInvested] = useState("");
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [result, setResult] = useState<"pending" | "win" | "lose" | "returned">("pending");

  const oddPlaceholders = {
    american: "+150 or -200",
    decimal: "2.50",
    fractional: "3/2 or 1/3",
  };

  const createBet = useMutation({
    mutationFn: async (betData: any) => {
      const response = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(betData),
      });
      if (!response.ok) throw new Error("Failed to create bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-bets"] });
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      onOpenChange(false);
      // Reset form
      setSport("");
      setGame("");
      setBetCategory("game_match");
      setOutcome("");
      setOddValue("");
      setUnitsInvested("");
      setDollarsInvested("");
      setDate("");
      setResult("pending");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const betData = {
      sport,
      game,
      outcome,
      betCategory,
      oddFormat,
      oddValue: parseFloat(oddValue),
      unitsInvested: unitsInvested ? parseFloat(unitsInvested) : null,
      dollarsInvested: dollarsInvested ? parseFloat(dollarsInvested) : null,
      date: date || new Date().toISOString().split("T")[0],
      result,
      isCommunityBet,
    };

    createBet.mutate(betData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isCommunityBet ? "Log New Community Bet" : "Log New Bet"}
          </DialogTitle>
          <DialogDescription>
            Enter the details for your bet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
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
                  <SelectItem value="player">Player Bets (Prop Bets)</SelectItem>
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
                  placeholder={oddPlaceholders[oddFormat]}
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
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createBet.isPending}>
              {createBet.isPending ? "Creating..." : "Create Bet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

