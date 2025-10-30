"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
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
  const [league, setLeague] = useState("");
  const [game, setGame] = useState("");
  const [outcome, setOutcome] = useState("");
  const [betCategory, setBetCategory] = useState<string>("game_match");
  const [oddFormat, setOddFormat] = useState<"american" | "decimal" | "fractional">("american");
  const [oddValue, setOddValue] = useState("");
  const [explanation, setExplanation] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState("5");
  const [unitsToInvest, setUnitsToInvest] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [shouldPostToForum, setShouldPostToForum] = useState(false);
  const [forSale, setForSale] = useState(false);
  const [price, setPrice] = useState<string>(""); // dollars string

  const oddPlaceholders = {
    american: "+150 or -200",
    decimal: "2.50",
    fractional: "3/2 or 1/3",
  };

  const { experience } = useWhop();

  // Fetch settings to determine default checkbox state
  const { data: settings } = useQuery({
    queryKey: ["experience-settings", experience?.id],
    queryFn: async () => {
      const response = await fetch(`/api/settings?experienceId=${experience?.id}`)
      if (!response.ok) throw new Error("Failed to fetch settings")
      const data = await response.json()
      return data.settings
    },
    enabled: !!experience?.id,
  })

  // Set default checkbox state based on auto-post setting
  useEffect(() => {
    if (settings?.autoPostEnabled) {
      setShouldPostToForum(true)
    } else if (settings && !settings.autoPostEnabled) {
      setShouldPostToForum(false)
    }
  }, [settings])

  // Reset checkbox when dialog closes, but only to the default from settings
  useEffect(() => {
    if (!open) {
      // Reset to the default based on settings when dialog closes
      setShouldPostToForum(settings?.autoPostEnabled || false)
    }
  }, [open, settings?.autoPostEnabled])

  const createBet = useMutation({
    mutationFn: async (betData: any) => {
      if (!betData.experienceId) throw new Error("Experience ID is required");
      const response = await fetch("/api/upcoming-bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(betData),
      });
      if (!response.ok) throw new Error("Failed to create upcoming bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-bets"] });
      onOpenChange(false);
      // Reset form
      setSport("");
      setLeague("");
      setGame("");
      setOutcome("");
      setBetCategory("game_match");
      setOddValue("");
      setExplanation("");
      setConfidenceLevel("5");
      setUnitsToInvest("");
      setEventDate("");
      setForSale(false);
      setPrice("");
    },
  });

  const createListing = useMutation({
    mutationFn: async ({ betId, priceCents }: { betId: string; priceCents: number }) => {
      const response = await fetch(`/api/bets/${betId}/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceCents, currency: 'usd', active: true }),
      })
      if (!response.ok) throw new Error("Failed to create listing")
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-bets"] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!experience) return;

    const betData = {
      experienceId: experience.id,
      sport,
      league: league || null,
      game,
      outcome,
      betCategory,
      oddFormat,
      oddValue: parseFloat(oddValue),
      explanation,
      confidenceLevel: confidenceLevel ? parseInt(confidenceLevel) : 5,
      unitsToInvest: unitsToInvest ? parseFloat(unitsToInvest) : null,
      eventDate,
      shouldPostToForum,
    };
    createBet.mutate(betData, {
      onSuccess: (res) => {
        const betId = res?.bet?.id as string | undefined
        const priceCents = Math.round((parseFloat(price || '0') || 0) * 100)
        if (forSale && betId && priceCents > 0) {
          createListing.mutate({ betId, priceCents })
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="pt-6 pb-4">
          <DialogTitle>Create New Pick</DialogTitle>
          <DialogDescription>
            Add your pick with an explanation for the community.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
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
                  placeholder={oddPlaceholders[oddFormat]}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="explanation">Explanation (optional)</Label>
              <Textarea
                id="explanation"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Explain your pick reasoning..."
                className="min-h-[100px]"
                required={false}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="confidence-level">Confidence Level</Label>
                <Select
                  value={confidenceLevel}
                  onValueChange={setConfidenceLevel}
                >
                  <SelectTrigger id="confidence-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                      <SelectItem key={level} value={String(level)}>
                        {level}/10
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="units-to-invest">Units to Invest (optional)</Label>
                <Input
                  id="units-to-invest"
                  type="number"
                  step="0.1"
                  value={unitsToInvest}
                  onChange={(e) => setUnitsToInvest(e.target.value)}
                  placeholder="e.g., 2.5"
                />
              </div>
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
            {settings?.paywallConfig?.enabled && (
              <div className="flex items-start justify-between space-x-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="for-sale">List for sale</Label>
                  <p className="text-sm text-muted-foreground">Set a price for non-eligible users to buy access. 10% fee applies.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="price">Price (USD)</Label>
                    <Input id="price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!forSale} placeholder="9.99" />
                  </div>
                  <Switch id="for-sale" checked={forSale} onCheckedChange={setForSale} />
                </div>
              </div>
            )}
            {settings?.forumId && (
              <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="post-to-forum">Post to Forum</Label>
                  <p className="text-sm text-muted-foreground">
                    Share this pick in your selected forum
                  </p>
                </div>
                <Switch
                  id="post-to-forum"
                  checked={shouldPostToForum}
                  onCheckedChange={setShouldPostToForum}
                />
              </div>
            )}
          </div>
          <DialogFooter className="pb-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createBet.isPending}>
              {createBet.isPending ? "Creating..." : "Create New Pick"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

