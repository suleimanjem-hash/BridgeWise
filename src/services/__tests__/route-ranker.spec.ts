import { routeRanker } from '../route-ranker';
import { stellarRouteHealthMonitor } from '../../monitoring/routes/stellar';
import type { BridgeRoute } from '../route-ranker';

describe('RouteRanker network-aware scoring', () => {
  afterEach(() => {
    stellarRouteHealthMonitor.reset();
  });

  const baseRoute = (id: string, networkMetrics?: Record<string, unknown>): BridgeRoute => ({
    id,
    fromChain: 'stellar',
    toChain: 'ethereum',
    fromToken: 'XLM',
    toToken: 'ETH',
    amount: '100',
    fee: { amount: '0.0001', token: 'XLM', usdValue: 0.2 },
    estimatedTime: 5,
    successRate: 0.98,
    provider: 'stellar',
    gasEstimate: { amount: '0', token: 'XLM', usdValue: 0 },
    slippage: 0.5,
    minAmount: '1',
    maxAmount: '1000000',
    requiresApproval: false,
    confidence: 0.9,
    networkMetrics: networkMetrics as any,
  });

  it('orders Stellar routes by dynamic network conditions when other metrics are tied', () => {
    const routes: BridgeRoute[] = [
      baseRoute('route-fast', {
        latencyMs: 120,
        failureRate: 0.02,
        liquidityUsd: 9000,
        availability: 0.98,
        activeRouteCount: 2,
      }),
      baseRoute('route-slow', {
        latencyMs: 900,
        failureRate: 0.12,
        liquidityUsd: 1500,
        availability: 0.72,
        activeRouteCount: 7,
      }),
    ];

    const ranked = routeRanker.rankRoutes(routes);

    expect(ranked[0].id).toBe('route-fast');
    expect(ranked[0].breakdown.networkScore).toBeGreaterThan(ranked[1].breakdown.networkScore);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('falls back to a neutral network score when no live metrics exist', () => {
    const routes: BridgeRoute[] = [
      baseRoute('route-a'),
      baseRoute('route-b'),
    ];

    const ranked = routeRanker.rankRoutes(routes);

    expect(ranked[0].breakdown.networkScore).toBe(0.5);
    expect(ranked[1].breakdown.networkScore).toBe(0.5);
  });

  it('does not recommend routes disabled by Stellar route health monitoring', async () => {
    stellarRouteHealthMonitor.registerRoute('route-unavailable', async () => ({
      available: false,
      errorMessage: 'probe failed',
    }));

    await stellarRouteHealthMonitor.checkAll();
    await stellarRouteHealthMonitor.checkAll();
    await stellarRouteHealthMonitor.checkAll();

    const routes: BridgeRoute[] = [
      baseRoute('route-unavailable'),
      baseRoute('route-healthy', {
        latencyMs: 100,
        failureRate: 0.01,
        liquidityUsd: 5000,
        availability: 0.98,
        activeRouteCount: 1,
      }),
    ];

    const ranked = routeRanker.rankRoutes(routes);
    expect(ranked.map((route) => route.id)).not.toContain('route-unavailable');
  });
});
