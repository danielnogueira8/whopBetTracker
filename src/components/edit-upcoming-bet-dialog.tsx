"use client";

import { useState, useEffect } from "react";
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
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
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
  league?: string | null;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
  explanation: string;
  confidenceLevel: number | null;
  unitsToInvest: string | null;
  eventDate: string;
  forumPostId?: string | null;
}

interface EditUpcomingBetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bet: UpcomingBet | null;
}

export function EditUpcomingBetDialog({
  open,
  onOpenChange,
  bet,
}: EditUpcomingBetDialogProps) {
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
  const [shouldUpdateForumPost, setShouldUpdateForumPost] = useState(false);
  const [forSale, setForSale] = useState(false);
  const [price, setPrice] = useState<string>("");
  const [freeTestListing, setFreeTestListing] = useState(false);

  useEffect(() => {
    if (bet) {
      setSport(bet.sport);
      setLeague(bet.league || "");
      setGame(bet.game);
      setOutcome(bet.outcome);
      setBetCategory(bet.betCategory);
      setOddFormat(bet.oddFormat);
      setOddValue(bet.oddValue);
      setExplanation(bet.explanation || "");
      setConfidenceLevel(bet.confidenceLevel?.toString() || "5");
      setUnitsToInvest(bet.unitsToInvest || "");
      // Format date for datetime-local input
      const date = new Date(bet.eventDate);
      const formattedDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setEventDate(formattedDate);
      // Load current listing
      fetch(`/api/bets/${bet.id}/listings`).then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        const listing = data?.listing
        if (listing) {
          setForSale(Boolean(listing.active))
          const cents = listing.priceCents ?? 0
          setFreeTestListing(cents === 0)
          setPrice((cents / 100).toFixed(2))
        } else {
          setForSale(false)
          setPrice("")
          setFreeTestListing(false)
        }
      }).catch(() => {})
    }
  }, [bet]);

  const oddPlaceholders = {
    american: "+150 or -200",
    decimal: "2.50",
    fractional: "3/2 or 1/3",
  };

  const { experience } = useWhop();

  const updateBet = useMutation({
    mutationFn: async (betData: any) => {
      if (!betData.experienceId) throw new Error("Experience ID is required");
      const response = await fetch(`/api/upcoming-bets/${bet?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(betData),
      });
      if (!response.ok) throw new Error("Failed to update upcoming bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-bets"] });
      onOpenChange(false);
    },
  });

  const saveListing = useMutation({
    mutationFn: async ({ betId, priceCents, active, allowZero = false }: { betId: string; priceCents: number; active: boolean; allowZero?: boolean }) => {
      const response = await fetch(`/api/bets/${betId}/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceCents, currency: 'usd', active, allowZero }),
      })
      if (!response.ok) throw new Error("Failed to save listing")
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
      shouldUpdateForumPost,
    };

    updateBet.mutate(betData, {
      onSuccess: () => {
        if (bet?.id) {
          const priceCents = Math.round((parseFloat(price || '0') || 0) * 100)
          const isFree = freeTestListing || priceCents === 0
          const normalizedPriceCents = isFree ? 0 : Math.max(priceCents, 0)
          if (forSale && (normalizedPriceCents > 0 || isFree)) {
            saveListing.mutate({ betId: bet.id, priceCents: normalizedPriceCents, active: true, allowZero: isFree })
          } else {
            // deactivate listing if toggled off
            if (normalizedPriceCents >= 0) {
              saveListing.mutate({ betId: bet.id, priceCents: normalizedPriceCents, active: false, allowZero: isFree })
            }
          }
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="pt-6 pb-4">
          <DialogTitle>Edit Pick</DialogTitle>
          <DialogDescription>
            Update your pick details.
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
                value={explanation ?? ""}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Explain your pick reasoning..."
                className="min-h-[100px]"
                required={false}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="confidence-level-edit">Confidence Level</Label>
                <Select
                  value={confidenceLevel}
                  onValueChange={setConfidenceLevel}
                >
                  <SelectTrigger id="confidence-level-edit">
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
                <Label htmlFor="units-to-invest-edit">Units to Invest</Label>
                <Input
                  id="units-to-invest-edit"
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
            <div className="flex items-start justify-between space-x-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="for-sale-edit">List for sale</Label>
                <p className="text-sm text-muted-foreground">Set a price for non-eligible users to buy access. 10% fee applies.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="price-edit">Price (USD)
                  </Label>
                  <Input
                    id="price-edit"
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value)
                      const val = Number.parseFloat(e.target.value || '0')
                      if (!Number.isNaN(val) && val > 0) {
                        setFreeTestListing(false)
                      }
                    }}
                    disabled={!forSale || freeTestListing}
                    placeholder="9.99"
                  />
                </div>
                <Switch
                  id="for-sale-edit"
                  checked={forSale}
                  onCheckedChange={(checked) => {
                    setForSale(checked)
                    if (!checked) {
                      setFreeTestListing(false)
                      setPrice("")
                    }
                  }}
                />
              </div>
              {forSale && (
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    id="free-test-listing"
                    checked={freeTestListing}
                    onCheckedChange={(checked) => {
                      setFreeTestListing(checked)
                      if (checked) {
                        setPrice("0.00")
                      }
                    }}
                  />
                  <Label htmlFor="free-test-listing" className="text-sm font-normal text-muted-foreground">
                    Mark as free $0 test listing
                  </Label>
                </div>
              )}
            </div>
            {bet?.forumPostId && (
              <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="update-forum-post">Update Forum Post</Label>
                  <p className="text-sm text-muted-foreground">
                    Update the existing forum post with new bet details
                  </p>
                </div>
                <Switch
                  id="update-forum-post"
                  checked={shouldUpdateForumPost}
                  onCheckedChange={setShouldUpdateForumPost}
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
            <Button type="submit" disabled={updateBet.isPending}>
              {updateBet.isPending ? "Updating..." : "Update Pick"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

