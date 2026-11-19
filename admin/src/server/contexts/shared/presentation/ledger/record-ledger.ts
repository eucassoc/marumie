import "server-only";

import { prisma } from "@/server/contexts/shared/infrastructure/prisma";
import { PrismaLedgerRepository } from "@/server/contexts/shared/infrastructure/repositories/prisma-ledger.repository";
import { SyncLedgerUsecase } from "@/server/contexts/shared/application/usecases/sync-ledger-usecase";

/**
 * 取引を書き換えたあとに呼び、公開データの変更を記録（deedlog のチェーン）に残す。
 *
 * LEDGER_CHAIN が設定されていない環境では何もしない（記録を使わない運用のまま動く）。
 * 取引の保存は確定しているので、記録の失敗は保存の失敗にしない。記録が遅れても、
 * 次に呼ばれたときに公開データとの差がまとめて記録される。
 */
export async function recordLedger(): Promise<void> {
  const chain = process.env.LEDGER_CHAIN;
  if (!chain) return;
  try {
    await new SyncLedgerUsecase(new PrismaLedgerRepository(prisma), chain).execute();
  } catch (error) {
    console.error("Ledger record error:", error);
  }
}
