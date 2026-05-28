import * as crypto from 'crypto';

export interface StellarFeeRecord {
  id: string;
  timestamp: Date;
  routeId: string;
  networkFee: string;
  totalFeeUsd: number;
}

export interface FeeTrendInsight {
  routeId: string;
  periodDays: number;
  averageFeeUsd: number;
  highestFeeUsd: number;
  lowestFeeUsd: number;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  percentageChange: number;
}

export class StellarFeeTrendAnalyzer {
  private records: StellarFeeRecord[] = [];

  /**
   * Records a new fee data point.
   */
  recordFee(data: Omit<StellarFeeRecord, 'id' | 'timestamp'> & { timestamp?: Date }): StellarFeeRecord {
    const record: StellarFeeRecord = {
      id: crypto.randomUUID(),
      timestamp: data.timestamp || new Date(),
      routeId: data.routeId,
      networkFee: data.networkFee,
      totalFeeUsd: data.totalFeeUsd,
    };
    this.records.push(record);
    return record;
  }

  /**
   * Retrieves all stored records.
   */
  getAllRecords(): StellarFeeRecord[] {
    return this.records;
  }

  /**
   * Clears the stored records (useful for testing).
   */
  clearRecords(): void {
    this.records = [];
  }

  /**
   * Generates insights based on historical fee data over a given number of days.
   */
  getFeeInsights(routeId: string, days: number = 7): FeeTrendInsight | null {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Filter records for the specific route and time period, sorted chronologically
    const filteredRecords = this.records
      .filter((record) => record.routeId === routeId && record.timestamp >= cutoffDate)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (filteredRecords.length === 0) {
      return null;
    }

    let sum = 0;
    let highest = filteredRecords[0].totalFeeUsd;
    let lowest = filteredRecords[0].totalFeeUsd;

    for (const record of filteredRecords) {
      sum += record.totalFeeUsd;
      if (record.totalFeeUsd > highest) highest = record.totalFeeUsd;
      if (record.totalFeeUsd < lowest) lowest = record.totalFeeUsd;
    }

    const average = sum / filteredRecords.length;

    // To determine trend, compare the first half of the dataset average with the second half average
    let trendDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';
    let percentageChange = 0;

    if (filteredRecords.length > 1) {
      const midPoint = Math.floor(filteredRecords.length / 2);
      
      const firstHalf = filteredRecords.slice(0, midPoint);
      const secondHalf = filteredRecords.slice(midPoint);

      const firstHalfAvg = firstHalf.reduce((acc, curr) => acc + curr.totalFeeUsd, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((acc, curr) => acc + curr.totalFeeUsd, 0) / secondHalf.length;

      const difference = secondHalfAvg - firstHalfAvg;
      
      // Calculate percentage change relative to the first half
      if (firstHalfAvg > 0) {
        percentageChange = (difference / firstHalfAvg) * 100;
      }

      // Allow a small threshold (e.g. 1%) to be considered "stable"
      if (percentageChange > 1) {
        trendDirection = 'increasing';
      } else if (percentageChange < -1) {
        trendDirection = 'decreasing';
      }
    }

    return {
      routeId,
      periodDays: days,
      averageFeeUsd: Number(average.toFixed(4)),
      highestFeeUsd: Number(highest.toFixed(4)),
      lowestFeeUsd: Number(lowest.toFixed(4)),
      trendDirection,
      percentageChange: Number(percentageChange.toFixed(2)),
    };
  }
}
