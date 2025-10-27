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
import { Switch } from "~/components/ui/switch";
import { Badge } from "~/components/ui/badge";
import { useWhop } from "~/lib/whop-context";
import { Plus, Trash2 } from "lucide-react";
import { calculateParlayOdds } from "~/lib/parlay-utils";

interface CreateBetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCommunityBet?: boolean;
  isUpcomingBet?: boolean;
}

interface Leg {
  sport: string;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
}

export function CreateBetDialog({
  open,
  onOpenChange,
  isCommunityBet = false,
  isUpcomingBet = false,
}: CreateBetDialogProps) {
  const queryClient = useQueryClient();
  const { experience, user } = useWhop();
  
  // Mode toggle
  const [isParlay, setIsParlay] = useState(false);
  
  // Single bet fields
  const [sport, setSport] = useState("");
  const [game, setGame] = useState("");
  const [outcome, setOutcome] = useState("");
  const [betCategory, setBetCategory] = useState<string>("game_match");
  const [oddFormat, setOddFormat] = useState<"american" | "decimal" | "fractional">("american");
  const [oddValue, setOddValue] = useState("");
  const [unitsInvested, setUnitsInvested] = useState("");
  const [dollarsInvested, setDollarsInvested] = useState("");
  const [notes, setNotes] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState("5");
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [result, setResult] = useState<"pending" | "win" | "lose" | "returned">("pending");
  
  // Parlay fields
  const [parlayName, setParlayName] = useState("");
  const [legs, setLegs] = useState<Leg[]>([
    { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" },
    { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" },
  ]);
  
  // Upcoming bet fields (for parlays)
  const [eventDate, setEventDate] = useState("");
  const [explanation, setExplanation] = useState("");

  const oddPlaceholders = {
    american: "+150 or -200",
    decimal: "2.50",
    fractional: "3/2 or 1/3",
  };

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setIsParlay(false);
      setSport("");
      setGame("");
      setOutcome("");
      setBetCategory("game_match");
      setOddFormat("american");
      setOddValue("");
      setUnitsInvested("");
      setDollarsInvested("");
      setNotes("");
      setConfidenceLevel("5");
      setDate(new Date().toISOString().split("T")[0]);
      setResult("pending");
      setParlayName("");
      setLegs([
        { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" },
        { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" },
      ]);
    }
  }, [open]);

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
    },
  });

  const createParlay = useMutation({
    mutationFn: async (parlayData: any) => {
      const response = await fetch("/api/parlays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parlayData),
      });
      if (!response.ok) throw new Error("Failed to create parlay");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parlays"] });
      queryClient.invalidateQueries({ queryKey: ["community-bets"] });
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!experience) return;

    if (isParlay) {
      // Validate parlay
      const validLegs = legs.filter(leg => leg.sport && leg.game && leg.outcome && leg.oddValue);
      if (validLegs.length < 2) {
        alert("Please add at least 2 valid legs");
        return;
      }

      const parlayData: any = {
        experienceId: experience.id,
        name: parlayName,
        legs: validLegs,
        isCommunityBet,
        isUpcomingBet: isUpcomingBet,
        unitsInvested: unitsInvested || null,
        dollarsInvested: dollarsInvested || null,
        notes: notes || null,
        userId: user?.id || null,
      };
      
      // Add upcoming bet fields if it's an upcoming bet
      if (isUpcomingBet) {
        parlayData.eventDate = eventDate ? new Date(eventDate).toISOString() : null;
        parlayData.explanation = explanation || null;
      }

      createParlay.mutate(parlayData);
    } else {
      // Single bet
      const betData = {
        experienceId: experience.id,
        sport,
        game,
        outcome,
        betCategory,
        oddFormat,
        oddValue: parseFloat(oddValue),
        unitsInvested: unitsInvested ? parseFloat(unitsInvested) : null,
        dollarsInvested: dollarsInvested ? parseFloat(dollarsInvested) : null,
        notes: notes || null,
        confidenceLevel: confidenceLevel ? parseInt(confidenceLevel) : 5,
        date: date || new Date().toISOString().split("T")[0],
        result,
        isCommunityBet,
      };

      createBet.mutate(betData);
    }
  };

  // Calculate combined odds for parlay
  const combinedOdds = isParlay && legs.filter(leg => leg.oddValue && parseFloat(leg.oddValue) > 0).length > 0
    ? calculateParlayOdds(
        legs.filter(leg => leg.oddValue && parseFloat(leg.oddValue) > 0).map(leg => ({
          oddFormat: leg.oddFormat,
          oddValue: leg.oddValue.toString(),
        }))
      )
    : 1;

  const addLeg = () => {
    setLegs([...legs, { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" }]);
  };

  const removeLeg = (index: number) => {
    if (legs.length > 2) {
      setLegs(legs.filter((_, i) => i !== index));
    }
  };

  const updateLeg = (index: number, field: keyof Leg, value: string) => {
    const newLegs = [...legs];
    newLegs[index] = { ...newLegs[index], [field]: value };
    setLegs(newLegs);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pt-6 pb-4">
          <DialogTitle>
            {isCommunityBet ? "Log New Community Bet" : "Log New Bet"}
          </DialogTitle>
          <DialogDescription>
            {isParlay ? "Create a multi-leg parlay" : "Enter the details for your bet"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-1 py-2">

          {/* Mode Toggle */}
        <div className="flex items-center justify-between space-x-2 rounded-lg border p-3 bg-muted/30">
          <div className="space-y-0.5">
            <Label htmlFor="parlay-mode">Parlay Mode</Label>
            <p className="text-sm text-muted-foreground">
              Create a multi-leg parlay instead of a single bet
            </p>
          </div>
          <Switch
            id="parlay-mode"
            checked={isParlay}
            onCheckedChange={setIsParlay}
          />
        </div>

          <div className="grid gap-4 py-2">
            {isParlay ? (
              // Parlay Mode
              <>
                <div className="space-y-2">
                  <Label htmlFor="parlay-name">Parlay Name</Label>
                  <Input
                    id="parlay-name"
                    placeholder="e.g., Sunday 3-Leg Parlay"
                    value={parlayName}
                    onChange={(e) => setParlayName(e.target.value)}
                    required
                  />
                </div>

                {/* Combined Odds Display */}
                {combinedOdds > 1 && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Combined Odds:</span>
                      <Badge variant="secondary">
                        {combinedOdds.toFixed(2)} (decimal)
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Legs */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label>Legs ({legs.length})</Label>
                    <Button type="button" onClick={addLeg} variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Leg
                    </Button>
                  </div>

                  {legs.map((leg, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Leg {index + 1}</h4>
                        {legs.length > 2 && (
                          <Button
                            type="button"
                            onClick={() => removeLeg(index)}
                            variant="ghost"
                            size="sm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor={`sport-${index}`}>Sport</Label>
                          <Input
                            id={`sport-${index}`}
                            placeholder="NFL, NBA, etc."
                            value={leg.sport}
                            onChange={(e) => updateLeg(index, "sport", e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`game-${index}`}>Game</Label>
                          <Input
                            id={`game-${index}`}
                            placeholder="e.g., Lakers vs Celtics"
                            value={leg.game}
                            onChange={(e) => updateLeg(index, "game", e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`outcome-${index}`}>Outcome</Label>
                          <Input
                            id={`outcome-${index}`}
                            placeholder="e.g., Lakers ML"
                            value={leg.outcome}
                            onChange={(e) => updateLeg(index, "outcome", e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`oddFormat-${index}`}>Odds Format</Label>
                          <Select
                            value={leg.oddFormat}
                            onValueChange={(value: "american" | "decimal" | "fractional") =>
                              updateLeg(index, "oddFormat", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="american">American</SelectItem>
                              <SelectItem value="decimal">Decimal</SelectItem>
                              <SelectItem value="fractional">Fractional</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`oddValue-${index}`}>Odds Value</Label>
                          <Input
                            id={`oddValue-${index}`}
                            type="number"
                            step="0.01"
                            placeholder={
                              leg.oddFormat === "american"
                                ? "+150 or -200"
                                : leg.oddFormat === "decimal"
                                ? "2.50"
                                : "3/2"
                            }
                            value={leg.oddValue}
                            onChange={(e) => updateLeg(index, "oddValue", e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="units-invested">Units Invested</Label>
                    <Input
                      id="units-invested"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 2"
                      value={unitsInvested}
                      onChange={(e) => setUnitsInvested(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dollars-invested">Dollars Invested ($)</Label>
                    <Input
                      id="dollars-invested"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 50"
                      value={dollarsInvested}
                      onChange={(e) => setDollarsInvested(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Upcoming bet fields for parlays */}
                {isUpcomingBet && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="parlay-event-date">Event Date</Label>
                      <Input
                        id="parlay-event-date"
                        type="datetime-local"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parlay-explanation">Explanation</Label>
                      <Textarea
                        id="parlay-explanation"
                        placeholder="Explain your reasoning for this parlay..."
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              // Single Bet Mode
              <>
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
                <div className="grid gap-2">
                  <Label htmlFor="confidence">Confidence Level (1-10)</Label>
                  <Input
                    id="confidence"
                    type="number"
                    min="1"
                    max="10"
                    value={confidenceLevel}
                    onChange={(e) => setConfidenceLevel(e.target.value)}
                    placeholder="5"
                  />
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
              </>
            )}
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
            <Button type="submit" disabled={createBet.isPending || createParlay.isPending}>
              {createBet.isPending || createParlay.isPending
                ? isParlay ? "Creating Parlay..." : "Creating Bet..."
                : isParlay ? "Create Parlay" : "Create Bet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
