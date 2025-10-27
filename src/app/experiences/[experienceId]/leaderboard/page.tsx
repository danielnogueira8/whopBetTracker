"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWhop, getApiUrl } from "~/components/whop-context";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Trophy, TrendingUp, Users } from "lucide-react";
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
  const companyName = experience.company.title;
  const currentUserId = user.id;
  const isAdmin = access.accessLevel === "admin";
  
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
      const response = await fetch(getApiUrl("/api/leaderboard"));
      if (!response.ok) throw new Error("Failed to fetch leaderboard");
      return response.json();
    },
  });

  const { data: communityBetsData } = useQuery({
    queryKey: ["community-bets"],
    queryFn: async () => {
      const response = await fetch(getApiUrl("/api/bets?isCommunity=true"));
      if (!response.ok) throw new Error("Failed to fetch community bets");
      return response.json();
    },
  });

  const leaderboard: LeaderboardEntry[] = data?.leaderboard || [];
  const communityBets: any[] = communityBetsData?.bets || [];

  // Extract unique user IDs from community bets
  const uniqueUserIds = useMemo(() => {
    return Array.from(new Set(communityBets.map(bet => bet.userId)));
  }, [communityBets]);

  // Fetch admin status for all users
  const { data: adminStatusData } = useQuery({
    queryKey: ["admin-status", uniqueUserIds, experience.id],
    queryFn: async () => {
      if (uniqueUserIds.length === 0) return { adminStatus: {} };
      const response = await fetch(getApiUrl("/api/check-admin"), {
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

  // Calculate community aggregate stats for global leaderboard
  const communityForGlobal = useMemo(() => {
    if (!communityBets.length) return null;

    let totalBets = 0;
    let totalWins = 0;
    const oddValues: { value: string; format: OddFormat }[] = [];

    communityBets.forEach((bet) => {
      totalBets++;
      if (bet.result === "win") {
        totalWins++;
      }
      
      oddValues.push({
        value: bet.oddValue,
        format: bet.oddFormat
      });
    });

    const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;
    
    // Calculate average odds and ROI
    let avgOdds = 0;
    let roi = 0;
    
    if (oddValues.length > 0) {
      const sumOdds = oddValues.reduce((sum, oddData) => {
        const decimal = toDecimal(parseFloat(oddData.value), oddData.format);
        return sum + decimal;
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
  }, [communityBets, experience.id, companyName]);

  // Calculate community leaderboard
  const { communityLeaderboard, communityStats, rankedEntries } = useMemo(() => {
    const statsMap: Record<string, any> = {};
    let totalBets = 0;
    let totalWins = 0;
    let totalUnitsInvested = 0;
    let totalUnitsWon = 0;
    let totalDollarsInvested = 0;
    let totalDollarsWon = 0;

    // Get user IDs who have personal bets in the global stats
    const usersWithPersonalBets = new Set(leaderboard.map(l => l.userId));

    communityBets.forEach((bet) => {
      const userId = bet.userId;
      
      // Always count for community stats
      totalBets++;
      if (bet.unitsInvested) {
        const units = parseFloat(bet.unitsInvested);
        totalUnitsInvested += units;
        
        // For units won, calculate based on result
        if (bet.result === "win") {
          // On win, calculate total return: units * odds
          const decimalOdd = bet.oddFormat === "decimal" 
            ? parseFloat(bet.oddValue) 
            : bet.oddFormat === "american" 
              ? (parseFloat(bet.oddValue) > 0 ? parseFloat(bet.oddValue) / 100 + 1 : 100 / Math.abs(parseFloat(bet.oddValue)) + 1)
              : (() => {
                  const [num, den] = bet.oddValue.split("/").map(Number);
                  return num / den + 1;
                })();
          const totalReturn = units * decimalOdd;
          totalUnitsWon += totalReturn;
        } else if (bet.result === "lose") {
          // On loss, we get back 0 (lose everything)
          totalUnitsWon += 0;
        }
        // For pending or returned, no change to units won
      }
      if (bet.dollarsInvested) {
        const dollars = parseFloat(bet.dollarsInvested);
        totalDollarsInvested += dollars;
        
        if (bet.result === "win") {
          totalDollarsWon += dollars;
        } else if (bet.result === "lose") {
          totalDollarsWon -= dollars;
        }
      }
      if (bet.result === "win") {
        totalWins++;
      }
    });
    
    // Track user stats separately, excluding admin users
    communityBets.forEach((bet) => {
      const userId = bet.userId;
      
      // Skip if this user is an admin
      if (adminStatus[userId]) {
        return;
      }
      
      if (!statsMap[userId]) {
        statsMap[userId] = {
          userId,
          username: usersWithPersonalBets.has(userId) 
            ? leaderboard.find(l => l.userId === userId)?.username || userId
            : userId, // Use full userId, not truncated
          totalBets: 0,
          wonBets: 0,
          totalUnitsInvested: 0,
          totalUnitsWon: 0,
          totalDollarsInvested: 0,
          totalDollarsWon: 0,
          oddValues: [] as { value: string; format: OddFormat }[],
        };
      }
      
      // Track odd values for average calculation
      statsMap[userId].oddValues.push({
        value: bet.oddValue,
        format: bet.oddFormat
      });
      
      statsMap[userId].totalBets++;
      if (bet.unitsInvested) {
        const units = parseFloat(bet.unitsInvested);
        statsMap[userId].totalUnitsInvested += units;
      }
      if (bet.dollarsInvested) {
        const dollars = parseFloat(bet.dollarsInvested);
        statsMap[userId].totalDollarsInvested += dollars;
      }
      if (bet.result === "win") {
        statsMap[userId].wonBets++;
        if (bet.unitsInvested) {
          const units = parseFloat(bet.unitsInvested);
          // Calculate total return from odds
          const decimalOdd = bet.oddFormat === "decimal" 
            ? parseFloat(bet.oddValue) 
            : bet.oddFormat === "american" 
              ? (parseFloat(bet.oddValue) > 0 ? parseFloat(bet.oddValue) / 100 + 1 : 100 / Math.abs(parseFloat(bet.oddValue)) + 1)
              : (() => {
                  const [num, den] = bet.oddValue.split("/").map(Number);
                  return num / den + 1;
                })();
          const totalReturn = units * decimalOdd;
          statsMap[userId].totalUnitsWon += totalReturn;
        }
        if (bet.dollarsInvested) {
          const dollars = parseFloat(bet.dollarsInvested);
          const decimalOdd = bet.oddFormat === "decimal" 
            ? parseFloat(bet.oddValue) 
            : bet.oddFormat === "american" 
              ? (parseFloat(bet.oddValue) > 0 ? parseFloat(bet.oddValue) / 100 + 1 : 100 / Math.abs(parseFloat(bet.oddValue)) + 1)
              : (() => {
                  const [num, den] = bet.oddValue.split("/").map(Number);
                  return num / den + 1;
                })();
          const totalReturn = dollars * decimalOdd;
          statsMap[userId].totalDollarsWon += totalReturn;
        }
      } else if (bet.result === "lose") {
        // On loss, get back 0
        if (bet.unitsInvested) {
          statsMap[userId].totalUnitsWon += 0;
        }
        if (bet.dollarsInvested) {
          statsMap[userId].totalDollarsWon += 0;
        }
      }
    });

    const results = Object.values(statsMap).map((stat: any) => {
      const winRate = stat.totalBets > 0 ? (stat.wonBets / stat.totalBets) * 100 : 0;
      
      // Calculate average odds and ROI based on win rate and average odds
      let avgOdds = 0;
      let roi = 0;
      
      if (stat.totalBets > 0 && stat.oddValues && stat.oddValues.length > 0) {
        const sumOdds = stat.oddValues.reduce((sum: number, oddData: { value: string; format: OddFormat }) => {
          const decimal = toDecimal(parseFloat(oddData.value), oddData.format);
          return sum + decimal;
        }, 0);
        avgOdds = sumOdds / stat.oddValues.length;
        
        // Calculate ROI using the new formula: (winRatio * (avgOdds - 1)) - (1 - winRatio)
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

    // Sort by win rate, then by total bets
    const sorted = results.sort((a, b) => {
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }
      return b.totalBets - a.totalBets;
    });

    // Calculate community aggregate stats
    const communityWinRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;
    
    // Calculate average odds for community
    const communityOddValues = communityBets.map(bet => ({
      value: bet.oddValue,
      format: bet.oddFormat
    }));
    let communityAvgOdds = 0;
    let communityRoi = 0;
    
    if (communityOddValues.length > 0) {
      const sumOdds = communityOddValues.reduce((sum, oddData) => {
        const decimal = toDecimal(parseFloat(oddData.value), oddData.format);
        return sum + decimal;
      }, 0);
      communityAvgOdds = sumOdds / communityOddValues.length;
      
      // Calculate ROI using the new formula: (winRatio * (avgOdds - 1)) - (1 - winRatio)
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

    // Filter out admin user from individual members if they only created community bets
    // This was already done in the loop above, but we add this as a safety check
    const filteredSorted = sorted;

    // Combine community stats with individual members and sort by win rate
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
      ...filteredSorted.map(entry => ({ ...entry, isCommunity: false })),
    ].sort((a, b) => {
      // Sort by win rate descending, then by total bets
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }
      return b.totalBets - a.totalBets;
    });

    return { communityLeaderboard: sorted, communityStats, rankedEntries: allEntries };
  }, [communityBets, leaderboard, currentUserId, companyName, experience.id, isAdmin, adminStatus]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-4 p-4 border-b">
        <SidebarTrigger />
        <h1 className="text-xl font-semibold">Leaderboard</h1>
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
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Spinner className="size-8 text-primary animate-spin" />
                <p className="text-muted-foreground">Loading leaderboard...</p>
              </div>
            ) : leaderboard.length === 0 && !communityForGlobal ? (
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
                      <TableHead>Username</TableHead>
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
                    {/* Only show community aggregates on Global leaderboard */}
                    {communityForGlobal ? (
                      <TableRow className="bg-primary/10 hover:bg-primary/15">
                        <TableCell>
                          <Trophy className="h-4 w-4 text-primary" />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {communityForGlobal.username}
                            <Badge variant="secondary" className="bg-primary/20 text-primary border-primary">
                              Community
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{communityForGlobal.totalBets}</TableCell>
                        <TableCell className="text-right">{communityForGlobal.wonBets}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <TrendingUp className="h-3 w-3 text-muted-foreground" />
                            {communityForGlobal.winRate.toFixed(1)}%
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatAvgOdds(communityForGlobal.avgOdds)}
                        </TableCell>
                        <TableCell className="text-right">
                          {communityForGlobal.roi > 0 ? (
                            <span className="text-primary font-medium">+{communityForGlobal.roi.toFixed(1)}%</span>
                          ) : (
                            <span className="text-muted-foreground">{communityForGlobal.roi.toFixed(1)}%</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No community stats available yet.
                        </TableCell>
                      </TableRow>
                    )}
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

