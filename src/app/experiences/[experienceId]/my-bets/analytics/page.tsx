"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWhop, getApiUrl } from "~/components/whop-context";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Progress } from "~/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import { ArrowLeft, TrendingUp, TrendingDown, Target, BarChart3, Gem } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Spinner } from "~/components/ui/spinner";
import Link from "next/link";

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

export default function PersonalAnalyticsPage() {
  const { experience, user } = useWhop();
  const experienceId = experience.id;

  const { data, isLoading } = useQuery({
    queryKey: ["my-bets"],
    queryFn: async () => {
      const response = await fetch(getApiUrl("/api/bets?userOnly=true"));
      if (!response.ok) throw new Error("Failed to fetch bets");
      return response.json();
    },
  });

  const bets: Bet[] = data?.bets || [];

  // Calculate analytics
  const analytics = useMemo(() => {
    const totalBets = bets.length;
    const pendingBets = bets.filter(b => b.result === "pending").length;
    const wonBets = bets.filter(b => b.result === "win").length;
    const lostBets = bets.filter(b => b.result === "lose").length;
    const returnedBets = bets.filter(b => b.result === "returned").length;
    const settledBets = wonBets + lostBets + returnedBets;
    const winRate = settledBets > 0 ? (wonBets / settledBets) * 100 : 0;

    // Sport breakdown
    const sportBreakdown: Record<string, { total: number; wins: number; losses: number; pending: number }> = {};
    bets.forEach(bet => {
      if (!sportBreakdown[bet.sport]) {
        sportBreakdown[bet.sport] = { total: 0, wins: 0, losses: 0, pending: 0 };
      }
      sportBreakdown[bet.sport].total++;
      if (bet.result === "win") sportBreakdown[bet.sport].wins++;
      else if (bet.result === "lose") sportBreakdown[bet.sport].losses++;
      else if (bet.result === "pending") sportBreakdown[bet.sport].pending++;
    });

    // Monthly breakdown
    const monthlyBreakdown: Record<string, { total: number; wins: number; losses: number }> = {};
    bets.forEach(bet => {
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
    
    bets.forEach(bet => {
      if (bet.unitsInvested && bet.result !== "pending") {
        const date = new Date(bet.createdAt).toISOString().split("T")[0];
        if (!dailyData[date]) {
          dailyData[date] = { wins: 0, losses: 0 };
        }
        
        if (bet.result === "win") {
          dailyData[date].wins += parseFloat(bet.unitsInvested);
        } else if (bet.result === "lose") {
          dailyData[date].losses += parseFloat(bet.unitsInvested);
        }
      }
    });

    // Sort by date and calculate cumulative
    const sortedDates = Object.keys(dailyData).sort();
    let cumulativeWins = 0;
    let cumulativeLosses = 0;

    const cumulativeUnitsData = sortedDates.map(date => {
      cumulativeWins += dailyData[date].wins;
      cumulativeLosses += dailyData[date].losses;
      
      return {
        date,
        wins: cumulativeWins,
        losses: cumulativeLosses,
        net: cumulativeWins - cumulativeLosses,
      };
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
    };
  }, [bets]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <div className="flex items-center gap-4 p-4 border-b">
          <SidebarTrigger />
          <h1 className="text-xl font-semibold">My Analytics</h1>
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
        <Link href={`/experiences/${experienceId}/my-bets`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to My Bets
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">My Analytics</h1>
      </div>

      <div className="flex-1 p-6 space-y-6">
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
                <LineChart data={analytics.cumulativeUnitsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
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
                    type="monotone"
                    dataKey="wins"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="losses"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Detailed Tabs */}
        <Tabs defaultValue="sports" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sports">By Sport</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* Sport Breakdown */}
          <TabsContent value="sports" className="space-y-4">
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
          </TabsContent>

          {/* Timeline Breakdown */}
          <TabsContent value="timeline" className="space-y-4">
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

