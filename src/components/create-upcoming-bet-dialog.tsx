"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWhop } from "~/components/whop-context";
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

interface CreateUpcomingBetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUpcomingBetDialog({
  open,
  onOpenChange,
}: CreateUpcomingBetDialogProps) {
  const queryClient = useQueryClient();
  const [sport, setSport] = useState("");
  const [game, setGame] = useState("");
  const [outcome, setOutcome] = useState("");
  const [betCategory, setBetCategory] = useState<string>("game_match");
  const [oddFormat, setOddFormat] = useState<"american" | "decimal" | "fractional">("american");
  const [oddValue, setOddValue] = useState("");
  const [explanation, setExplanation] = useState("");
  const [eventDate, setEventDate] = useState("");

  const oddPlaceholders = {
    american: "+150 or -200",
    decimal: "2.50",
    fractional: "3/2 or 1/3",
  };

  const { experience } = useWhop();

  const createBet = useMutation({
    mutationFn: async (betData: any) => {
      const response = await fetch("/api/upcoming-bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...betData,
          experienceId: experience.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to create upcoming bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-bets"] });
      onOpenChange(false);
      // Reset form
      setSport("");
      setGame("");
      setOutcome("");
      setBetCategory("game_match");
      setOddValue("");
      setExplanation("");
      setEventDate("");
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
      explanation,
      eventDate,
    };

    createBet.mutate(betData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Prediction</DialogTitle>
          <DialogDescription>
            Add your prediction with an explanation for the community.
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
            <div className="grid gap-2">
              <Label htmlFor="explanation">Explanation</Label>
              <Textarea
                id="explanation"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Explain your prediction reasoning..."
                className="min-h-[100px]"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-date">Event Date & Time</Label>
              <Input
                id="event-date"
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
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
              {createBet.isPending ? "Creating..." : "Create Prediction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

