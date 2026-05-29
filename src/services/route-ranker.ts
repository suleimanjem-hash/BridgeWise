import { calculateStellarNetworkScore, StellarNetworkMetrics } from '../scoring/routes/stellar';
import { stellarRouteHealthMonitor } from '../monitoring/routes/stellar';

export interface BridgeRoute {
  id: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  fee: {
    amount: string;
    token: string;
    usdValue?: number;
  };
  estimatedTime: number; // in minutes
  successRate: number; // 0-1
  provider: string;
  gasEstimate?: {
    amount: string;
    token: string;
    usdValue?: number;
  };
  slippage?: number; // percentage
  minAmount?: string;
  maxAmount?: string;
  requiresApproval?: boolean;
  confidence?: number; // 0-1, how confident we are in this estimate
  networkMetrics?: StellarNetworkMetrics;
}

export interface RankingCriteria {
  feeWeight: number; // 0-1, importance of low fees
  speedWeight: number; // 0-1, importance of fast execution
  reliabilityWeight: number; // 0-1, importance of high success rate
  confidenceWeight: number; // 0-1, importance of confident estimates
  networkWeight: number; // 0-1, importance of real-time network conditions
  maxSlippage?: number; // maximum acceptable slippage percentage
  maxTime?: number; // maximum acceptable time in minutes
  minSuccessRate?: number; // minimum acceptable success rate
  excludeProviders?: string[]; // providers to exclude
}

export interface RankedRoute extends BridgeRoute {
  rank: number;
  score: number;
  breakdown: {
    feeScore: number;
    speedScore: number;
    reliabilityScore: number;
    confidenceScore: number;
    networkScore: number;
  };
  recommendation: 'best' | 'good' | 'acceptable' | 'risky';
}

export class RouteRanker {
  private static instance: RouteRanker;
  private defaultCriteria: RankingCriteria = {
    feeWeight: 0.25,
    speedWeight: 0.25,
    reliabilityWeight: 0.25,
    confidenceWeight: 0.15,
    networkWeight: 0.1,
    maxSlippage: 5.0, // 5%
    maxTime: 60, // 1 hour
    minSuccessRate: 0.8, // 80%
  };

  private constructor() {}

  static getInstance(): RouteRanker {
    if (!RouteRanker.instance) {
      RouteRanker.instance = new RouteRanker();
    }
    return RouteRanker.instance;
  }

  /**
   * Rank multiple bridge routes based on the given criteria
   */
  rankRoutes(routes: BridgeRoute[], criteria?: Partial<RankingCriteria>): RankedRoute[] {
    const finalCriteria = { ...this.defaultCriteria, ...criteria };
    
    // Filter routes based on basic criteria
    const filteredRoutes = this.filterRoutes(routes, finalCriteria);
    
    if (filteredRoutes.length === 0) {
      return [];
    }

    // Calculate scores for each route
    const scoredRoutes = filteredRoutes.map(route => ({
      ...route,
      breakdown: this.calculateScoreBreakdown(route, filteredRoutes, finalCriteria),
    }));

    // Calculate final scores and sort
    const rankedRoutes = scoredRoutes
      .map(route => ({
        ...route,
        score: this.calculateFinalScore(route.breakdown, finalCriteria),
      }))
      .sort((a, b) => b.score - a.score)
      .map((route, index) => ({
        ...route,
        rank: index + 1,
        recommendation: this.getRecommendation(route.score, index + 1, scoredRoutes.length),
      }));

    return rankedRoutes;
  }

  /**
   * Get the best route for a given set of routes
   */
  getBestRoute(routes: BridgeRoute[], criteria?: Partial<RankingCriteria>): RankedRoute | null {
    const rankedRoutes = this.rankRoutes(routes, criteria);
    return rankedRoutes.length > 0 ? rankedRoutes[0] : null;
  }

  /**
   * Get alternative routes that might be worth considering
   */
  getAlternativeRoutes(
    routes: BridgeRoute[], 
    bestRoute: RankedRoute, 
    criteria?: Partial<RankingCriteria>,
    maxAlternatives: number = 2
  ): RankedRoute[] {
    const rankedRoutes = this.rankRoutes(routes, criteria);
    
    // Filter out the best route and get alternatives
    return rankedRoutes
      .filter(route => route.id !== bestRoute.id)
      .slice(0, maxAlternatives);
  }

  /**
   * Filter routes based on basic criteria
   */
  private filterRoutes(routes: BridgeRoute[], criteria: RankingCriteria): BridgeRoute[] {
    return routes.filter(route => {
      // Check slippage
      if (criteria.maxSlippage && route.slippage && route.slippage > criteria.maxSlippage) {
        return false;
      }

      // Check time
      if (criteria.maxTime && route.estimatedTime > criteria.maxTime) {
        return false;
      }

      // Check success rate
      if (criteria.minSuccessRate && route.successRate < criteria.minSuccessRate) {
        return false;
      }

      // Check excluded providers
      if (criteria.excludeProviders?.includes(route.provider)) {
        return false;
      }

      // Exclude routes that have been disabled by health monitoring.
      if (stellarRouteHealthMonitor.isRouteDisabled(route.id)) {
        return false;
      }

      // Exclude explicitly unavailable route metrics.
      if (route.networkMetrics?.availability === 0) {
        return false;
      }

      return true;
    });
  }

  /**
   * Calculate individual score components for a route
   */
  private calculateScoreBreakdown(
    route: BridgeRoute, 
    allRoutes: BridgeRoute[], 
    criteria: RankingCriteria
  ) {
    // Fee score (lower is better)
    const feeScores = allRoutes.map(r => this.getFeeValue(r));
    const minFee = Math.min(...feeScores);
    const maxFee = Math.max(...feeScores);
    const feeScore = this.normalizeScore(this.getFeeValue(route), minFee, maxFee, true);

    // Speed score (lower time is better)
    const times = allRoutes.map(r => r.estimatedTime);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const speedScore = this.normalizeScore(route.estimatedTime, minTime, maxTime, true);

    // Reliability score (higher success rate is better)
    const successRates = allRoutes.map(r => r.successRate);
    const minSuccess = Math.min(...successRates);
    const maxSuccess = Math.max(...successRates);
    const reliabilityScore = this.normalizeScore(route.successRate, minSuccess, maxSuccess, false);

    // Confidence score (higher confidence is better)
    const confidenceScores = allRoutes.map(r => r.confidence || 0.5);
    const minConfidence = Math.min(...confidenceScores);
    const maxConfidence = Math.max(...confidenceScores);
    const confidenceScore = this.normalizeScore(route.confidence || 0.5, minConfidence, maxConfidence, false);

    // Network score (dynamic Stellar and network conditions)
    const networkScore = calculateStellarNetworkScore(route, allRoutes);

    return {
      feeScore,
      speedScore,
      reliabilityScore,
      confidenceScore,
      networkScore,
    };
  }

  /**
   * Calculate final weighted score
   */
  private calculateFinalScore(
    breakdown: ReturnType<RouteRanker['calculateScoreBreakdown']>,
    criteria: RankingCriteria
  ): number {
    const totalWeight = criteria.feeWeight + criteria.speedWeight +
                     criteria.reliabilityWeight + criteria.confidenceWeight +
                     criteria.networkWeight;
    
    return (
      (breakdown.feeScore * criteria.feeWeight +
       breakdown.speedScore * criteria.speedWeight +
       breakdown.reliabilityScore * criteria.reliabilityWeight +
       breakdown.confidenceScore * criteria.confidenceWeight +
       breakdown.networkScore * criteria.networkWeight) / totalWeight
    );
  }

  /**
   * Normalize a score to 0-1 range
   */
  private normalizeScore(
    value: number, 
    min: number, 
    max: number, 
    lowerIsBetter: boolean
  ): number {
    if (max === min) return 0.5; // All values are the same
    
    const normalized = (value - min) / (max - min);
    return lowerIsBetter ? 1 - normalized : normalized;
  }

  /**
   * Get fee value in USD for comparison
   */
  private getFeeValue(route: BridgeRoute): number {
    // Prefer USD value if available
    if (route.fee.usdValue) {
      return route.fee.usdValue;
    }
    
    // If no USD value, estimate based on token (this would need price data)
    // For now, return a placeholder
    return parseFloat(route.fee.amount);
  }

  /**
   * Get recommendation level based on score and rank
   */
  private getRecommendation(score: number, rank: number, totalRoutes: number): RankedRoute['recommendation'] {
    if (rank === 1 && score > 0.8) return 'best';
    if (score > 0.6 && rank <= Math.ceil(totalRoutes * 0.3)) return 'good';
    if (score > 0.4) return 'acceptable';
    return 'risky';
  }

  /**
   * Get ranking statistics for a set of routes
   */
  getRankingStats(rankedRoutes: RankedRoute[]) {
    if (rankedRoutes.length === 0) {
      return {
        totalRoutes: 0,
        averageScore: 0,
        bestScore: 0,
        scoreRange: { min: 0, max: 0 },
        providerDistribution: {},
      };
    }

    const scores = rankedRoutes.map(r => r.score);
    const providerDistribution = rankedRoutes.reduce((acc, route) => {
      acc[route.provider] = (acc[route.provider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRoutes: rankedRoutes.length,
      averageScore: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      bestScore: Math.max(...scores),
      scoreRange: {
        min: Math.min(...scores),
        max: Math.max(...scores),
      },
      providerDistribution,
    };
  }

  /**
   * Update default ranking criteria
   */
  updateDefaultCriteria(criteria: Partial<RankingCriteria>) {
    this.defaultCriteria = { ...this.defaultCriteria, ...criteria };
  }

  /**
   * Get current default criteria
   */
  getDefaultCriteria(): RankingCriteria {
    return { ...this.defaultCriteria };
  }
}

// Export singleton instance
export const routeRanker = RouteRanker.getInstance();
