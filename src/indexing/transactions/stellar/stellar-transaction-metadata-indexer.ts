export interface StellarTransactionMetadataRecord {
  transactionId: string;
  txHash: string;
  sourceChain: string;
  destinationChain: string;
  bridgeName: string;
  status: string;
  assetSymbol: string;
  amount: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface StellarTransactionMetadataFilter {
  transactionId?: string;
  txHash?: string;
  sourceChain?: string;
  destinationChain?: string;
  bridgeName?: string;
  status?: string;
  assetSymbol?: string;
  minTimestamp?: number;
  maxTimestamp?: number;
  metadataContains?: Record<string, unknown>;
}

export interface StellarTransactionMetadataQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp';
  order?: 'asc' | 'desc';
}

export interface StellarTransactionMetadataQueryResult {
  total: number;
  items: StellarTransactionMetadataRecord[];
}

export class StellarTransactionMetadataIndexer {
  private readonly records = new Map<string, StellarTransactionMetadataRecord>();
  private readonly insertionOrder: string[] = [];

  storeMetadata(record: Omit<StellarTransactionMetadataRecord, 'timestamp'> & {
    timestamp?: number;
  }): StellarTransactionMetadataRecord {
    const timestamp = record.timestamp ?? Date.now();
    const storedRecord: StellarTransactionMetadataRecord = {
      ...record,
      timestamp,
      metadata: record.metadata ?? {},
    };

    const exists = this.records.has(record.transactionId);
    this.records.set(record.transactionId, storedRecord);

    if (!exists) {
      this.insertionOrder.push(record.transactionId);
    }

    return storedRecord;
  }

  bulkStoreMetadata(
    records: Array<
      Omit<StellarTransactionMetadataRecord, 'timestamp'> & { timestamp?: number }
    >,
  ): StellarTransactionMetadataRecord[] {
    return records.map((record) => this.storeMetadata(record));
  }

  getMetadata(transactionId: string): StellarTransactionMetadataRecord | null {
    return this.records.get(transactionId) ?? null;
  }

  hasMetadata(transactionId: string): boolean {
    return this.records.has(transactionId);
  }

  removeMetadata(transactionId: string): boolean {
    const removed = this.records.delete(transactionId);
    if (removed) {
      const index = this.insertionOrder.indexOf(transactionId);
      if (index !== -1) {
        this.insertionOrder.splice(index, 1);
      }
    }
    return removed;
  }

  clear(): void {
    this.records.clear();
    this.insertionOrder.length = 0;
  }

  queryMetadata(
    filter: StellarTransactionMetadataFilter = {},
    options: StellarTransactionMetadataQueryOptions = {},
  ): StellarTransactionMetadataQueryResult {
    const entries = this.insertionOrder
      .map((transactionId) => this.records.get(transactionId))
      .filter((item): item is StellarTransactionMetadataRecord => Boolean(item));

    const filtered = entries.filter((record) => this.matchesFilter(record, filter));

    const sorted = filtered.slice().sort((left, right) => {
      const order = options.order === 'asc' ? 1 : -1;
      if (options.sortBy === 'timestamp') {
        return order * (left.timestamp - right.timestamp);
      }
      return order * (left.timestamp - right.timestamp);
    });

    const offset = Math.max(0, options.offset ?? 0);
    const limit = options.limit != null ? Math.max(0, options.limit) : sorted.length;
    const items = sorted.slice(offset, offset + limit);

    return {
      total: filtered.length,
      items,
    };
  }

  private matchesFilter(
    record: StellarTransactionMetadataRecord,
    filter: StellarTransactionMetadataFilter,
  ): boolean {
    if (filter.transactionId && record.transactionId !== filter.transactionId) {
      return false;
    }
    if (filter.txHash && record.txHash !== filter.txHash) {
      return false;
    }
    if (filter.sourceChain && record.sourceChain !== filter.sourceChain) {
      return false;
    }
    if (filter.destinationChain && record.destinationChain !== filter.destinationChain) {
      return false;
    }
    if (filter.bridgeName && record.bridgeName !== filter.bridgeName) {
      return false;
    }
    if (filter.status && record.status !== filter.status) {
      return false;
    }
    if (filter.assetSymbol && record.assetSymbol !== filter.assetSymbol) {
      return false;
    }
    if (filter.minTimestamp != null && record.timestamp < filter.minTimestamp) {
      return false;
    }
    if (filter.maxTimestamp != null && record.timestamp > filter.maxTimestamp) {
      return false;
    }
    if (filter.metadataContains && !this.matchesMetadata(record.metadata, filter.metadataContains)) {
      return false;
    }
    return true;
  }

  private matchesMetadata(
    metadata: Record<string, unknown>,
    filterMetadata: Record<string, unknown>,
  ): boolean {
    return Object.entries(filterMetadata).every(([key, value]) => {
      if (!(key in metadata)) {
        return false;
      }
      return this.deepEqual(metadata[key], value);
    });
  }

  private deepEqual(left: unknown, right: unknown): boolean {
    if (left === right) {
      return true;
    }
    if (typeof left !== typeof right) {
      return false;
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
      if (Array.isArray(left) !== Array.isArray(right)) {
        return false;
      }
      if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) {
          return false;
        }
        return left.every((item, index) => this.deepEqual(item, (right as unknown[])[index]));
      }
      const leftKeys = Object.keys(left as Record<string, unknown>);
      const rightKeys = Object.keys(right as Record<string, unknown>);
      if (leftKeys.length !== rightKeys.length) {
        return false;
      }
      return leftKeys.every((key) => this.deepEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ));
    }
    return false;
  }
}

export const stellarTransactionMetadataIndexer = new StellarTransactionMetadataIndexer();
