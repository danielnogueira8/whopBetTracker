"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWhop } from "~/lib/whop-context";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Trophy, TrendingUp, Users, Award } from "lucide-react";
import { Spinner } from "~/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { toDecimal, fromDecimal, calculateBettingROI, type OddFormat } from "~/lib/bet-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

type LeaderboardEntry = {
  userId: string;
  username: string;
  totalBets: number;
  wonBets: number;
  winRate: number;
  avgOdds: number;
  roi: number;
};

export default function LeaderboardPage() {
  const { experience, user, access } = useWhop();
  
  if (!experience || !user || !access) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  
  const companyName = experience.company.title;
  
  const [preferredOddsFormat] = useState<OddFormat>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("preferredOddsFormat") as OddFormat) || "american";
    }
    return "american";
  });

  const formatAvgOdds = (decimalOdds: number): string => {
    return fromDecimal(decimalOdds, preferredOddsFormat);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const response = await fetch("/api/leaderboard");
      if (!response.ok) throw new Error("Failed to fetch leaderboard");
      return response.json();
    },
  });

  const { data: communityBetsData } = useQuery({
    queryKey: ["community-bets", experience.id],
    queryFn: async () => {
      const response = await fetch(`/api/bets?experienceId=${experience.id}&isCommunity=true`);
      if (!response.ok) throw new Error("Failed to fetch community bets");
      return response.json();
    },
  });

  const { data: communityParlaysData } = useQuery({
    queryKey: ["community-parlays-leaderboard", experience.id],
    queryFn: async () => {
      const response = await fetch(`/api/parlays?experienceId=${experience.id}&isCommunity=true&limit=500`);
      if (!response.ok) throw new Error("Failed to fetch community parlays");
      return response.json();
    },
  });

  const leaderboard: LeaderboardEntry[] = data?.leaderboard || [];
  const communityBets: any[] = useMemo(() => communityBetsData?.bets || [], [communityBetsData]);
  const communityParlays: any[] = useMemo(() => communityParlaysData?.parlays || [], [communityParlaysData]);

  // Global communities leaderboard
  const { data: communitiesData, isLoading: isLoadingCommunities } = useQuery({
    queryKey: ["communities-leaderboard"],
    queryFn: async () => {
      const response = await fetch("/api/leaderboard/communities");
      if (!response.ok) throw new Error("Failed to fetch communities leaderboard");
      return response.json();
    },
  });

  // Extract unique user IDs from community bets
  const uniqueUserIds = useMemo(() => {
    const ids = new Set<string>();
    communityBets.forEach((bet) => {
      if (bet?.userId) ids.add(bet.userId);
    });
    communityParlays.forEach((parlay) => {
      if (parlay?.userId) ids.add(parlay.userId);
    });
    return Array.from(ids);
  }, [communityBets, communityParlays]);

  // Fetch admin status for all users
  const { data: adminStatusData } = useQuery({
    queryKey: ["admin-status", uniqueUserIds, experience.id],
    queryFn: async () => {
      if (uniqueUserIds.length === 0) return { adminStatus: {} };
      const response = await fetch("/api/check-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: uniqueUserIds,
          experienceId: experience.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to check admin status");
      return response.json();
    },
    enabled: uniqueUserIds.length > 0,
  });

  const adminStatus: Record<string, boolean> = adminStatusData?.adminStatus || {};

  const communityParlayLegs = useMemo(() => {
    return communityParlays.flatMap((parlay) => {
      const legs = Array.isArray(parlay?.legs) ? parlay.legs : [];
      const legCount = legs.length > 0 ? legs.length : 1;
      const rawUnits = parlay?.unitsInvested != null ? parseFloat(parlay.unitsInvested) : NaN;
      const rawDollars = parlay?.dollarsInvested != null ? parseFloat(parlay.dollarsInvested) : NaN;
      const unitsPerLeg = Number.isFinite(rawUnits) ? rawUnits / legCount : null;
      const dollarsPerLeg = Number.isFinite(rawDollars) ? rawDollars / legCount : null;

      return legs.map((leg: any) => ({
        id: `${parlay.id}:${leg.id}`,
        parlayId: parlay.id,
        userId: parlay.userId ?? null,
        sport: leg.sport ?? null,
        betCategory: leg.betCategory ?? null,
        oddFormat: leg.oddFormat,
        oddValue: leg.oddValue?.toString() ?? "0",
        unitsInvested: unitsPerLeg != null ? unitsPerLeg.toString() : null,
        dollarsInvested: dollarsPerLeg != null ? dollarsPerLeg.toString() : null,
        result: leg.result ?? "pending",
        createdAt: parlay.createdAt,
        source: "parlay_leg" as const,
      }));
    });
  }, [communityParlays]);

  // Calculate community aggregate stats for global leaderboard
  const communityForGlobal = useMemo(() => {
    const combinedEntries = [...communityBets, ...communityParlayLegs];
    if (!combinedEntries.length) return null;

    let totalBets = 0;
    let totalWins = 0;
    const oddValues: { value: string; format: OddFormat }[] = [];

    combinedEntries.forEach((entry) => {
      totalBets++;
      if (entry.result === "win") {
        totalWins++;
      }

      if (entry.oddValue && entry.oddFormat) {
        oddValues.push({
          value: entry.oddValue,
          format: entry.oddFormat as OddFormat,
        });
      }
    });

    const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;

    // Calculate average odds and ROI
    let avgOdds = 0;
    let roi = 0;

    if (oddValues.length > 0) {
      const sumOdds = oddValues.reduce((sum, oddData) => {
        try {
          const decimal = toDecimal(oddData.value, oddData.format);
          return sum + decimal;
        } catch {
          return sum;
        }
      }, 0);
      avgOdds = sumOdds / oddValues.length;

      // Calculate ROI using the new formula: (winRatio * (avgOdds - 1)) - (1 - winRatio)
      const winRatio = winRate / 100;
      roi = calculateBettingROI(avgOdds, winRatio, true);
    }

    return {
      userId: `community_${experience.id}`,
      username: companyName,
      totalBets,
      wonBets: totalWins,
      winRate,
      avgOdds,
      roi,
    };
  }, [communityBets, communityParlayLegs, experience.id, companyName]);

  // Calculate community leaderboard
  const { communityLeaderboard, communityStats, rankedEntries } = useMemo(() => {
    const statsMap: Record<string, any> = {};
    const communityEntries = [...communityBets, ...communityParlayLegs];

    const usersWithPersonalBets = new Set(leaderboard.map((l) => l.userId));

    let totalBets = 0;
    let totalWins = 0;

    const toDecimalSafe = (value: string, format: string): number | null => {
      if (!value || !format) return null;
      try {
        return toDecimal(value, format as OddFormat);
      } catch {
        if (format === "fractional" && value.includes("/")) {
          const [n, d] = value.split("/").map(Number);
          if (d) return n / d + 1;
        }
        const parsed = parseFloat(value);
        if (!Number.isFinite(parsed)) return null;
        if (format === "american") {
          return parsed > 0 ? parsed / 100 + 1 : 100 / Math.abs(parsed) + 1;
        }
        return parsed;
      }
    };

    communityEntries.forEach((entry) => {
      totalBets++;
      if (entry.result === "win") {
        totalWins++;
      }

      const decimalOdd = entry.oddValue && entry.oddFormat ? toDecimalSafe(entry.oddValue, entry.oddFormat) : null;
      const userId: string | null | undefined = entry.userId;

      if (!userId || adminStatus[userId]) {
        return;
      }

      if (!statsMap[userId]) {
        statsMap[userId] = {
          userId,
          username:
            usersWithPersonalBets.has(userId)
              ? leaderboard.find((l) => l.userId === userId)?.username || userId
              : userId,
          totalBets: 0,
          wonBets: 0,
          totalUnitsInvested: 0,
          totalUnitsWon: 0,
          totalDollarsInvested: 0,
          totalDollarsWon: 0,
          oddValues: [] as { value: string; format: OddFormat }[],
        };
      }

      const stat = statsMap[userId];
      stat.totalBets++;

      if (entry.unitsInvested) {
        const units = parseFloat(entry.unitsInvested);
        if (Number.isFinite(units)) {
          stat.totalUnitsInvested += units;
          if (entry.result === "win" && decimalOdd != null) {
            stat.totalUnitsWon += units * decimalOdd;
          }
        }
      }

      if (entry.dollarsInvested) {
        const dollars = parseFloat(entry.dollarsInvested);
        if (Number.isFinite(dollars)) {
          stat.totalDollarsInvested += dollars;
          if (entry.result === "win" && decimalOdd != null) {
            stat.totalDollarsWon += dollars * decimalOdd;
          }
        }
      }

      if (entry.result === "win") {
        stat.wonBets++;
      }

      if (entry.oddValue && entry.oddFormat) {
        stat.oddValues.push({
          value: entry.oddValue,
          format: entry.oddFormat as OddFormat,
        });
      }
    });

    const results = Object.values(statsMap).map((stat: any) => {
      const winRate = stat.totalBets > 0 ? (stat.wonBets / stat.totalBets) * 100 : 0;

      let avgOdds = 0;
      let roi = 0;

      if (stat.oddValues.length > 0) {
        const sumOdds = stat.oddValues.reduce((sum: number, oddData: { value: string; format: OddFormat }) => {
          try {
            return sum + toDecimal(oddData.value, oddData.format);
          } catch {
            return sum;
          }
        }, 0);
        avgOdds = sumOdds / stat.oddValues.length;
        const winRatio = winRate / 100;
        roi = calculateBettingROI(avgOdds, winRatio, true);
      }

      return {
        ...stat,
        winRate,
        avgOdds,
        roi,
      };
    });

    const sorted = results.sort((a, b) => {
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }
      return b.totalBets - a.totalBets;
    });

    const communityWinRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;

    const communityOddValues = communityEntries
      .filter((entry) => entry.oddValue && entry.oddFormat)
      .map((entry) => ({ value: entry.oddValue as string, format: entry.oddFormat as OddFormat }));

    let communityAvgOdds = 0;
    let communityRoi = 0;

    if (communityOddValues.length > 0) {
      const sumOdds = communityOddValues.reduce((sum, oddData) => {
        try {
          return sum + toDecimal(oddData.value, oddData.format);
        } catch {
          return sum;
        }
      }, 0);
      communityAvgOdds = sumOdds / communityOddValues.length;
      const winRatio = communityWinRate / 100;
      communityRoi = calculateBettingROI(communityAvgOdds, winRatio, true);
    }

    const communityStats = {
      totalBets,
      wonBets: totalWins,
      winRate: communityWinRate,
      avgOdds: communityAvgOdds,
      roi: communityRoi,
    };

    const allEntries = [
      {
        userId: `community_${experience.id}`,
        username: companyName,
        totalBets: communityStats.totalBets,
        wonBets: communityStats.wonBets,
        winRate: communityStats.winRate,
        avgOdds: communityStats.avgOdds,
        roi: communityStats.roi,
        isCommunity: true,
      },
      ...sorted.map((entry) => ({ ...entry, isCommunity: false })),
    ].sort((a, b) => {
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }
      return b.totalBets - a.totalBets;
    });

    return { communityLeaderboard: sorted, communityStats, rankedEntries: allEntries };
  }, [communityBets, communityParlayLegs, leaderboard, adminStatus, companyName, experience.id]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-4 p-4 border-b">
        <SidebarTrigger />
        <div className="flex items-center gap-2">
          <Award className="h-6 w-6" />
          <h1 className="text-xl font-semibold">Leaderboard</h1>
        </div>
      </div>

      <div className="flex-1 p-6">
        <Tabs defaultValue="community" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="community">
              <Users className="h-4 w-4 mr-2" />
              {companyName}
            </TabsTrigger>
            <TabsTrigger value="global">
              <Trophy className="h-4 w-4 mr-2" />
              Global
            </TabsTrigger>
          </TabsList>

          {/* Community Leaderboard */}
          <TabsContent value="community" className="space-y-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Spinner className="size-8 text-primary animate-spin" />
                <p className="text-muted-foreground">Loading leaderboard...</p>
              </div>
            ) : communityStats.totalBets === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  No community bets yet. Start tracking to see rankings!
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Total Bets</TableHead>
                      <TableHead className="text-right">Wins</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Avg Odds</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          ROI
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                ROI = (Win Ratio × (Avg Odds - 1)) - (1 - Win Ratio)<br/>
                                Shows expected return on investment based on win rate and average odds.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedEntries.map((entry, index) => (
                      <TableRow 
                        key={entry.userId} 
                        className={entry.isCommunity ? "bg-primary/10 hover:bg-primary/15" : ""}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {index === 0 && <Trophy className="h-4 w-4 text-primary" />}
                            {index === 1 && <Trophy className="h-4 w-4 text-primary opacity-70" />}
                            {index === 2 && <Trophy className="h-4 w-4 text-primary opacity-50" />}
                            <span className="ml-2 font-medium">{index + 1}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {entry.username}
                            {entry.isCommunity && (
                              <Badge variant="secondary" className="bg-primary/20 text-primary border-primary">
                                Community
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{entry.totalBets}</TableCell>
                        <TableCell className="text-right">{entry.wonBets}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            {entry.winRate.toFixed(1)}%
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatAvgOdds(entry.avgOdds)}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.roi > 0 ? (
                            <span className="text-primary font-medium">+{entry.roi.toFixed(1)}%</span>
                          ) : (
                            <span className="text-muted-foreground">{entry.roi.toFixed(1)}%</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Global Leaderboard */}
          <TabsContent value="global" className="space-y-4">
            {isLoading || isLoadingCommunities ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Spinner className="size-8 text-primary animate-spin" />
                <p className="text-muted-foreground">Loading leaderboard...</p>
              </div>
            ) : (!communitiesData || (communitiesData?.leaderboard?.length ?? 0) === 0) ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  No stats available yet. Start tracking bets to see rankings!
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead>Community</TableHead>
                      <TableHead className="text-right">Total Bets</TableHead>
                      <TableHead className="text-right">Wins</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Avg Odds</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          ROI
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                ROI = (Win Ratio × (Avg Odds - 1)) - (1 - Win Ratio)<br/>
                                Shows expected return on investment based on win rate and average odds.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {communitiesData.leaderboard.map((row: any, index: number) => (
                      <TableRow key={row.experienceId} className="bg-primary/10/0 hover:bg-primary/15/0">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {index === 0 && <Trophy className="h-4 w-4 text-primary" />}
                            {index === 1 && <Trophy className="h-4 w-4 text-primary opacity-70" />}
                            {index === 2 && <Trophy className="h-4 w-4 text-primary opacity-50" />}
                            <span className="ml-2 font-medium">{index + 1}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {row.companyName}
                            <Badge variant="secondary" className="bg-primary/20 text-primary border-primary">
                              Community
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{row.totalBets}</TableCell>
                        <TableCell className="text-right">{row.wonBets}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            {row.winRate.toFixed(1)}%
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatAvgOdds(row.avgOdds)}</TableCell>
                        <TableCell className="text-right">
                          {row.roi > 0 ? (
                            <span className="text-primary font-medium">+{row.roi.toFixed(1)}%</span>
                          ) : (
                            <span className="text-muted-foreground">{row.roi.toFixed(1)}%</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

