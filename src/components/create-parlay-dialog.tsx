"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { useWhop } from "~/lib/whop-context";
import { Plus, Trash2 } from "lucide-react";
import { calculateParlayOdds } from "~/lib/parlay-utils";
import { toDecimal } from "~/lib/bet-utils";

interface Leg {
  sport: string;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
}

interface CreateParlayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCommunityBet?: boolean;
  isUpcomingBet?: boolean;
}

export function CreateParlayDialog({
  open,
  onOpenChange,
  isCommunityBet = false,
  isUpcomingBet = false,
}: CreateParlayDialogProps) {
  const queryClient = useQueryClient();
  const { experience, user } = useWhop();
  const [name, setName] = useState("");
  const [legs, setLegs] = useState<Leg[]>([
    { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" },
    { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" },
  ]);
  const [unitsInvested, setUnitsInvested] = useState("");
  const [dollarsInvested, setDollarsInvested] = useState("");
  const [notes, setNotes] = useState("");
  
  // For upcoming bets
  const [eventDate, setEventDate] = useState("");
  const [explanation, setExplanation] = useState("");
  const [shouldPostToForum, setShouldPostToForum] = useState(false);

  // Fetch settings to determine default checkbox state for upcoming bets
  const { data: settings } = useQuery({
    queryKey: ["experience-settings", experience?.id],
    queryFn: async () => {
      const response = await fetch(`/api/settings?experienceId=${experience?.id}`)
      if (!response.ok) throw new Error("Failed to fetch settings")
      const data = await response.json()
      return data.settings
    },
    enabled: !!experience?.id && isUpcomingBet,
  })

  useEffect(() => {
    if (settings?.autoPostEnabled) {
      setShouldPostToForum(true)
    } else if (settings && !settings.autoPostEnabled) {
      setShouldPostToForum(false)
    }
  }, [settings])

  useEffect(() => {
    if (!open) {
      setName("")
      setLegs([
        { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" },
        { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" },
      ])
      setUnitsInvested("")
      setDollarsInvested("")
      setNotes("")
      setEventDate("")
      setExplanation("")
      setShouldPostToForum(settings?.autoPostEnabled || false)
    }
  }, [open, settings?.autoPostEnabled])

  // Calculate combined odds
  const combinedOdds = calculateParlayOdds(
    legs.filter(leg => leg.oddValue && parseFloat(leg.oddValue) > 0)
  )

  const addLeg = () => {
    setLegs([...legs, { sport: "", game: "", outcome: "", betCategory: "game_match", oddFormat: "american", oddValue: "" }])
  }

  const removeLeg = (index: number) => {
    if (legs.length > 2) {
      setLegs(legs.filter((_, i) => i !== index))
    }
  }

  const updateLeg = (index: number, field: keyof Leg, value: string) => {
    const newLegs = [...legs]
    newLegs[index] = { ...newLegs[index], [field]: value }
    setLegs(newLegs)
  }

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

    // Validate legs
    const validLegs = legs.filter(leg => leg.sport && leg.game && leg.outcome && leg.oddValue)
    if (validLegs.length < 2) {
      alert("Please add at least 2 valid legs");
      return
    }

    const parlayData: any = {
      experienceId: experience.id,
      name,
      legs: validLegs,
      isCommunityBet,
      isUpcomingBet,
      unitsInvested: unitsInvested || null,
      dollarsInvested: dollarsInvested || null,
      notes: notes || null,
    };

    if (isUpcomingBet) {
      parlayData.eventDate = eventDate ? new Date(eventDate).toISOString() : null
      parlayData.explanation = explanation || null
      parlayData.shouldPostToForum = shouldPostToForum && settings?.forumId
    } else {
      parlayData.userId = user?.id
    }

    createParlay.mutate(parlayData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isUpcomingBet 
              ? "Create New Parlay Pick" 
              : isCommunityBet 
              ? "Log New Community Parlay" 
              : "Create New Parlay"}
          </DialogTitle>
          <DialogDescription>
            Add {isUpcomingBet ? "an upcoming parlay pick" : isCommunityBet ? "a community parlay" : "your parlay"}.
            Minimum 2 legs required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Parlay Name</Label>
              <Input
                id="name"
                placeholder="e.g., Sunday 3-Leg Parlay"
                value={name}
                onChange={(e) => setName(e.target.value)}
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

            {/* Investment Fields */}
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="unitsInvested">Units Invested</Label>
                <Input
                  id="unitsInvested"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 2"
                  value={unitsInvested}
                  onChange={(e) => setUnitsInvested(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dollarsInvested">Dollars Invested ($)</Label>
                <Input
                  id="dollarsInvested"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 50"
                  value={dollarsInvested}
                  onChange={(e) => setDollarsInvested(e.target.value)}
                />
              </div>
            </div>

            {/* Upcoming Bet Fields */}
            {isUpcomingBet && (
              <>
                <div className="space-y-2 border-t pt-4">
                  <Label htmlFor="eventDate">Event Date</Label>
                  <Input
                    id="eventDate"
                    type="datetime-local"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="explanation">Explanation</Label>
                  <Textarea
                    id="explanation"
                    placeholder="Explain your reasoning for this parlay..."
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    required
                  />
                </div>
                {settings?.forumId && (
                  <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="post-to-forum">Post to Forum</Label>
                      <p className="text-sm text-muted-foreground">
                        Share this parlay pick in your selected forum
                      </p>
                    </div>
                    <Switch
                      id="post-to-forum"
                      checked={shouldPostToForum}
                      onCheckedChange={setShouldPostToForum}
                    />
                  </div>
                )}
              </>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createParlay.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createParlay.isPending}>
              {createParlay.isPending ? "Creating..." : "Create Parlay"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}



