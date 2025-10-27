"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWhop } from "~/lib/whop-context";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Edit, Trash2, TrendingUp, Gem, Calendar } from "lucide-react";
import { CreateUpcomingBetDialog } from "~/components/create-upcoming-bet-dialog";
import { EditUpcomingBetDialog } from "~/components/edit-upcoming-bet-dialog";
import { ConvertBetDialog } from "~/components/convert-bet-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { displayOdds, toDecimal } from "~/lib/bet-utils";
import type { OddFormat } from "~/lib/bet-utils";
import { Spinner } from "~/components/ui/spinner";

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
  createdById: string;
  createdAt: string;
}

export default function UpcomingBetsPage() {
  const { experience, access } = useWhop();
  const queryClient = useQueryClient();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<UpcomingBet | null>(null);
  const [betToDelete, setBetToDelete] = useState<UpcomingBet | null>(null);
  const [preferredOddsFormat, setPreferredOddsFormat] = useState<OddFormat>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("preferredOddsFormat") as OddFormat) || "american";
    }
    return "american";
  });

  const { data, isLoading } = useQuery({
    queryKey: ["upcoming-bets"],
    queryFn: async () => {
      const response = await fetch("/api/upcoming-bets");
      if (!response.ok) throw new Error("Failed to fetch upcoming bets");
      return response.json();
    },
  });

  const experienceId = experience?.id || "";
  
  const deleteBet = useMutation({
    mutationFn: async (betId: string) => {
      const response = await fetch(`/api/upcoming-bets/${betId}?experienceId=${experienceId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete upcoming bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-bets"] });
      setDeleteDialogOpen(false);
      setBetToDelete(null);
    },
  });

  if (!experience || !access) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  
  const isAdmin = access.accessLevel === "admin";
  const companyName = experience.company.title;
  const bets: UpcomingBet[] = data?.bets || [];

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = date.getTime() - now.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInDays > 0) {
      return `in ${diffInDays} day${diffInDays > 1 ? "s" : ""}`;
    } else if (diffInHours > 0) {
      return `in ${diffInHours} hour${diffInHours > 1 ? "s" : ""}`;
    } else if (diffInMs < 0) {
      return "Past";
    } else {
      return "Today";
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-4 p-4 border-b">
        <SidebarTrigger />
        <h1 className="text-xl font-semibold">{companyName} Picks</h1>
        {isAdmin && (
          <div className="ml-auto">
            <Button onClick={() => setDialogOpen(true)}>
              <Gem className="mr-2 h-4 w-4" />
              Create Prediction
            </Button>
          </div>
        )}
      </div>

      <CreateUpcomingBetDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <EditUpcomingBetDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} bet={selectedBet} />
      <ConvertBetDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen} bet={selectedBet} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prediction?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this prediction? This action cannot be undone.
              {betToDelete && (
                <div className="mt-2 p-2 bg-muted rounded text-sm">
                  <strong>{betToDelete.sport}</strong> - {betToDelete.game} - {betToDelete.outcome}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (betToDelete) {
                  deleteBet.mutate(betToDelete.id);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex-1 p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Spinner className="size-8 text-primary animate-spin" />
            <p className="text-muted-foreground">Loading predictions...</p>
          </div>
        ) : bets.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No upcoming predictions yet.
              {isAdmin && " Create one to share with the community!"}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bets.map((bet) => (
              <Card key={bet.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary">
                      {bet.sport}
                    </Badge>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                          onClick={() => {
                            setSelectedBet(bet);
                            setEditDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            setBetToDelete(bet);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <CardTitle className="mt-2 line-clamp-2">{bet.game}</CardTitle>
                  <CardDescription className="mt-1">{bet.outcome}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Odds</span>
                    <span className="font-medium">
                      {displayOdds(parseFloat(bet.oddValue), bet.oddFormat, preferredOddsFormat)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{formatEventDate(bet.eventDate)}</span>
                    <span className="text-xs">
                      ({new Date(bet.eventDate).toLocaleDateString()})
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Explanation</p>
                    <div className="p-3 bg-muted/50 rounded-md text-sm leading-relaxed">
                      {bet.explanation}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      className="w-full mt-auto"
                      onClick={() => {
                        setSelectedBet(bet);
                        setConvertDialogOpen(true);
                      }}
                    >
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Convert to Bet
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

