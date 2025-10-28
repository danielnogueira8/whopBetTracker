"use client";

import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { displayOdds } from "~/lib/bet-utils";

interface ParlayLeg {
  id: string;
  sport: string;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
  result: "pending" | "win" | "lose" | "returned";
  legOrder: number;
}

interface Parlay {
  id: string;
  name: string;
  combinedOddFormat: "american" | "decimal" | "fractional";
  combinedOddValue: string;
  unitsInvested: string | null;
  dollarsInvested: string | null;
  result: "pending" | "win" | "lose" | "returned";
  legs: ParlayLeg[];
  notes?: string | null;
}

interface ParlayDisplayProps {
  parlay: Parlay;
  preferredOddsFormat?: "american" | "decimal" | "fractional";
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ParlayDisplay({ parlay, preferredOddsFormat = "american", onEdit, onDelete }: ParlayDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const resultColors = {
    win: "bg-green-500 text-white border-green-600",
    lose: "bg-red-500 text-white border-red-600",
    pending: "bg-yellow-500 text-white border-yellow-600",
    returned: "bg-muted text-muted-foreground border-border",
  };

  const legResultColors = {
    win: "text-green-600",
    lose: "text-red-600",
    pending: "text-yellow-600",
    returned: "text-muted-foreground",
  };

  return (
    <div className="border rounded-lg">
      {/* Main Parlay Row */}
      <div 
        className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="secondary">PARLAY</Badge>
            <div>
              <h3 className="font-medium">{parlay.name}</h3>
              <p className="text-sm text-muted-foreground">
                {parlay.legs.length}-Leg Parlay
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Combined Odds</p>
              <p className="font-medium">
                {displayOdds(parseFloat(parlay.combinedOddValue), parlay.combinedOddFormat, preferredOddsFormat)}
              </p>
            </div>
            <Badge className={resultColors[parlay.result]}>
              {parlay.result.toUpperCase()}
            </Badge>
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>

        {/* Investment Info */}
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          {parlay.unitsInvested && (
            <span>Units: {parlay.unitsInvested}</span>
          )}
          {parlay.dollarsInvested && (
            <span>Amount: ${parlay.dollarsInvested}</span>
          )}
        </div>
      </div>

      {/* Expandable Legs */}
      {isExpanded && (
        <div className="border-t bg-muted/30">
          <div className="p-4 space-y-3">
            <h4 className="font-medium mb-3">Parlay Legs</h4>
            {parlay.legs.map((leg, index) => (
              <div key={leg.id} className="bg-background border rounded-md p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-muted-foreground">Leg {index + 1}:</span>
                      <Badge variant="outline" className="text-xs">
                        {leg.sport}
                      </Badge>
                    </div>
                    <p className="font-medium">{leg.game}</p>
                    <p className="text-sm text-muted-foreground">{leg.outcome}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {displayOdds(parseFloat(leg.oddValue), leg.oddFormat, preferredOddsFormat)}
                    </p>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${legResultColors[leg.result]}`}
                    >
                      {leg.result}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}

            {parlay.notes && (
              <div className="bg-background border rounded-md p-3">
                <p className="text-sm text-muted-foreground">Notes:</p>
                <p className="text-sm">{parlay.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            {(onEdit || onDelete) && (
              <div className="flex gap-2 pt-2">
                {onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Edit Parlay
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="text-sm text-destructive hover:underline"
                  >
                    Delete Parlay
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


