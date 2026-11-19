import "server-only";

import { type LedgerPublicTransaction, toLedgerPublicTransaction } from "@/shared/ledger/ledger";
import type { IPoliticalOrganizationRepository } from "@/server/contexts/public-finance/domain/repositories/political-organization-repository.interface";
import type { ITransactionRepository } from "@/server/contexts/public-finance/domain/repositories/transaction-repository.interface";

export interface GetLedgerExportParams {
  slug: string;
  financialYear: number;
}

/**
 * 記録と突き合わせるための、公開中の取引の書き出し。
 * 1 件ごとに、記録のダイジェストの元になる項目だけを、決まった順で出す。
 * 見つからない団体は null（ルートが 404 にする）。
 */
export class GetLedgerExportUsecase {
  constructor(
    private transactionRepository: ITransactionRepository,
    private politicalOrganizationRepository: IPoliticalOrganizationRepository,
  ) {}

  async execute(params: GetLedgerExportParams): Promise<LedgerPublicTransaction[] | null> {
    const organizations = await this.politicalOrganizationRepository.findBySlugs([params.slug]);
    if (organizations.length === 0) return null;

    const transactions = await this.transactionRepository.findAllWithPoliticalOrganizationName({
      political_organization_ids: organizations.map((org) => org.id),
      financial_year: params.financialYear,
    });

    return transactions
      .map((transaction) => toLedgerPublicTransaction(transaction))
      .filter((view): view is LedgerPublicTransaction => view !== null)
      .sort((a, b) => a.no.localeCompare(b.no, "en", { numeric: true }));
  }
}
