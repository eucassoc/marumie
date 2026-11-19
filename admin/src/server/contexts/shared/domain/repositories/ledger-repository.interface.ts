import type { LedgerSourceTransaction } from "@/shared/ledger/ledger";

export interface LedgerOrganizationTransactions {
  slug: string;
  transactions: LedgerSourceTransaction[];
}

export interface ILedgerRepository {
  /** 団体ごとに、公開サイトに出る取引（収入・支出）を読む */
  findPublicTransactions(): Promise<LedgerOrganizationTransactions[]>;
  /**
   * 記録に追記する。同時に走る追記が seq を取り合わないよう直列にしたうえで、
   * いまの全行を build に渡し、返ってきた行を末尾に足す。足した行を返す。
   */
  append(build: (lines: string[]) => string[]): Promise<string[]>;
}
