"use client";

import { useState, useMemo } from "react";
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
import { Pagination } from "~/components/pagination";
import { Plus, Trash2, Search, Settings, TrendingUp } from "lucide-react";
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
  
  if (!experience) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  
  const experienceId = experience.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
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

  const formatUnits = (units: string | null | undefined) => {
    if (!units) return "-";
    const numValue = parseFloat(units);
    return numValue > 0 ? `+${units}` : units;
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-bets", page],
    queryFn: async () => {
      const params = new URLSearchParams({
        userOnly: "true",
        page: String(page),
        limit: "50"
      });
      const response = await fetch(`/api/bets?${params}`);
      if (!response.ok) throw new Error("Failed to fetch bets");
      return response.json();
    },
  });

  const bets: Bet[] = data?.bets || [];
  const pagination = data?.pagination;

  // Extract unique values for filters
  const uniqueSports = useMemo(() => {
    return Array.from(new Set(bets.map(bet => bet.sport)));
  }, [bets]);

  const uniqueBetCategories = useMemo(() => {
    return Array.from(new Set(bets.map(bet => bet.betCategory)));
  }, [bets]);

  // Filter bets based on search and filters
  const filteredBets = useMemo(() => {
    return bets.filter((bet) => {
      const matchesSearch =
        bet.game.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bet.outcome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bet.sport.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesResult = filterResult === "all" || bet.result === filterResult;
      
      // Filter by odds value range (decimal format)
      const decimalOdd = toDecimal(parseFloat(bet.oddValue), bet.oddFormat);
      const minValue = filterOddMin ? parseFloat(filterOddMin) : 0;
      const maxValue = filterOddMax ? parseFloat(filterOddMax) : Infinity;
      const matchesOdds = decimalOdd >= minValue && decimalOdd <= maxValue;

      const matchesSport = filterSport === "all" || bet.sport === filterSport;
      const matchesBetCategory = filterBetCategory === "all" || bet.betCategory === filterBetCategory;

      return matchesSearch && matchesResult && matchesOdds && matchesSport && matchesBetCategory;
    });
  }, [bets, searchQuery, filterResult, filterOddMin, filterOddMax, filterSport, filterBetCategory]);

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
    win: "bg-primary/80 text-primary-foreground border-primary",
    lose: "bg-destructive/20 text-destructive border-destructive",
    returned: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-4 p-4 border-b">
        <SidebarTrigger />
        <h1 className="text-xl font-semibold">My Bet Tracker</h1>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <Link href={`/experiences/${experienceId}/my-bets/analytics`}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Analytics
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
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

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Display Settings</DialogTitle>
            <DialogDescription>
              Choose how you want to view odds.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
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
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Spinner className="size-8 text-primary animate-spin" />
            <p className="text-muted-foreground">Loading your bets...</p>
          </div>
        ) : bets.length === 0 ? (
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
                    placeholder="Min odds"
                    value={filterOddMin}
                    onChange={(e) => setFilterOddMin(e.target.value)}
                    className="w-[120px]"
                    step="0.1"
                  />
                  <Input
                    type="number"
                    placeholder="Max odds"
                    value={filterOddMax}
                    onChange={(e) => setFilterOddMax(e.target.value)}
                    className="w-[120px]"
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
                <span className="text-xs text-muted-foreground">
                  (Decimal format)
                </span>
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
                  <TableHead>Sport</TableHead>
                  <TableHead>Game</TableHead>
                  <TableHead>Bet Type</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Odds</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>$ Invested</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Date</TableHead>
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
                  filteredBets.map((bet) => (
                    <TableRow key={bet.id}>
                    <TableCell className="font-medium">{bet.sport}</TableCell>
                    <TableCell className="font-medium">{bet.game}</TableCell>
                    <TableCell>{getBetCategoryLabel(bet.betCategory as any)}</TableCell>
                    <TableCell>{bet.outcome}</TableCell>
                    <TableCell>
                      {displayOdds(parseFloat(bet.oddValue), bet.oddFormat, preferredOddsFormat)}
                    </TableCell>
                    <TableCell className="uppercase text-xs text-muted-foreground">
                      {preferredOddsFormat}
                    </TableCell>
                    <TableCell>{formatUnits(bet.unitsInvested)}</TableCell>
                    <TableCell>{bet.dollarsInvested || "-"}</TableCell>
                    <TableCell>
                      <Badge className={resultColors[bet.result]}>
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
                          Edit
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
                  ))
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

