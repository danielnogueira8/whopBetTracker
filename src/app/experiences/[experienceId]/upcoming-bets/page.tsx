"use client";

import { useState, useMemo } from "react";
import { useIframeSdk } from '@whop/react'
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useWhop } from "~/lib/whop-context";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Edit, Trash2, TrendingUp, Plus, Calendar, Megaphone, DollarSign, Target, BarChart3, Diamond, Gauge, Percent, Info, Lock, Gem, BanknoteArrowUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { CreateBetDialog } from "~/components/create-bet-dialog";
import { EditUpcomingBetDialog } from "~/components/edit-upcoming-bet-dialog";
import { EditParlayDialog } from "~/components/edit-parlay-dialog";
import { ConvertBetDialog } from "~/components/convert-bet-dialog";
import { ConvertParlayDialog } from "~/components/convert-parlay-dialog";
import { AdBannerDisplay } from "~/components/ad-banner-display";
import { PurchaseAdBannerDialog } from "~/components/purchase-ad-banner-dialog";
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
// import { SortToggle } from "~/components/sort-toggle";

interface UpcomingBet {
  id: string;
  sport: string;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
  explanation: string;
  confidenceLevel: number | null;
  unitsToInvest: string | null;
  eventDate: string;
  createdById: string;
  createdAt: string;
}

interface UpcomingParlay {
  id: string;
  name: string;
  combinedOddFormat: "american" | "decimal" | "fractional";
  combinedOddValue: string;
  unitsInvested: string | null;
  confidenceLevel: number | null;
  result: "pending" | "win" | "lose" | "returned";
  eventDate: string | null;
  explanation: string | null;
  legs: {
    id: string;
    sport: string;
    game: string;
    outcome: string;
    betCategory: string;
    oddFormat: "american" | "decimal" | "fractional";
    oddValue: string;
    result: "pending" | "win" | "lose" | "returned";
    legOrder: number;
  }[];
  createdAt: string;
}

export default function UpcomingBetsPage() {
  const { experience, access } = useWhop();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  
  const experienceId = experience?.id || "";
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editParlayDialogOpen, setEditParlayDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertParlayDialogOpen, setConvertParlayDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<UpcomingBet | null>(null);
  const [selectedParlay, setSelectedParlay] = useState<UpcomingParlay | null>(null);
  const [betToDelete, setBetToDelete] = useState<UpcomingBet | null>(null);
  const [parlayToDelete, setParlayToDelete] = useState<UpcomingParlay | null>(null);
  const [purchaseAdDialogOpen, setPurchaseAdDialogOpen] = useState(false);
  const [preferredOddsFormat, setPreferredOddsFormat] = useState<OddFormat>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("preferredOddsFormat") as OddFormat) || "american";
    }
    return "american";
  });

  // Removed sort-by-date toggle; default API sort applies

  const { data, isLoading } = useQuery({
    queryKey: ["upcoming-bets", experienceId],
    queryFn: async () => {
      const response = await fetch(`/api/upcoming-bets?experienceId=${experienceId}`);
      if (!response.ok) throw new Error("Failed to fetch upcoming bets");
      return response.json();
    },
    enabled: !!experienceId, // Don't run query if experienceId is empty
  });

  // Fetch paywall config (public) and user access
  const { data: publicSettings } = useQuery({
    queryKey: ["paywall-config", experienceId],
    queryFn: async () => {
      const res = await fetch(`/api/settings/public?experienceId=${experienceId}`)
      if (!res.ok) throw new Error("Failed to fetch paywall config")
      return res.json()
    },
    enabled: !!experienceId,
  })

  const { data: accessData } = useQuery({
    queryKey: ["upcoming-bets-access", experienceId],
    queryFn: async () => {
      const res = await fetch(`/api/access/upcoming-bets?experienceId=${experienceId}`)
      if (!res.ok) throw new Error("Failed to check access")
      return res.json()
    },
    enabled: !!experienceId,
  })

  // Fetch upcoming parlays
  const { data: parlaysData, isLoading: isLoadingParlays } = useQuery({
    queryKey: ["upcoming-parlays", experienceId],
    queryFn: async () => {
      const params = new URLSearchParams({
        experienceId,
        isUpcoming: "true",
        page: "1",
        limit: "50",
      });
      const response = await fetch(`/api/parlays?${params}`);
      if (!response.ok) throw new Error("Failed to fetch upcoming parlays");
      return response.json();
    },
    enabled: !!experienceId,
  });
  
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
      queryClient.invalidateQueries({ queryKey: ["upcoming-parlays"] });
      setDeleteDialogOpen(false);
      setBetToDelete(null);
    },
  });

  const deleteParlay = useMutation({
    mutationFn: async (parlayId: string) => {
      const response = await fetch(`/api/parlays/${parlayId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete parlay");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-bets"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-parlays"] });
      setDeleteDialogOpen(false);
      setParlayToDelete(null);
    },
  });

  if (!experience || !access) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  
  const isAdmin = access.accessLevel === "admin";
  const paywallEnabled = Boolean(publicSettings?.paywallConfig?.enabled)
  const userHasAccess = Boolean(accessData?.hasAccess)
  // TEMP: Dev override to test locked state - REMOVE before production
  const forceLock = searchParams?.get('force-lock') === 'true'
  const shouldLock = forceLock || (paywallEnabled && !isAdmin && !userHasAccess)
  
  console.log('[client] paywall check', { isAdmin, paywallEnabled, userHasAccess, shouldLock, forceLock })
  const companyName = experience.company.title;
  const bets: UpcomingBet[] = data?.bets || [];
  const parlays: UpcomingParlay[] = parlaysData?.parlays || [];

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
        <TooltipProvider>
          <div className="flex items-center gap-2">
            <Gem className="h-6 w-6" />
            <h1 className="text-xl font-semibold">{companyName} Picks</h1>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  These are your Bet Picks. Once they are resolved and converted, they will appear in the Community Bet Tracker.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setPurchaseAdDialogOpen(true)}>
            <Megaphone className="mr-2 h-4 w-4" />
            Purchase Ad Space
          </Button>
          {isAdmin && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create New Pick
            </Button>
          )}
        </div>
      </div>

      {/* Ad Banner Display */}
      <div className="p-4">
        <AdBannerDisplay />
      </div>

      <CreateBetDialog open={dialogOpen} onOpenChange={setDialogOpen} isUpcomingBet={true} />
      <EditUpcomingBetDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} bet={selectedBet} />
      <EditParlayDialog open={editParlayDialogOpen} onOpenChange={setEditParlayDialogOpen} parlay={selectedParlay} />
      <ConvertBetDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen} bet={selectedBet} />
      <ConvertParlayDialog open={convertParlayDialogOpen} onOpenChange={setConvertParlayDialogOpen} parlay={selectedParlay} />
      <PurchaseAdBannerDialog open={purchaseAdDialogOpen} onOpenChange={setPurchaseAdDialogOpen} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pick?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this pick? This action cannot be undone.
              {betToDelete && (
                <span className="mt-2 p-2 bg-muted rounded text-sm block">
                  <strong>{betToDelete.sport}</strong> - {betToDelete.game} - {betToDelete.outcome}
                </span>
              )}
              {parlayToDelete && (
                <span className="mt-2 p-2 bg-muted rounded text-sm block">
                  <strong>{parlayToDelete.name}</strong> - {parlayToDelete.legs.length} leg parlay
                </span>
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
                if (parlayToDelete) {
                  deleteParlay.mutate(parlayToDelete.id);
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
        {(isLoading || isLoadingParlays) ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Spinner className="size-8 text-primary animate-spin" />
            <p className="text-muted-foreground">Loading picks...</p>
          </div>
        ) : bets.length === 0 && parlays.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No upcoming picks yet.
              {isAdmin && " Create one to share with the community!"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Sort by date toggle removed */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bets.map((bet) => (
              <Card key={bet.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary">
                        {bet.sport}
                      </Badge>
                      {isAdmin && (
                        <AdminSalesBadge betId={bet.id} />
                      )}
                    </div>
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
                  <CardDescription className="mt-1">
                    {shouldLock ? (
                      <BetOutcomeStatus betId={bet.id} outcome={bet.outcome} />
                    ) : (
                      bet.outcome
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  {shouldLock ? (
                    <PerBetLockGate betId={bet.id}>
                      <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          Odds
                        </span>
                        <span className="font-medium">
                          {displayOdds(parseFloat(bet.oddValue), bet.oddFormat, preferredOddsFormat)}
                        </span>
                      </div>
                      {bet.confidenceLevel && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Gauge className="h-4 w-4" />
                            Confidence
                          </span>
                          <Badge 
                            variant={bet.confidenceLevel >= 8 ? "default" : bet.confidenceLevel >= 6 ? "secondary" : "outline"}
                            className={bet.confidenceLevel >= 8 ? "bg-green-500 text-white" : bet.confidenceLevel >= 6 ? "bg-yellow-500 text-white" : ""}
                          >
                            {bet.confidenceLevel}/10
                          </Badge>
                        </div>
                      )}
                      {bet.unitsToInvest && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Diamond className="h-4 w-4" />
                            Units
                          </span>
                          <span className="font-medium">{bet.unitsToInvest}</span>
                        </div>
                      )}
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
                      </>
                    </PerBetLockGate>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          Odds
                        </span>
                        <span className="font-medium">
                          {displayOdds(parseFloat(bet.oddValue), bet.oddFormat, preferredOddsFormat)}
                        </span>
                      </div>
                      {bet.confidenceLevel && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Gauge className="h-4 w-4" />
                            Confidence
                          </span>
                          <Badge 
                            variant={bet.confidenceLevel >= 8 ? "default" : bet.confidenceLevel >= 6 ? "secondary" : "outline"}
                            className={bet.confidenceLevel >= 8 ? "bg-green-500 text-white" : bet.confidenceLevel >= 6 ? "bg-yellow-500 text-white" : ""}
                          >
                            {bet.confidenceLevel}/10
                          </Badge>
                        </div>
                      )}
                      {bet.unitsToInvest && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Diamond className="h-4 w-4" />
                            Units
                          </span>
                          <span className="font-medium">{bet.unitsToInvest}</span>
                        </div>
                      )}
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
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
            
            {parlays.map((parlay) => (
              <Card key={parlay.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-300">
                        PARLAY ({parlay.legs.length} legs)
                      </Badge>
                      {isAdmin && (
                        <AdminParlaySalesBadge parlayId={parlay.id} />
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                          onClick={() => {
                            setSelectedParlay(parlay);
                            setEditParlayDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            setParlayToDelete(parlay);
                            setBetToDelete(null);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <CardTitle className="mt-2">{parlay.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {parlay.legs.length}-leg parlay
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  {shouldLock ? (
                    <PerParlayLockGate parlayId={parlay.id}>
                      <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          Combined Odds
                        </span>
                        <span className="font-medium">
                          {displayOdds(parseFloat(parlay.combinedOddValue), parlay.combinedOddFormat, preferredOddsFormat)}
                        </span>
                      </div>
                      {parlay.unitsInvested && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Diamond className="h-4 w-4" />
                            Units
                          </span>
                          <span className="font-medium">{parlay.unitsInvested}</span>
                        </div>
                      )}
                      {parlay.confidenceLevel && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Gauge className="h-4 w-4" />
                            Confidence
                          </span>
                          <Badge 
                            variant={parlay.confidenceLevel >= 8 ? "default" : parlay.confidenceLevel >= 6 ? "secondary" : "outline"}
                            className={parlay.confidenceLevel >= 8 ? "bg-green-500 text-white" : parlay.confidenceLevel >= 6 ? "bg-yellow-500 text-white" : ""}
                          >
                            {parlay.confidenceLevel}/10
                          </Badge>
                        </div>
                      )}
                      {parlay.eventDate && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{formatEventDate(parlay.eventDate)}</span>
                        </div>
                      )}
                      <div className="pt-4 border-t space-y-3">
                        <p className="text-sm font-medium text-muted-foreground">Legs</p>
                        {parlay.legs.map((leg, index) => (
                          <div key={leg.id} className="p-3 bg-muted/30 rounded-md">
                            <div className="flex items-start justify-between mb-1">
                              <span className="text-xs font-medium text-muted-foreground">
                                Leg {index + 1}: {leg.sport}
                              </span>
                              <span className="text-xs font-medium">
                                {displayOdds(parseFloat(leg.oddValue), leg.oddFormat, preferredOddsFormat)}
                              </span>
                            </div>
                            <p className="text-sm font-medium">{leg.game}</p>
                            <p className="text-xs text-muted-foreground">{leg.outcome}</p>
                          </div>
                        ))}
                      </div>
                      {parlay.explanation && (
                        <div className="pt-4 border-t">
                          <p className="text-sm font-medium text-muted-foreground mb-2">Explanation</p>
                          <div className="p-3 bg-muted/50 rounded-md text-sm leading-relaxed">
                            {parlay.explanation}
                          </div>
                        </div>
                      )}
                      {isAdmin && (
                        <Button
                          variant="outline"
                          className="w-full mt-auto"
                          onClick={() => {
                            setSelectedParlay(parlay);
                            setConvertParlayDialogOpen(true);
                          }}
                        >
                          <TrendingUp className="mr-2 h-4 w-4" />
                          Convert to Bet
                        </Button>
                      )}
                      </>
                    </PerParlayLockGate>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          Combined Odds
                        </span>
                        <span className="font-medium">
                          {displayOdds(parseFloat(parlay.combinedOddValue), parlay.combinedOddFormat, preferredOddsFormat)}
                        </span>
                      </div>
                      {parlay.unitsInvested && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Diamond className="h-4 w-4" />
                            Units
                          </span>
                          <span className="font-medium">{parlay.unitsInvested}</span>
                        </div>
                      )}
                      {parlay.confidenceLevel && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Gauge className="h-4 w-4" />
                            Confidence
                          </span>
                          <Badge 
                            variant={parlay.confidenceLevel >= 8 ? "default" : parlay.confidenceLevel >= 6 ? "secondary" : "outline"}
                            className={parlay.confidenceLevel >= 8 ? "bg-green-500 text-white" : parlay.confidenceLevel >= 6 ? "bg-yellow-500 text-white" : ""}
                          >
                            {parlay.confidenceLevel}/10
                          </Badge>
                        </div>
                      )}
                      {parlay.eventDate && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{formatEventDate(parlay.eventDate)}</span>
                        </div>
                      )}
                      
                      <div className="pt-4 border-t space-y-3">
                        <p className="text-sm font-medium text-muted-foreground">Legs</p>
                        {parlay.legs.map((leg, index) => (
                          <div key={leg.id} className="p-3 bg-muted/30 rounded-md">
                            <div className="flex items-start justify-between mb-1">
                              <span className="text-xs font-medium text-muted-foreground">
                                Leg {index + 1}: {leg.sport}
                              </span>
                              <span className="text-xs font-medium">
                                {displayOdds(parseFloat(leg.oddValue), leg.oddFormat, preferredOddsFormat)}
                              </span>
                            </div>
                            <p className="text-sm font-medium">{leg.game}</p>
                            <p className="text-xs text-muted-foreground">{leg.outcome}</p>
                          </div>
                        ))}
                      </div>
                      
                      {parlay.explanation && (
                        <div className="pt-4 border-t">
                          <p className="text-sm font-medium text-muted-foreground mb-2">Explanation</p>
                          <div className="p-3 bg-muted/50 rounded-md text-sm leading-relaxed">
                            {parlay.explanation}
                          </div>
                        </div>
                      )}
                      {isAdmin && (
                        <Button
                          variant="outline"
                          className="w-full mt-auto"
                          onClick={() => {
                            setSelectedParlay(parlay);
                            setConvertParlayDialogOpen(true);
                          }}
                        >
                          <TrendingUp className="mr-2 h-4 w-4" />
                          Convert to Bet
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function AdminSalesBadge({ betId }: { betId: string }) {
  const { data } = useQuery({
    queryKey: ["bet-listing", betId],
    queryFn: async () => {
      const res = await fetch(`/api/bets/${betId}/listings`)
      if (!res.ok) return { listing: null }
      return res.json()
    },
  })

  const listing = data?.listing as any
  if (!listing || !listing.active) return null

  const sales = Number(listing?.salesCount ?? 0)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="flex items-center gap-1">
            <BanknoteArrowUp className="h-3.5 w-3.5" />
            {sales}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">Number of sales for this pick</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function AdminParlaySalesBadge({ parlayId }: { parlayId: string }) {
  const { data } = useQuery({
    queryKey: ["parlay-listing", parlayId, "badge"],
    queryFn: async () => {
      const res = await fetch(`/api/parlays/${parlayId}/listings`)
      if (!res.ok) return { listing: null }
      return res.json()
    },
  })

  const listing = data?.listing as any
  if (!listing || !listing.active) return null

  const sales = Number(listing?.salesCount ?? 0)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="flex items-center gap-1">
            <BanknoteArrowUp className="h-3.5 w-3.5" />
            {sales}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <span className="text-xs">Number of sales for this parlay</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function PerBetLockedContent({ betId }: { betId: string }) {
  const iframeSdk = useIframeSdk()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const forceBuyer = searchParams?.get('as-buyer') === 'true'

  const { data: accessData } = useQuery({
    queryKey: ["bet-access", betId],
    queryFn: async () => {
      if (forceBuyer) return { hasAccess: false }
      const res = await fetch(`/api/bets/${betId}/access`)
      if (!res.ok) return { hasAccess: false }
      return res.json()
    },
  })

  const { data: listingData } = useQuery({
    queryKey: ["bet-listing", betId],
    queryFn: async () => {
      const res = await fetch(`/api/bets/${betId}/listings`)
      if (!res.ok) return { listing: null }
      return res.json()
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/bets/${betId}/checkout`, { method: 'POST', headers: forceBuyer ? { 'x-force-buyer': 'true' } : {} })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to create checkout' }))
        throw new Error(errorData.error || 'Failed to create checkout')
      }
      return res.json()
    },
    onSuccess: async (data) => {
      try {
        if (iframeSdk) {
          await iframeSdk.inAppPurchase({ planId: data.planId, id: data.checkoutId })
          // Best-effort confirmation in case webhook is delayed
          try {
            await fetch(`/api/bets/${betId}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkoutId: data.checkoutId }) })
          } catch {}
          // Poll access endpoint for confirmation
          const poll = async (retries = 20) => {
            if (retries === 0) return
            const res = await fetch(`/api/bets/${betId}/access`)
            if (res.ok) {
              const a = await res.json()
              if (a?.hasAccess) {
                queryClient.invalidateQueries({ queryKey: ["bet-access", betId] })
                return
              }
            }
            setTimeout(() => poll(retries - 1), 1000)
          }
          setTimeout(() => poll(), 3000)
        } else {
          // Fallback: open checkout in new window if iframe SDK not available
          window.open(`https://whop.com/checkout/${data.checkoutId}`, '_blank')
          toast.info('Checkout opened in new window')
        }
      } catch (e) {
        console.error('Checkout failed', e)
        toast.error('Failed to open checkout. Please try again.')
      }
    },
    onError: (error: Error) => {
      console.error('Checkout error:', error)
      toast.error(error.message || 'Failed to create checkout. Please try again.')
    }
  })

  if (accessData?.hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">You own access to this pick. Refresh to view details.</p>
      </div>
    )
  }

  const listing = listingData?.listing
  if (listing?.active) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Unlock this pick for ${(listing.priceCents / 100).toFixed(2)} USD</p>
        <Button size="sm" onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending}>
          {checkoutMutation.isPending ? 'Processing…' : 'Buy access'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <Lock className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{`Subscribe to view odds, units, and explanations.`}</p>
    </div>
  )
}

function PerBetLockGate({ betId, children }: { betId: string, children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const forceBuyer = searchParams?.get('as-buyer') === 'true'

  const { data: accessData } = useQuery({
    queryKey: ["bet-access", betId, "gate"],
    queryFn: async () => {
      if (forceBuyer) return { hasAccess: false }
      const res = await fetch(`/api/bets/${betId}/access`)
      if (!res.ok) return { hasAccess: false }
      return res.json()
    },
  })

  if (accessData?.hasAccess) {
    return <>{children}</>
  }
  return <PerBetLockedContent betId={betId} />
}

function PerParlayLockGate({ parlayId, children }: { parlayId: string, children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const forceBuyer = searchParams?.get('as-buyer') === 'true'

  const { data: accessData } = useQuery({
    queryKey: ["parlay-access", parlayId, "gate"],
    queryFn: async () => {
      if (forceBuyer) return { hasAccess: false }
      const res = await fetch(`/api/parlays/${parlayId}/access`)
      if (!res.ok) return { hasAccess: false }
      return res.json()
    },
  })

  if (accessData?.hasAccess) {
    return <>{children}</>
  }
  return <PerParlayLockedContent parlayId={parlayId} />
}

function BetOutcomeStatus({ betId, outcome }: { betId: string, outcome: string }) {
  const searchParams = useSearchParams()
  const forceBuyer = searchParams?.get('as-buyer') === 'true'
  const { data } = useQuery({
    queryKey: ["bet-access", betId, "header"],
    queryFn: async () => {
      if (forceBuyer) return { hasAccess: false }
      const res = await fetch(`/api/bets/${betId}/access`)
      if (!res.ok) return { hasAccess: false }
      return res.json()
    },
  })
  return <>{data?.hasAccess ? outcome : 'Locked'}</>
}

function PerParlayLockedContent({ parlayId }: { parlayId: string }) {
  const iframeSdk = useIframeSdk()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const forceBuyer = searchParams?.get('as-buyer') === 'true'

  const { data: accessData } = useQuery({
    queryKey: ["parlay-access", parlayId],
    queryFn: async () => {
      if (forceBuyer) return { hasAccess: false }
      const res = await fetch(`/api/parlays/${parlayId}/access`)
      if (!res.ok) return { hasAccess: false }
      return res.json()
    },
  })

  const { data: listingData } = useQuery({
    queryKey: ["parlay-listing", parlayId],
    queryFn: async () => {
      const res = await fetch(`/api/parlays/${parlayId}/listings`)
      if (!res.ok) return { listing: null }
      return res.json()
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/parlays/${parlayId}/checkout`, { method: 'POST', headers: forceBuyer ? { 'x-force-buyer': 'true' } : {} })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to create checkout' }))
        throw new Error(errorData.error || 'Failed to create checkout')
      }
      return res.json()
    },
    onSuccess: async (data) => {
      try {
        if (iframeSdk) {
          await iframeSdk.inAppPurchase({ planId: data.planId, id: data.checkoutId })
          // Best-effort confirmation in case webhook is delayed
          try {
            await fetch(`/api/parlays/${parlayId}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkoutId: data.checkoutId }) })
          } catch {}
          const poll = async (retries = 20) => {
            if (retries === 0) return
            const res = await fetch(`/api/parlays/${parlayId}/access`)
            if (res.ok) {
              const a = await res.json()
              if (a?.hasAccess) {
                queryClient.invalidateQueries({ queryKey: ["parlay-access", parlayId] })
                return
              }
            }
            setTimeout(() => poll(retries - 1), 1000)
          }
          setTimeout(() => poll(), 3000)
        } else {
          // Fallback: open checkout in new window if iframe SDK not available
          window.open(`https://whop.com/checkout/${data.checkoutId}`, '_blank')
          toast.info('Checkout opened in new window')
        }
      } catch (e) {
        console.error('Checkout failed', e)
        toast.error('Failed to open checkout. Please try again.')
      }
    },
    onError: (error: Error) => {
      console.error('Checkout error:', error)
      toast.error(error.message || 'Failed to create checkout. Please try again.')
    }
  })

  if (accessData?.hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">You own access to this parlay. Refresh to view details.</p>
      </div>
    )
  }

  const listing = listingData?.listing
  if (listing?.active) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Unlock this parlay for ${(listing.priceCents / 100).toFixed(2)} USD</p>
        <Button size="sm" onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending}>
          {checkoutMutation.isPending ? 'Processing…' : 'Buy access'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <Lock className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{`Subscribe to view odds, units, and explanations.`}</p>
    </div>
  )
}

