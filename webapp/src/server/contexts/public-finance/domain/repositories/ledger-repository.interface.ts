export interface LedgerCheckpointRow {
  size: number;
  note: string;
  createdAt: Date;
}

export interface ILedgerRepository {
  /** 記録の全行を先頭から */
  readLines(): Promise<string[]>;
  /** いちばん新しいチェックポイント（署名付きノートの本文） */
  findLatestCheckpoint(): Promise<LedgerCheckpointRow | null>;
}
