import {
  stellarTransactionMetadataIndexer,
  StellarTransactionMetadataRecord,
} from '../stellar-transaction-metadata-indexer';

describe('StellarTransactionMetadataIndexer', () => {
  beforeEach(() => {
    stellarTransactionMetadataIndexer.clear();
  });

  it('stores and retrieves indexed metadata by transaction ID', () => {
    const record: Omit<StellarTransactionMetadataRecord, 'timestamp'> = {
      transactionId: 'tx-1',
      txHash: 'hash-1',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      bridgeName: 'stellar-soroban',
      status: 'confirmed',
      assetSymbol: 'XLM',
      amount: '100',
      metadata: {
        memo: 'test-bridge',
        ledger: 12345,
      },
    };

    const stored = stellarTransactionMetadataIndexer.storeMetadata(record);
    expect(stored.transactionId).toBe('tx-1');
    expect(stored.timestamp).toBeGreaterThan(0);

    const fetched = stellarTransactionMetadataIndexer.getMetadata('tx-1');
    expect(fetched).toEqual(stored);
  });

  it('supports filtered queries by source/destination chain and bridge name', () => {
    stellarTransactionMetadataIndexer.bulkStoreMetadata([
      {
        transactionId: 'tx-1',
        txHash: 'hash-1',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        bridgeName: 'stellar-soroban',
        status: 'confirmed',
        assetSymbol: 'XLM',
        amount: '100',
        metadata: { memo: 'one' },
        timestamp: 1000,
      },
      {
        transactionId: 'tx-2',
        txHash: 'hash-2',
        sourceChain: 'stellar',
        destinationChain: 'base',
        bridgeName: 'stellar-soroban',
        status: 'pending',
        assetSymbol: 'XLM',
        amount: '25',
        metadata: { memo: 'two' },
        timestamp: 2000,
      },
    ]);

    const result = stellarTransactionMetadataIndexer.queryMetadata({
      destinationChain: 'ethereum',
      bridgeName: 'stellar-soroban',
    });

    expect(result.total).toBe(1);
    expect(result.items[0].transactionId).toBe('tx-1');
  });

  it('filters by metadata contents and timestamp ranges', () => {
    stellarTransactionMetadataIndexer.bulkStoreMetadata([
      {
        transactionId: 'tx-3',
        txHash: 'hash-3',
        sourceChain: 'stellar',
        destinationChain: 'base',
        bridgeName: 'stellar-soroban',
        status: 'failed',
        assetSymbol: 'XLM',
        amount: '50',
        metadata: { memo: 'fail', network: 'public' },
        timestamp: 3000,
      },
      {
        transactionId: 'tx-4',
        txHash: 'hash-4',
        sourceChain: 'stellar',
        destinationChain: 'ether',
        bridgeName: 'stellar-soroban',
        status: 'confirmed',
        assetSymbol: 'XLM',
        amount: '80',
        metadata: { memo: 'pass', network: 'public' },
        timestamp: 4000,
      },
    ]);

    const result = stellarTransactionMetadataIndexer.queryMetadata(
      {
        metadataContains: { network: 'public' },
        minTimestamp: 2500,
        maxTimestamp: 3500,
      },
      { sortBy: 'timestamp', order: 'asc' },
    );

    expect(result.total).toBe(1);
    expect(result.items[0].transactionId).toBe('tx-3');
  });
});
