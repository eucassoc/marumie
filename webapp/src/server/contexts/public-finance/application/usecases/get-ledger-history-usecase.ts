import "server-only";

import { type LedgerEntry, parseLedgerLine } from "@/shared/ledger/ledger";
import {
  type LedgerCheckpointSummary,
  summarizeLedgerCheckpoint,
} from "@/server/contexts/public-finance/domain/models/ledger-checkpoint";
import type { ILedgerRepository } from "@/server/contexts/public-finance/domain/repositories/ledger-repository.interface";

export interface GetLedgerHistoryParams {
  slug: string;
  financialYear: number;
}

interface LedgerHistory {
  /** 記録全体の件数（ほかの団体・年度の分を含む） */
  totalRecords: number;
  /** この団体・年度の出来事。新しい順 */
  entries: LedgerEntry[];
  checkpoint: (LedgerCheckpointSummary & { createdAt: Date }) | null;
}

/** 公開ページに出す「この団体・年度の取引がいつ追加・修正・削除されたか」を記録から読む */
export class GetLedgerHistoryUsecase {
  constructor(private ledgerRepository: ILedgerRepository) {}

  async execute(params: GetLedgerHistoryParams): Promise<LedgerHistory> {
    const [lines, checkpointRow] = await Promise.all([
      this.ledgerRepository.readLines(),
      this.ledgerRepository.findLatestCheckpoint(),
    ]);

    const year = String(params.financialYear);
    const entries = lines
      .map(parseLedgerLine)
      .filter((entry) => entry.org === params.slug && entry.year === year)
      .reverse();

    const summary = checkpointRow ? summarizeLedgerCheckpoint(checkpointRow.note) : null;

    return {
      totalRecords: lines.length,
      entries,
      checkpoint:
        summary && checkpointRow ? { ...summary, createdAt: checkpointRow.createdAt } : null,
    };
  }
}
