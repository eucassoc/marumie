import "server-only";

import { prisma } from "@/server/contexts/public-finance/infrastructure/prisma";
import { PrismaLedgerRepository } from "@/server/contexts/public-finance/infrastructure/repositories/prisma-ledger.repository";
import { PrismaPoliticalOrganizationRepository } from "@/server/contexts/public-finance/infrastructure/repositories/prisma-political-organization.repository";
import { PrismaTransactionRepository } from "@/server/contexts/public-finance/infrastructure/repositories/prisma-transaction.repository";
import { GetLedgerChainUsecase } from "@/server/contexts/public-finance/application/usecases/get-ledger-chain-usecase";
import {
  type GetLedgerExportParams,
  GetLedgerExportUsecase,
} from "@/server/contexts/public-finance/application/usecases/get-ledger-export-usecase";
import {
  type GetLedgerHistoryParams,
  GetLedgerHistoryUsecase,
} from "@/server/contexts/public-finance/application/usecases/get-ledger-history-usecase";

// 記録は「いま公開しているもの」と突き合わせて確かめるためのものなので、キャッシュを挟まず毎回読む。
// キャッシュ越しに古い記録や古い取引を返すと、正しい記録が食い違って見える。

export async function loadLedgerHistory(params: GetLedgerHistoryParams) {
  return new GetLedgerHistoryUsecase(new PrismaLedgerRepository(prisma)).execute(params);
}

export async function loadLedgerExport(params: GetLedgerExportParams) {
  return new GetLedgerExportUsecase(
    new PrismaTransactionRepository(prisma),
    new PrismaPoliticalOrganizationRepository(prisma),
  ).execute(params);
}

export async function loadLedgerChain() {
  return new GetLedgerChainUsecase(new PrismaLedgerRepository(prisma)).execute();
}
