"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWhop } from "~/lib/whop-context";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Progress } from "~/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import { ArrowLeft, TrendingUp, TrendingDown, Target, DollarSign, BarChart3, Gem, Filter, Download } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Spinner } from "~/components/ui/spinner";
import { toDecimal, type OddFormat } from "~/lib/bet-utils";
import { getBetCategoryLabel } from "~/lib/bet-category-utils";
import Link from "next/link";

// Helper function to get odds range label
function getOddsRange(decimalOdds: number): string {
  if (decimalOdds < 2.0) return 'Favorites (<2.0)';
  if (decimalOdds < 2.5) return 'Slight Favorites (2.0-2.5)';
  if (decimalOdds < 3.0) return 'Near Even (2.5-3.0)';
  if (decimalOdds < 4.0) return 'Slight Underdogs (3.0-4.0)';
  if (decimalOdds < 6.0) return 'Underdogs (4.0-6.0)';
  return 'Long Shots (>6.0)';
}

type Bet = {
  id: string;
  sport: string;
  game: string;
  outcome: string;
  betCategory: string;
  oddFormat: "american" | "decimal" | "fractional";
  oddValue: string;
  unitsInvested?: string | null;
  dollarsInvested?: string | null;
  result: "pending" | "win" | "lose" | "returned";
  createdAt: Date;
};

export default function AnalyticsPage() {
  const { experience } = useWhop();
  
  if (!experience) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  
  const experienceId = experience.id;
  const companyName = experience.company.title;

  const { data, isLoading } = useQuery({
    queryKey: ["community-bets", experienceId],
    queryFn: async () => {
      const response = await fetch(`/api/bets?experienceId=${experienceId}&isCommunity=true`);
      if (!response.ok) throw new Error("Failed to fetch bets");
      return response.json();
    },
  });

  // Fetch community parlays for analytics
  const { data: parlaysData, isLoading: isLoadingParlays } = useQuery({
    queryKey: ["community-parlays-analytics", experienceId],
    queryFn: async () => {
      const response = await fetch(`/api/parlays?experienceId=${experienceId}&isCommunity=true&limit=500`);
      if (!response.ok) throw new Error("Failed to fetch parlays");
      return response.json();
    },
  });

  const bets: Bet[] = data?.bets || [];
  const parlays = parlaysData?.parlays || [];

  // Filter state
  const [filterSport, setFilterSport] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<string>("all");
  const [filterSlipType, setFilterSlipType] = useState<string>("all");
  const [includePending, setIncludePending] = useState(false);

  // Unified data structure combining bets and parlays
  const allBets = useMemo(() => {
    const betItems = bets.map(bet => ({ ...bet, slipType: 'single' as const }));
    const parlayItems = parlays.map((parlay: any) => ({ ...parlay, slipType: 'parlay' as const }));
    return [...betItems, ...parlayItems].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [bets, parlays]);

  // Apply filters
  const filteredBets = useMemo(() => {
    return allBets.filter(item => {
      // Slip Type filter
      if (filterSlipType !== "all" && item.slipType !== filterSlipType) return false;
      
      // Sport filter - for singles use bet.sport, for parlays check if any leg matches
      if (filterSport !== "all") {
        if (item.slipType === 'single') {
          if (item.sport !== filterSport) return false;
        } else {
          // Parlay - check if any leg matches the sport
          const parlay = item as any;
          if (!parlay.legs?.some((leg: any) => leg.sport === filterSport)) return false;
        }
      }
      
      if (!includePending && item.result === "pending") return false;
      
      if (filterDateRange !== "all") {
        const betDate = new Date(item.createdAt);
        const now = new Date();
        
        if (filterDateRange === "last7") {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (betDate < sevenDaysAgo) return false;
        } else if (filterDateRange === "last30") {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (betDate < thirtyDaysAgo) return false;
        } else if (filterDateRange === "last90") {
          const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          if (betDate < ninetyDaysAgo) return false;
        }
      }
      
      return true;
    });
  }, [allBets, filterSlipType, filterSport, filterDateRange, includePending]);

  // Calculate analytics
  const analytics = useMemo(() => {
    const totalBets = filteredBets.length;
    const pendingBets = filteredBets.filter(b => b.result === "pending").length;
    const wonBets = filteredBets.filter(b => b.result === "win").length;
    const lostBets = filteredBets.filter(b => b.result === "lose").length;
    const returnedBets = filteredBets.filter(b => b.result === "returned").length;
    const settledBets = wonBets + lostBets + returnedBets;
    const winRate = settledBets > 0 ? (wonBets / settledBets) * 100 : 0;

    // Sport breakdown - for singles use bet.sport, for parlays include all leg sports
    const sportBreakdown: Record<string, { total: number; wins: number; losses: number; pending: number }> = {};
    filteredBets.forEach(item => {
      if (item.slipType === 'single') {
        const bet = item as any;
        if (!sportBreakdown[bet.sport]) {
          sportBreakdown[bet.sport] = { total: 0, wins: 0, losses: 0, pending: 0 };
        }
        sportBreakdown[bet.sport].total++;
        if (bet.result === "win") sportBreakdown[bet.sport].wins++;
        else if (bet.result === "lose") sportBreakdown[bet.sport].losses++;
        else if (bet.result === "pending") sportBreakdown[bet.sport].pending++;
      } else {
        // Parlay - count for each unique leg sport
        const parlay = item as any;
        const uniqueSports = new Set<string>();
        if (parlay.legs && Array.isArray(parlay.legs)) {
          parlay.legs.forEach((leg: any) => {
            if (leg.sport) uniqueSports.add(leg.sport);
          });
        }
        uniqueSports.forEach((sport: string) => {
          if (!sportBreakdown[sport]) {
            sportBreakdown[sport] = { total: 0, wins: 0, losses: 0, pending: 0 };
          }
          sportBreakdown[sport].total++;
          if (parlay.result === "win") sportBreakdown[sport].wins++;
          else if (parlay.result === "lose") sportBreakdown[sport].losses++;
          else if (parlay.result === "pending") sportBreakdown[sport].pending++;
        });
      }
    });

    // Monthly breakdown
    const monthlyBreakdown: Record<string, { total: number; wins: number; losses: number }> = {};
    filteredBets.forEach(bet => {
      const date = new Date(bet.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyBreakdown[monthKey]) {
        monthlyBreakdown[monthKey] = { total: 0, wins: 0, losses: 0 };
      }
      monthlyBreakdown[monthKey].total++;
      if (bet.result === "win") monthlyBreakdown[monthKey].wins++;
      else if (bet.result === "lose") monthlyBreakdown[monthKey].losses++;
    });

    // Calculate cumulative units over time
    const dailyData: Record<string, { wins: number; losses: number }> = {};
    
    filteredBets.forEach(item => {
      let unitsInvested = null;
      if (item.slipType === 'single') {
        unitsInvested = (item as any).unitsInvested;
      } else {
        // Parlay
        unitsInvested = (item as any).unitsInvested;
      }
      
      if (unitsInvested && item.result !== "pending") {
        const date = new Date(item.createdAt).toISOString().split("T")[0];
        if (!dailyData[date]) {
          dailyData[date] = { wins: 0, losses: 0 };
        }
        
        if (item.result === "win") {
          dailyData[date].wins += parseFloat(unitsInvested);
        } else if (item.result === "lose") {
          dailyData[date].losses += parseFloat(unitsInvested);
        }
      }
    });

    // Sort by date and calculate cumulative, filling missing calendar days
    const existingDates = Object.keys(dailyData).sort();
    let cumulativeWins = 0;
    let cumulativeLosses = 0;

    const cumulativeUnitsData: Array<{ date: string; wins: number; losses: number; net: number }> = [];
    if (existingDates.length > 0) {
      const start = new Date(existingDates[0]);
      const end = new Date();
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split("T")[0];
        const delta = dailyData[dateKey] ?? { wins: 0, losses: 0 };
        cumulativeWins += delta.wins;
        cumulativeLosses += delta.losses;
        cumulativeUnitsData.push({
          date: dateKey,
          wins: cumulativeWins,
          losses: cumulativeLosses,
          net: cumulativeWins - cumulativeLosses,
        });
      }
    }

    // Bet Category Breakdown
    const betCategoryBreakdown: Record<string, { 
      total: number; 
      wins: number; 
      losses: number; 
      pending: number;
      winRate: number;
      unitsWon: number;
      unitsLost: number;
      dollarsWon: number;
      dollarsLost: number;
      roi: number;
      avgOdds: number;
    }> = {};

    filteredBets.forEach(bet => {
      if (!betCategoryBreakdown[bet.betCategory]) {
        betCategoryBreakdown[bet.betCategory] = { 
          total: 0, 
          wins: 0, 
          losses: 0, 
          pending: 0,
          winRate: 0,
          unitsWon: 0,
          unitsLost: 0,
          dollarsWon: 0,
          dollarsLost: 0,
          roi: 0,
          avgOdds: 0
        };
      }
      
      betCategoryBreakdown[bet.betCategory].total++;
      if (bet.result === "win") betCategoryBreakdown[bet.betCategory].wins++;
      else if (bet.result === "lose") betCategoryBreakdown[bet.betCategory].losses++;
      else if (bet.result === "pending") betCategoryBreakdown[bet.betCategory].pending++;
      
      // Calculate financial metrics
      if (bet.unitsInvested) {
        if (bet.result === "win") {
          betCategoryBreakdown[bet.betCategory].unitsWon += parseFloat(bet.unitsInvested);
        } else if (bet.result === "lose") {
          betCategoryBreakdown[bet.betCategory].unitsLost += parseFloat(bet.unitsInvested);
        }
      }
      
      if (bet.dollarsInvested) {
        const amount = parseFloat(bet.dollarsInvested);
        if (bet.result === "win") {
          betCategoryBreakdown[bet.betCategory].dollarsWon += amount;
        } else if (bet.result === "lose") {
          betCategoryBreakdown[bet.betCategory].dollarsLost += amount;
        }
      }
      
      // Calculate average odds
      const decimalOdds = toDecimal(parseFloat(bet.oddValue), bet.oddFormat);
      betCategoryBreakdown[bet.betCategory].avgOdds += decimalOdds;
    });

    // Post-process bet category data
    Object.keys(betCategoryBreakdown).forEach(category => {
      const stats = betCategoryBreakdown[category];
      const settled = stats.wins + stats.losses;
      stats.winRate = settled > 0 ? (stats.wins / settled) * 100 : 0;
      
      const totalInvested = stats.unitsLost > 0 ? stats.unitsLost : 0;
      const totalWon = stats.unitsWon > 0 ? stats.unitsWon : 0;
      stats.roi = totalInvested > 0 ? ((totalWon - totalInvested) / totalInvested) * 100 : 0;
      
      stats.avgOdds = stats.total > 0 ? stats.avgOdds / stats.total : 0;
    });

    // Odds Range Breakdown
    const oddsRangeBreakdown: Record<string, {
      total: number;
      wins: number;
      losses: number;
      winRate: number;
      expectedWinRate: number;
      unitsWon: number;
      unitsLost: number;
      dollarsWon: number;
      dollarsLost: number;
      roi: number;
    }> = {};

    filteredBets.forEach(bet => {
      const decimalOdds = toDecimal(parseFloat(bet.oddValue), bet.oddFormat);
      const rangeLabel = getOddsRange(decimalOdds);
      
      if (!oddsRangeBreakdown[rangeLabel]) {
        oddsRangeBreakdown[rangeLabel] = {
          total: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          expectedWinRate: 0,
          unitsWon: 0,
          unitsLost: 0,
          dollarsWon: 0,
          dollarsLost: 0,
          roi: 0
        };
      }
      
      oddsRangeBreakdown[rangeLabel].total++;
      if (bet.result === "win") oddsRangeBreakdown[rangeLabel].wins++;
      else if (bet.result === "lose") oddsRangeBreakdown[rangeLabel].losses++;
      
      if (bet.unitsInvested) {
        if (bet.result === "win") {
          oddsRangeBreakdown[rangeLabel].unitsWon += parseFloat(bet.unitsInvested);
        } else if (bet.result === "lose") {
          oddsRangeBreakdown[rangeLabel].unitsLost += parseFloat(bet.unitsInvested);
        }
      }
      
      if (bet.dollarsInvested) {
        const amount = parseFloat(bet.dollarsInvested);
        if (bet.result === "win") {
          oddsRangeBreakdown[rangeLabel].dollarsWon += amount;
        } else if (bet.result === "lose") {
          oddsRangeBreakdown[rangeLabel].dollarsLost += amount;
        }
      }
    });

    // Post-process odds range data
    Object.keys(oddsRangeBreakdown).forEach(range => {
      const stats = oddsRangeBreakdown[range];
      const settled = stats.wins + stats.losses;
      stats.winRate = settled > 0 ? (stats.wins / settled) * 100 : 0;
      
      const totalInvested = stats.unitsLost > 0 ? stats.unitsLost : 0;
      const totalWon = stats.unitsWon > 0 ? stats.unitsWon : 0;
      stats.roi = totalInvested > 0 ? ((totalWon - totalInvested) / totalInvested) * 100 : 0;
      
      // Calculate average odds for range to get expected win rate
      const avgOdds = 2.0; // Simplified - would need to calculate actual average for each range
      stats.expectedWinRate = (1 / avgOdds) * 100;
    });

    // Slip Type Breakdown
    const slipTypeBreakdown: Record<string, {
      total: number;
      wins: number;
      losses: number;
      pending: number;
      winRate: number;
      unitsWon: number;
      unitsLost: number;
      dollarsWon: number;
      dollarsLost: number;
      roi: number;
    }> = {
      single: { total: 0, wins: 0, losses: 0, pending: 0, winRate: 0, unitsWon: 0, unitsLost: 0, dollarsWon: 0, dollarsLost: 0, roi: 0 },
      parlay: { total: 0, wins: 0, losses: 0, pending: 0, winRate: 0, unitsWon: 0, unitsLost: 0, dollarsWon: 0, dollarsLost: 0, roi: 0 }
    };

    filteredBets.forEach(item => {
      const slipType = item.slipType;
      const breakdown = slipTypeBreakdown[slipType];
      
      breakdown.total++;
      if (item.result === "win") breakdown.wins++;
      else if (item.result === "lose") breakdown.losses++;
      else if (item.result === "pending") breakdown.pending++;
      
      // Calculate financial metrics
      let unitsInvested = null;
      let dollarsInvested = null;
      
      if (item.slipType === 'single') {
        unitsInvested = (item as any).unitsInvested;
        dollarsInvested = (item as any).dollarsInvested;
      } else {
        // Parlay
        unitsInvested = (item as any).unitsInvested;
        dollarsInvested = (item as any).dollarsInvested;
      }
      
      if (unitsInvested) {
        if (item.result === "win") {
          breakdown.unitsWon += parseFloat(unitsInvested);
        } else if (item.result === "lose") {
          breakdown.unitsLost += parseFloat(unitsInvested);
        }
      }
      
      if (dollarsInvested) {
        const amount = parseFloat(dollarsInvested);
        if (item.result === "win") {
          breakdown.dollarsWon += amount;
        } else if (item.result === "lose") {
          breakdown.dollarsLost += amount;
        }
      }
    });

    // Post-process slip type data
    Object.keys(slipTypeBreakdown).forEach(type => {
      const stats = slipTypeBreakdown[type];
      const settled = stats.wins + stats.losses;
      stats.winRate = settled > 0 ? (stats.wins / settled) * 100 : 0;
      
      const totalInvested = stats.unitsLost > 0 ? stats.unitsLost : 0;
      const totalWon = stats.unitsWon > 0 ? stats.unitsWon : 0;
      stats.roi = totalInvested > 0 ? ((totalWon - totalInvested) / totalInvested) * 100 : 0;
    });

    return {
      totalBets,
      pendingBets,
      wonBets,
      lostBets,
      returnedBets,
      settledBets,
      winRate,
      sportBreakdown,
      monthlyBreakdown,
      cumulativeUnitsData,
      betCategoryBreakdown,
      oddsRangeBreakdown,
      slipTypeBreakdown,
    };
  }, [filteredBets]);

  // Export function
  const handleExport = () => {
    const csvData = [
      ['Bet ID', 'Sport', 'Game', 'Outcome', 'Result', 'Win Rate', 'Units Invested', 'Dollars Invested', 'Date'].join(','),
      ...filteredBets.map(bet => [
        bet.id,
        bet.sport,
        `"${bet.game}"`,
        `"${bet.outcome}"`,
        bet.result,
        filteredBets.filter(b => b.result !== 'pending').length > 0 
          ? ((filteredBets.filter(b => b.result === 'win').length / filteredBets.filter(b => b.result !== 'pending').length) * 100).toFixed(1) + '%'
          : '0%',
        bet.unitsInvested || '0',
        bet.dollarsInvested || '0',
        new Date(bet.createdAt).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `community-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (isLoading || isLoadingParlays) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <div className="flex items-center gap-4 p-4 border-b">
          <SidebarTrigger />
          <h1 className="text-xl font-semibold">Analytics</h1>
        </div>
        <div className="flex-1 p-6 flex flex-col items-center justify-center gap-4">
          <Spinner className="size-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-4 p-4 border-b">
        <SidebarTrigger />
        <Link href={`/experiences/${experienceId}/community-bets`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Bets
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">{companyName} - Analytics</h1>
        <Button onClick={handleExport} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Filter Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Sport</label>
                <Select value={filterSport} onValueChange={setFilterSport}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Sports" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sports</SelectItem>
                    {Array.from(new Set(bets.map(b => b.sport))).map(sport => (
                      <SelectItem key={sport} value={sport}>{sport}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Select value={filterDateRange} onValueChange={setFilterDateRange}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="last7">Last 7 Days</SelectItem>
                    <SelectItem value="last30">Last 30 Days</SelectItem>
                    <SelectItem value="last90">Last 90 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slip Type</label>
                <Select value={filterSlipType} onValueChange={setFilterSlipType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="single">Single Bets</SelectItem>
                    <SelectItem value="parlay">Parlays</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={includePending ? "include" : "exclude"} onValueChange={(value) => setIncludePending(value === "include")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclude">Settled Only</SelectItem>
                    <SelectItem value="include">Include Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bets</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalBets}</div>
              <p className="text-xs text-muted-foreground">
                {analytics.pendingBets} pending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.winRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {analytics.wonBets} wins / {analytics.settledBets} settled
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Wins</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{analytics.wonBets}</div>
              <p className="text-xs text-muted-foreground">
                {analytics.totalBets > 0 ? ((analytics.wonBets / analytics.totalBets) * 100).toFixed(1) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Losses</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{analytics.lostBets}</div>
              <p className="text-xs text-muted-foreground">
                {analytics.totalBets > 0 ? ((analytics.lostBets / analytics.totalBets) * 100).toFixed(1) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Units</CardTitle>
              <Gem className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${analytics.cumulativeUnitsData.length > 0 && analytics.cumulativeUnitsData[analytics.cumulativeUnitsData.length - 1].net >= 0 ? "text-primary" : "text-destructive"}`}>
                {analytics.cumulativeUnitsData.length > 0 
                  ? analytics.cumulativeUnitsData[analytics.cumulativeUnitsData.length - 1].net >= 0 
                    ? `+${analytics.cumulativeUnitsData[analytics.cumulativeUnitsData.length - 1].net.toFixed(2)}` 
                    : analytics.cumulativeUnitsData[analytics.cumulativeUnitsData.length - 1].net.toFixed(2)
                  : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">
                Cumulative units won vs lost
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Units Won/Loss Chart */}
        {analytics.cumulativeUnitsData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Units Won/Loss Over Time</CardTitle>
              <CardDescription>Cumulative units won and lost</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  wins: {
                    label: "Units Won",
                    color: "hsl(var(--chart-1))",
                  },
                  losses: {
                    label: "Units Lost",
                    color: "hsl(var(--chart-2))",
                  },
                  net: {
                    label: "Net Units",
                    color: "hsl(var(--chart-3))",
                  },
                }}
                className="h-[300px] w-full"
              >
                <LineChart data={analytics.cumulativeUnitsData} margin={{ right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    padding={{ left: 8, right: 16 }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                  />
                  <YAxis />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                  />
                  <Line
                    type="linear"
                    dataKey="wins"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    strokeOpacity={1}
                    dot={{ r: 2, fill: 'hsl(var(--chart-1))', stroke: 'transparent' }}
                    activeDot={{ r: 3, fill: 'hsl(var(--chart-1))', stroke: 'transparent' }}
                    connectNulls
                    strokeLinecap="round"
                  />
                  <Line
                    type="linear"
                    dataKey="losses"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    strokeOpacity={1}
                    dot={{ r: 2, fill: 'hsl(var(--chart-2))', stroke: 'transparent' }}
                    activeDot={{ r: 3, fill: 'hsl(var(--chart-2))', stroke: 'transparent' }}
                    connectNulls
                    strokeLinecap="round"
                  />
                  <Line
                    type="linear"
                    dataKey="net"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    strokeOpacity={1}
                    dot={{ r: 2, fill: 'hsl(var(--chart-3))', stroke: 'transparent' }}
                    activeDot={{ r: 3, fill: 'hsl(var(--chart-3))', stroke: 'transparent' }}
                    connectNulls
                    strokeLinecap="round"
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Performance by Sport */}
        <Card>
          <CardHeader>
            <CardTitle>Performance by Sport</CardTitle>
            <CardDescription>Track performance across different sports</CardDescription>
          </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(analytics.sportBreakdown).map(([sport, stats]) => {
                    const sportWinRate = stats.total - stats.pending > 0 
                      ? (stats.wins / (stats.total - stats.pending)) * 100 
                      : 0;
                    const progress = analytics.settledBets > 0 
                      ? ((stats.wins + stats.losses) / analytics.settledBets) * 100 
                      : 0;

                    return (
                      <div key={sport} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{sport}</span>
                            <Badge variant="outline">{stats.total} bets</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-primary font-medium">
                              {stats.wins} wins
                            </span>
                            <span className="text-destructive font-medium">
                              {stats.losses} losses
                            </span>
                            <span className="text-muted-foreground">
                              {stats.pending} pending
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Win Rate: {sportWinRate.toFixed(1)}%</span>
                            <span>{progress.toFixed(0)}% of all settled bets</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
        </Card>

        {/* Performance Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Over Time</CardTitle>
            <CardDescription>Monthly breakdown of betting activity</CardDescription>
          </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(analytics.monthlyBreakdown)
                    .sort()
                    .reverse()
                    .map(([month, stats]) => {
                      const monthWinRate = stats.total > 0 
                        ? (stats.wins / (stats.wins + stats.losses)) * 100 
                        : 0;
                      const date = new Date(month + "-01");
                      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                      return (
                        <div key={month} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium">{monthName}</h3>
                            <Badge variant="outline">{stats.total} bets</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-4 w-4 text-primary" />
                              <span className="text-primary font-medium">{stats.wins} wins</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <TrendingDown className="h-4 w-4 text-destructive" />
                              <span className="text-destructive font-medium">{stats.losses} losses</span>
                            </div>
                            <div className="ml-auto">
                              <span className="text-muted-foreground">Win Rate: </span>
                              <span className="font-medium">{monthWinRate.toFixed(1)}%</span>
                            </div>
                          </div>
                          <Progress value={stats.wins + stats.losses > 0 ? (stats.wins / (stats.wins + stats.losses)) * 100 : 0} className="h-2" />
                        </div>
                      );
                    })}
                </div>
              </CardContent>
        </Card>

        {/* Bet Category Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Performance by Bet Category</CardTitle>
            <CardDescription>Detailed breakdown by bet type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Bets</TableHead>
                    <TableHead>Wins</TableHead>
                    <TableHead>Losses</TableHead>
                    <TableHead>Win Rate</TableHead>
                    <TableHead>Units +/-</TableHead>
                    <TableHead>Dollars +/-</TableHead>
                    <TableHead>ROI</TableHead>
                    <TableHead>Avg Odds</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(analytics.betCategoryBreakdown)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([category, stats]) => {
                      const netUnits = stats.unitsWon - stats.unitsLost;
                      const netDollars = stats.dollarsWon - stats.dollarsLost;
                      
                      return (
                        <TableRow key={category}>
                          <TableCell className="font-medium">{getBetCategoryLabel(category as any)}</TableCell>
                          <TableCell>{stats.total}</TableCell>
                          <TableCell className="text-primary">{stats.wins}</TableCell>
                          <TableCell className="text-destructive">{stats.losses}</TableCell>
                          <TableCell>{stats.winRate.toFixed(1)}%</TableCell>
                          <TableCell className={netUnits >= 0 ? "text-primary" : "text-destructive"}>
                            {netUnits >= 0 ? `+${netUnits.toFixed(2)}` : netUnits.toFixed(2)}
                          </TableCell>
                          <TableCell className={netDollars >= 0 ? "text-primary" : "text-destructive"}>
                            {netDollars >= 0 ? `+$${netDollars.toFixed(2)}` : `-$${Math.abs(netDollars).toFixed(2)}`}
                          </TableCell>
                          <TableCell className={stats.roi >= 0 ? "text-primary" : "text-destructive"}>
                            {stats.roi >= 0 ? `+${stats.roi.toFixed(1)}%` : `${stats.roi.toFixed(1)}%`}
                          </TableCell>
                          <TableCell>{stats.avgOdds.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  {Object.keys(analytics.betCategoryBreakdown).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        No bet category data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Performance by Slip Type */}
        <Card>
          <CardHeader>
            <CardTitle>Performance by Slip Type</CardTitle>
            <CardDescription>Compare single bets vs parlays</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slip Type</TableHead>
                    <TableHead>Bets</TableHead>
                    <TableHead>Wins</TableHead>
                    <TableHead>Losses</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Win Rate</TableHead>
                    <TableHead>Units +/-</TableHead>
                    <TableHead>Dollars +/-</TableHead>
                    <TableHead>ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(analytics.slipTypeBreakdown)
                    .map(([type, stats]) => {
                      const netUnits = stats.unitsWon - stats.unitsLost;
                      const netDollars = stats.dollarsWon - stats.dollarsLost;
                      
                      return (
                        <TableRow key={type}>
                          <TableCell className="font-medium">{type === 'single' ? 'Single Bets' : 'Parlays'}</TableCell>
                          <TableCell>{stats.total}</TableCell>
                          <TableCell className="text-primary">{stats.wins}</TableCell>
                          <TableCell className="text-destructive">{stats.losses}</TableCell>
                          <TableCell>{stats.pending}</TableCell>
                          <TableCell>{stats.winRate.toFixed(1)}%</TableCell>
                          <TableCell className={netUnits >= 0 ? "text-primary" : "text-destructive"}>
                            {netUnits >= 0 ? `+${netUnits.toFixed(2)}` : netUnits.toFixed(2)}
                          </TableCell>
                          <TableCell className={netDollars >= 0 ? "text-primary" : "text-destructive"}>
                            {netDollars >= 0 ? `+$${netDollars.toFixed(2)}` : `-$${Math.abs(netDollars).toFixed(2)}`}
                          </TableCell>
                          <TableCell className={stats.roi >= 0 ? "text-primary" : "text-destructive"}>
                            {stats.roi >= 0 ? `+${stats.roi.toFixed(1)}%` : `${stats.roi.toFixed(1)}%`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Odds Range Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Performance by Odds Range</CardTitle>
            <CardDescription>How the community performs at different odds levels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Odds Range</TableHead>
                    <TableHead>Bets</TableHead>
                    <TableHead>Wins</TableHead>
                    <TableHead>Losses</TableHead>
                    <TableHead>Actual Win Rate</TableHead>
                    <TableHead>Expected Win Rate</TableHead>
                    <TableHead>Units +/-</TableHead>
                    <TableHead>Dollars +/-</TableHead>
                    <TableHead>ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(analytics.oddsRangeBreakdown)
                    .sort(([a], [b]) => {
                      // Sort by odds range (from favorites to long shots)
                      const order = [
                        'Favorites (<2.0)',
                        'Slight Favorites (2.0-2.5)',
                        'Near Even (2.5-3.0)',
                        'Slight Underdogs (3.0-4.0)',
                        'Underdogs (4.0-6.0)',
                        'Long Shots (>6.0)'
                      ];
                      return order.indexOf(a) - order.indexOf(b);
                    })
                    .map(([range, stats]) => {
                      const netUnits = stats.unitsWon - stats.unitsLost;
                      const netDollars = stats.dollarsWon - stats.dollarsLost;
                      
                      return (
                        <TableRow key={range}>
                          <TableCell className="font-medium">{range}</TableCell>
                          <TableCell>{stats.total}</TableCell>
                          <TableCell className="text-primary">{stats.wins}</TableCell>
                          <TableCell className="text-destructive">{stats.losses}</TableCell>
                          <TableCell className={stats.winRate >= stats.expectedWinRate ? "text-primary" : "text-destructive"}>
                            {stats.winRate.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-muted-foreground">{stats.expectedWinRate.toFixed(1)}%</TableCell>
                          <TableCell className={netUnits >= 0 ? "text-primary" : "text-destructive"}>
                            {netUnits >= 0 ? `+${netUnits.toFixed(2)}` : netUnits.toFixed(2)}
                          </TableCell>
                          <TableCell className={netDollars >= 0 ? "text-primary" : "text-destructive"}>
                            {netDollars >= 0 ? `+$${netDollars.toFixed(2)}` : `-$${Math.abs(netDollars).toFixed(2)}`}
                          </TableCell>
                          <TableCell className={stats.roi >= 0 ? "text-primary" : "text-destructive"}>
                            {stats.roi >= 0 ? `+${stats.roi.toFixed(1)}%` : `${stats.roi.toFixed(1)}%`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {Object.keys(analytics.oddsRangeBreakdown).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        No odds range data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

