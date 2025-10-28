"use client";

import React, { Fragment, useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { displayOdds, toDecimal, type OddFormat } from "~/lib/bet-utils";
import { useWhop } from "~/lib/whop-context";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { CreateBetDialog } from "~/components/create-bet-dialog";
import { EditBetDialog } from "~/components/edit-bet-dialog";
import { EditParlayDialog } from "~/components/edit-parlay-dialog";
import { ParlayDisplay } from "~/components/parlay-display";
import { Pagination } from "~/components/pagination";
import { Plus, Trash2, Search, Settings, TrendingUp, ChevronDown, ChevronUp, Edit, Info } from "lucide-react";
import { SortToggle } from "~/components/sort-toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { getBetCategoryLabel } from "~/lib/bet-category-utils";
import { Spinner } from "~/components/ui/spinner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

// Component for rendering individual parlay leg rows with editing capability
function LegRow({ 
  leg, 
  parlayId, 
  resultColors, 
  preferredOddsFormat,
  onUpdate 
}: { 
  leg: any; 
  parlayId: string; 
  resultColors: any;
  preferredOddsFormat: OddFormat;
  onUpdate: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedResult, setSelectedResult] = useState(leg.result);

  // Update selectedResult when leg.result changes
  useEffect(() => {
    setSelectedResult(leg.result);
  }, [leg.result]);

  const updateLeg = useMutation({
    mutationFn: async (result: string) => {
      const response = await fetch(`/api/parlays/${parlayId}/legs/${leg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
      if (!response.ok) throw new Error("Failed to update leg result");
      return response.json();
    },
    onSuccess: () => {
      onUpdate();
      setIsEditing(false);
    },
  });

  return (
    <TableRow className="bg-muted/10">
      <TableCell>
        <span className="text-xs text-muted-foreground ml-4">Leg</span>
      </TableCell>
      <TableCell className="font-medium">{leg.sport}</TableCell>
      <TableCell className="font-medium">{leg.game}</TableCell>
      <TableCell>{getBetCategoryLabel(leg.betCategory as any)}</TableCell>
      <TableCell>{leg.outcome}</TableCell>
      <TableCell>
        {displayOdds(parseFloat(leg.oddValue), leg.oddFormat, preferredOddsFormat)}
      </TableCell>
      <TableCell>-</TableCell>
      <TableCell>-</TableCell>
      <TableCell>
        <div className="flex gap-2 items-center">
          <Select 
            value={selectedResult} 
            onValueChange={(value) => {
              setSelectedResult(value);
              updateLeg.mutate(value);
            }}
            disabled={updateLeg.isPending}
          >
            <SelectTrigger className="w-28 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="win">Win</SelectItem>
              <SelectItem value="lose">Lose</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
            </SelectContent>
          </Select>
          {updateLeg.isPending && <span className="text-xs text-muted-foreground">Saving...</span>}
        </div>
      </TableCell>
      <TableCell>-</TableCell>
      <TableCell></TableCell>
    </TableRow>
  );
}

type Bet = {
  id: string;
  sport: string;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
  unitsInvested: string | null;
  dollarsInvested: string | null;
  result: "pending" | "win" | "lose" | "returned";
  createdAt: Date;
};

export default function MyBetsPage() {
  const { experience, user } = useWhop();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editParlayDialogOpen, setEditParlayDialogOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
  const [selectedParlay, setSelectedParlay] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [betToDelete, setBetToDelete] = useState<Bet | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResult, setFilterResult] = useState<"all" | "pending" | "win" | "lose" | "returned">("all");
  const [filterOddMin, setFilterOddMin] = useState("");
  const [filterOddMax, setFilterOddMax] = useState("");
  const [filterSport, setFilterSport] = useState<string>("all");
  const [filterBetCategory, setFilterBetCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferredOddsFormat, setPreferredOddsFormat] = useState<OddFormat>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("preferredOddsFormat") as OddFormat) || "american";
    }
    return "american";
  });
  const [expandedParlays, setExpandedParlays] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const experienceId = experience?.id || "";

  const toggleParlayExpansion = (parlayId: string) => {
    setExpandedParlays(prev => {
      const next = new Set(prev);
      if (next.has(parlayId)) {
        next.delete(parlayId);
      } else {
        next.add(parlayId);
      }
      return next;
    });
  };

  const formatUnits = (units: string | null | undefined) => {
    if (!units) return "-";
    const numValue = parseFloat(units);
    return numValue > 0 ? `+${units}` : units;
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-bets", page, experienceId],
    enabled: !!experienceId,
    queryFn: async () => {
      const params = new URLSearchParams({
        experienceId,
        userOnly: "true",
        page: String(page),
        limit: "50",
        order,
      });
      const response = await fetch(`/api/bets?${params}`);
      if (!response.ok) throw new Error("Failed to fetch bets");
      return response.json();
    },
  });

  // Fetch parlays
  const { data: parlaysData, isLoading: isLoadingParlays } = useQuery({
    queryKey: ["my-parlays", page, experienceId],
    queryFn: async () => {
      const params = new URLSearchParams({
        experienceId,
        page: String(page),
        limit: "50",
        order,
      });
      const response = await fetch(`/api/parlays?${params}`);
      if (!response.ok) throw new Error("Failed to fetch parlays");
      return response.json();
    },
    enabled: !!experienceId,
  });

  const bets: Bet[] = data?.bets || [];
  const pagination = data?.pagination;
  const parlays = parlaysData?.parlays || [];

  // Unified data structure combining bets and parlays
  const getItemTimestamp = (item: any) => {
    const raw = item?.eventDate ?? item?.createdAt;
    return raw ? new Date(raw).getTime() : 0;
  };

  const allBets = useMemo(() => {
    const betItems = bets.map((bet) => ({ ...bet, type: 'single' as const }));
    const parlayItems = parlays.map((parlay: any) => ({ ...parlay, type: 'parlay' as const }));
    const items = [...betItems, ...parlayItems];
    return items.sort((a, b) => {
      const da = getItemTimestamp(a);
      const db = getItemTimestamp(b);
      return order === 'asc' ? da - db : db - da;
    });
  }, [bets, parlays, order]);

  // Extract unique values for filters (include parlay legs)
  const uniqueSports = useMemo(() => {
    const allSports = new Set(bets.map(bet => bet.sport));
    parlays.forEach((parlay: any) => {
      if (parlay.legs) {
        parlay.legs.forEach((leg: any) => allSports.add(leg.sport));
      }
    });
    return Array.from(allSports);
  }, [bets, parlays]);

  const uniqueBetCategories = useMemo(() => {
    const categories = new Set(bets.map(bet => bet.betCategory));
    parlays.forEach((parlay: any) => {
      if (parlay.legs) {
        parlay.legs.forEach((leg: any) => categories.add(leg.betCategory));
      }
    });
    return Array.from(categories);
  }, [bets, parlays]);

  // Filter bets and parlays
  const filteredBets = useMemo(() => {
    return allBets.filter((item) => {
      if (item.type === 'single') {
        const bet = item as any;
        const matchesSearch =
          bet.game.toLowerCase().includes(searchQuery.toLowerCase()) ||
          bet.outcome.toLowerCase().includes(searchQuery.toLowerCase()) ||
          bet.sport.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesResult = filterResult === "all" || bet.result === filterResult;
        
        const decimalOdd = toDecimal(parseFloat(bet.oddValue), bet.oddFormat);
        const minValue = filterOddMin ? toDecimal(parseFloat(filterOddMin), preferredOddsFormat) : 0;
        const maxValue = filterOddMax ? toDecimal(parseFloat(filterOddMax), preferredOddsFormat) : Infinity;
        const matchesOdds = decimalOdd >= minValue && decimalOdd <= maxValue;

        const matchesSport = filterSport === "all" || bet.sport === filterSport;
        const matchesBetCategory = filterBetCategory === "all" || bet.betCategory === filterBetCategory;

        return matchesSearch && matchesResult && matchesOdds && matchesSport && matchesBetCategory;
      } else {
        // For parlays, check if parlay itself or any leg matches filters
        const parlay = item as any;
        const parlayMatches = {
          search: parlay.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            parlay.legs.some((leg: any) => 
              leg.game.toLowerCase().includes(searchQuery.toLowerCase()) ||
              leg.outcome.toLowerCase().includes(searchQuery.toLowerCase()) ||
              leg.sport.toLowerCase().includes(searchQuery.toLowerCase())
            ),
          result: filterResult === "all" || parlay.result === filterResult,
          odds: true, // Parlays use combined odds, skip odds filter for now
          sport: filterSport === "all" || parlay.legs.some((leg: any) => leg.sport === filterSport),
          category: filterBetCategory === "all" || parlay.legs.some((leg: any) => leg.betCategory === filterBetCategory),
        };
        
        return parlayMatches.search && parlayMatches.result && parlayMatches.sport && parlayMatches.category;
      }
    });
  }, [allBets, searchQuery, filterResult, filterOddMin, filterOddMax, filterSport, filterBetCategory, preferredOddsFormat]);

  const handleOddsFormatChange = (format: OddFormat) => {
    setPreferredOddsFormat(format);
    localStorage.setItem("preferredOddsFormat", format);
  };

  const deleteBet = useMutation({
    mutationFn: async (betId: string) => {
      const response = await fetch(`/api/bets/${betId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      queryClient.invalidateQueries({ queryKey: ["community-bets"] });
      setDeleteDialogOpen(false);
      setBetToDelete(null);
    },
  });

  const resultColors = {
    pending: "bg-primary/20 text-primary border-primary",
    win: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500",
    lose: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500",
    returned: "bg-muted text-muted-foreground border-border",
  };

  // Show loading if experience is not loaded yet
  if (!experience) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-4 p-4 border-b">
        <SidebarTrigger />
        <TooltipProvider>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">My Bet Tracker</h1>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Track and manage your personal bets and parlays. Record results, set units invested, and monitor your betting performance.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <Link href={`/experiences/${experienceId}/my-bets/analytics` as any}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Analytics
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            Odds Format
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Log New Bet
          </Button>
        </div>
      </div>

      <CreateBetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isCommunityBet={false}
      />

      <EditBetDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        bet={selectedBet}
      />

      <EditParlayDialog
        open={editParlayDialogOpen}
        onOpenChange={setEditParlayDialogOpen}
        parlay={selectedParlay}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader className="pt-6 pb-4">
            <DialogTitle>Display Settings</DialogTitle>
            <DialogDescription>
              Choose how you want to view odds.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-2 block">Odds Display Format</label>
            <Select
              value={preferredOddsFormat}
              onValueChange={(value: OddFormat) => handleOddsFormatChange(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="american">American (+150, -200)</SelectItem>
                <SelectItem value="decimal">Decimal (2.50)</SelectItem>
                <SelectItem value="fractional">Fractional (3/2)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bet?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this bet? This action cannot be undone.
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

      <div className="flex-1 p-6 space-y-4">
        {(isLoading || isLoadingParlays) ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Spinner className="size-8 text-primary animate-spin" />
            <p className="text-muted-foreground">Loading your bets...</p>
          </div>
        ) : bets.length === 0 && parlays.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No bets tracked yet. Log your first bet to get started!
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-4 items-center flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by game or outcome..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterResult} onValueChange={(value: any) => setFilterResult(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by result" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Results</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="win">Win</SelectItem>
                  <SelectItem value="lose">Lose</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2 items-center">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={`Min odds (${preferredOddsFormat})`}
                    value={filterOddMin}
                    onChange={(e) => setFilterOddMin(e.target.value)}
                    className="w-[140px]"
                    step="0.1"
                  />
                  <Input
                    type="number"
                    placeholder={`Max odds (${preferredOddsFormat})`}
                    value={filterOddMax}
                    onChange={(e) => setFilterOddMax(e.target.value)}
                    className="w-[140px]"
                    step="0.1"
                  />
                </div>
                {(filterOddMin || filterOddMax) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilterOddMin("");
                      setFilterOddMax("");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <Select value={filterSport} onValueChange={(value: any) => setFilterSport(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by sport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sports</SelectItem>
                  {uniqueSports.map((sport) => (
                    <SelectItem key={sport} value={sport}>
                      {sport}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterBetCategory} onValueChange={(value: any) => setFilterBetCategory(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by bet type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bet Types</SelectItem>
                  {uniqueBetCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {getBetCategoryLabel(category as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slip Type</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Game</TableHead>
                  <TableHead>Bet Type</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Odds</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>$ Invested</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>
                    <div className="flex items-center">
                      Date
                      <SortToggle value={order} onChange={(next) => setOrder(next)} />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No bets found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBets.map((item) => {
                    if (item.type === 'single') {
                      const bet = item as any;
                      return (
                        <TableRow key={bet.id}>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">Single</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{bet.sport}</TableCell>
                          <TableCell className="font-medium">{bet.game}</TableCell>
                          <TableCell>{getBetCategoryLabel(bet.betCategory as any)}</TableCell>
                          <TableCell>{bet.outcome}</TableCell>
                          <TableCell>
                            {displayOdds(parseFloat(bet.oddValue), bet.oddFormat, preferredOddsFormat)}
                          </TableCell>
                          <TableCell>{formatUnits(bet.unitsInvested)}</TableCell>
                          <TableCell>{bet.dollarsInvested || "-"}</TableCell>
                          <TableCell>
                            <Badge className={resultColors[bet.result as keyof typeof resultColors]}>
                              {bet.result}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(bet.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="hover:bg-primary/10 hover:text-primary"
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
                                className="hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                  setBetToDelete(bet);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    } else {
                      const parlay = item as any;
                      const isExpanded = expandedParlays.has(parlay.id);
                      return (
                        <Fragment key={parlay.id}>
                          {/* Main Parlay Row */}
                          <TableRow className="bg-muted/20">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">Parlay</Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => toggleParlayExpansion(parlay.id)}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>-</TableCell>
                            <TableCell className="font-medium">{parlay.name}</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell>{parlay.legs.length} legs</TableCell>
                            <TableCell>
                              {displayOdds(parseFloat(parlay.combinedOddValue), parlay.combinedOddFormat, preferredOddsFormat)}
                            </TableCell>
                            <TableCell>{formatUnits(parlay.unitsInvested)}</TableCell>
                            <TableCell>{parlay.dollarsInvested || "-"}</TableCell>
                            <TableCell>
                              <Badge className={resultColors[parlay.result as keyof typeof resultColors]}>
                                {parlay.result}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {new Date(parlay.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="hover:bg-primary/10 hover:text-primary"
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
                                  className="hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => {
                                    // Handle parlay delete
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {/* Expanded Parlay Legs */}
                          {isExpanded && parlay.legs.map((leg: any, index: number) => (
                            <LegRow 
                              key={`${parlay.id}-leg-${leg.id}`} 
                              leg={leg} 
                              parlayId={parlay.id}
                              resultColors={resultColors}
                              preferredOddsFormat={preferredOddsFormat}
                              onUpdate={() => {
                                queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "my-parlays" || query.queryKey[0] === "community-parlays" });
                              }}
                            />
                          ))}
                        </Fragment>
                      );
                    }
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {pagination && (
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={(newPage) => {
                setPage(newPage);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              showing={{
                from: ((pagination.page - 1) * pagination.limit) + 1,
                to: Math.min(pagination.page * pagination.limit, pagination.total),
                total: pagination.total
              }}
            />
          )}
          </>
        )}
      </div>
    </div>
  );
}

