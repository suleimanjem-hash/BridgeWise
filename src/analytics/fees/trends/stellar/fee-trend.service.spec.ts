import { StellarFeeTrendAnalyzer } from './fee-trend.service';

describe('StellarFeeTrendAnalyzer', () => {
  let analyzer: StellarFeeTrendAnalyzer;

  beforeEach(() => {
    analyzer = new StellarFeeTrendAnalyzer();
  });

  it('should store fee records successfully', () => {
    const record = analyzer.recordFee({
      routeId: 'XLM-USDC',
      networkFee: '100',
      totalFeeUsd: 0.05,
    });

    expect(record).toHaveProperty('id');
    expect(record.routeId).toBe('XLM-USDC');
    expect(analyzer.getAllRecords().length).toBe(1);
  });

  it('should return null insights if no data is found for the route', () => {
    const insights = analyzer.getFeeInsights('XLM-USDC', 7);
    expect(insights).toBeNull();
  });

  it('should calculate basic averages, highest, and lowest fees accurately', () => {
    const now = new Date();
    
    // Day 1
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.10, timestamp: new Date(now.getTime() - 3 * 86400000) });
    // Day 2
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.30, timestamp: new Date(now.getTime() - 2 * 86400000) });
    // Day 3
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.20, timestamp: new Date(now.getTime() - 1 * 86400000) });

    const insights = analyzer.getFeeInsights('XLM-USDC', 7);
    
    expect(insights).not.toBeNull();
    expect(insights?.averageFeeUsd).toBeCloseTo(0.20);
    expect(insights?.highestFeeUsd).toBeCloseTo(0.30);
    expect(insights?.lowestFeeUsd).toBeCloseTo(0.10);
  });

  it('should detect an increasing fee trend', () => {
    const now = new Date();
    
    // First half (lower fees)
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.05, timestamp: new Date(now.getTime() - 4 * 86400000) });
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.05, timestamp: new Date(now.getTime() - 3 * 86400000) });
    
    // Second half (higher fees)
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.10, timestamp: new Date(now.getTime() - 2 * 86400000) });
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.15, timestamp: new Date(now.getTime() - 1 * 86400000) });

    const insights = analyzer.getFeeInsights('XLM-USDC', 7);
    
    expect(insights?.trendDirection).toBe('increasing');
    expect(insights?.percentageChange).toBeGreaterThan(0);
  });

  it('should detect a decreasing fee trend', () => {
    const now = new Date();
    
    // First half (higher fees)
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.50, timestamp: new Date(now.getTime() - 4 * 86400000) });
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.50, timestamp: new Date(now.getTime() - 3 * 86400000) });
    
    // Second half (lower fees)
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.20, timestamp: new Date(now.getTime() - 2 * 86400000) });
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.10, timestamp: new Date(now.getTime() - 1 * 86400000) });

    const insights = analyzer.getFeeInsights('XLM-USDC', 7);
    
    expect(insights?.trendDirection).toBe('decreasing');
    expect(insights?.percentageChange).toBeLessThan(0);
  });

  it('should detect a stable fee trend', () => {
    const now = new Date();
    
    // Stable fees (very small variance)
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.100, timestamp: new Date(now.getTime() - 4 * 86400000) });
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.100, timestamp: new Date(now.getTime() - 3 * 86400000) });
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.100, timestamp: new Date(now.getTime() - 2 * 86400000) });
    analyzer.recordFee({ routeId: 'XLM-USDC', networkFee: '100', totalFeeUsd: 0.100, timestamp: new Date(now.getTime() - 1 * 86400000) });

    const insights = analyzer.getFeeInsights('XLM-USDC', 7);
    
    expect(insights?.trendDirection).toBe('stable');
    expect(insights?.percentageChange).toBe(0);
  });
});
