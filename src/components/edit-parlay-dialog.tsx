"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Badge } from "~/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useWhop } from "~/lib/whop-context";
import { calculateParlayOdds } from "~/lib/parlay-utils";

interface EditParlayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parlay: any;
}

interface Leg {
  sport: string;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
}

export function EditParlayDialog({ open, onOpenChange, parlay }: EditParlayDialogProps) {
  const queryClient = useQueryClient();
  const { experience } = useWhop();
  
  const [name, setName] = useState("");
  const [legs, setLegs] = useState<Leg[]>([]);
  const [unitsInvested, setUnitsInvested] = useState("");
  const [dollarsInvested, setDollarsInvested] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<"pending" | "win" | "lose" | "returned">("pending");
  const [eventDate, setEventDate] = useState("");
  const [explanation, setExplanation] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState("");
  const [shouldUpdateForumPost, setShouldUpdateForumPost] = useState(false);

  useEffect(() => {
    if (parlay) {
      setName(parlay.name || "");
      setLegs(parlay.legs?.map((leg: any) => ({
        sport: leg.sport || "",
        game: leg.game || "",
        outcome: leg.outcome || "",
        betCategory: leg.betCategory || "game_match",
        oddFormat: leg.oddFormat || "american",
        oddValue: leg.oddValue?.toString() || "",
      })) || []);
      setUnitsInvested(parlay.unitsInvested || "");
      setDollarsInvested(parlay.dollarsInvested || "");
      setNotes(parlay.notes || "");
      setResult(parlay.result || "pending");
      
      // Set upcoming bet fields if they exist
      if (parlay.eventDate) {
        const date = new Date(parlay.eventDate);
        setEventDate(date.toISOString().slice(0, 16));
      }
      setExplanation(parlay.explanation || "");
      setConfidenceLevel(parlay.confidenceLevel?.toString() || "");
      
      // Set forum update flag if parlay has a forum post
      setShouldUpdateForumPost(!!parlay.forumPostId);
    }
  }, [parlay]);

  const updateParlay = useMutation({
    mutationFn: async (parlayData: any) => {
      if (!experience) throw new Error("Experience not found");
      const response = await fetch(`/api/parlays/${parlay.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parlayData,
          experienceId: experience.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to update parlay");
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all parlay queries regardless of prefixes
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          query.queryKey[0] === "parlays" || 
          query.queryKey[0] === "my-parlays" || 
          query.queryKey[0] === "community-parlays" ||
          query.queryKey[0] === "upcoming-parlays" ||
          query.queryKey[0] === "my-parlays-analytics" ||
          query.queryKey[0] === "community-parlays-analytics"
      });
      queryClient.invalidateQueries({ queryKey: ["community-bets"] });
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-bets"] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const parlayData: any = {
      name,
      legs: legs.filter(leg => leg.sport && leg.game && leg.outcome && leg.oddValue),
      unitsInvested: unitsInvested || null,
      dollarsInvested: dollarsInvested || null,
      notes: notes || null,
      result,
    };
    
    // Add upcoming bet fields if eventDate is set
    if (eventDate) {
      parlayData.eventDate = new Date(eventDate).toISOString();
    }
    if (explanation) parlayData.explanation = explanation;
    if (confidenceLevel) parlayData.confidenceLevel = parseInt(confidenceLevel);
    
    // Only include forum post update if parlay has forumPostId
    if (parlay?.forumPostId && shouldUpdateForumPost) {
      parlayData.shouldUpdateForumPost = true;
    }
    
    updateParlay.mutate(parlayData);
  };

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

  const combinedOdds = useMemo(() => {
    const validLegs = legs.filter(leg => leg.oddValue && !isNaN(parseFloat(leg.oddValue)));
    if (validLegs.length < 2) return 0;
    return calculateParlayOdds(validLegs).combinedOddValue;
  }, [legs]);

  if (!parlay) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pt-6 pb-4">
          <DialogTitle>Edit Parlay</DialogTitle>
          <DialogDescription>
            Update the details for your parlay
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-1 py-2">
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="parlay-name">Parlay Name</Label>
                <Input
                  id="parlay-name"
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

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Upcoming bet fields (only show if parlay has eventDate) */}
              {parlay?.eventDate && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="event-date">Event Date</Label>
                    <Input
                      id="event-date"
                      type="datetime-local"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="explanation">Explanation (Optional)</Label>
                    <Textarea
                      id="explanation"
                      placeholder="Explain your reasoning..."
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confidence-level">Confidence Level (1-10)</Label>
                    <Input
                      id="confidence-level"
                      type="number"
                      min="1"
                      max="10"
                      value={confidenceLevel}
                      onChange={(e) => setConfidenceLevel(e.target.value)}
                      placeholder="5"
                    />
                  </div>
                </>
              )}

              {/* Forum post update checkbox (only show if parlay has forumPostId) */}
              {parlay?.forumPostId && (
                <div className="flex items-center space-x-2 pt-2 border-t">
                  <input
                    type="checkbox"
                    id="update-forum-post"
                    checked={shouldUpdateForumPost}
                    onChange={(e) => setShouldUpdateForumPost(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="update-forum-post" className="font-normal">
                    Update forum post when saving
                  </Label>
                </div>
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
            <Button type="submit" disabled={updateParlay.isPending}>
              {updateParlay.isPending ? "Updating..." : "Update Parlay"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

