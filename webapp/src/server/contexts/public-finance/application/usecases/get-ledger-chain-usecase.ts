import "server-only";

import type { ILedgerRepository } from "@/server/contexts/public-finance/domain/repositories/ledger-repository.interface";

interface LedgerChain {
  /** 記録そのもの（JSON Lines）。1 件もなければ空文字 */
  chain: string;
  /** いちばん新しいチェックポイント。まだなければ null */
  checkpoint: string | null;
}

/** 記録とチェックポイントを、検証する人が受け取るそのままの形で返す */
export class GetLedgerChainUsecase {
  constructor(private ledgerRepository: ILedgerRepository) {}

  async execute(): Promise<LedgerChain> {
    const [lines, checkpoint] = await Promise.all([
      this.ledgerRepository.readLines(),
      this.ledgerRepository.findLatestCheckpoint(),
    ]);
    return {
      chain: lines.length > 0 ? `${lines.join("\n")}\n` : "",
      checkpoint: checkpoint?.note ?? null,
    };
  }
}
