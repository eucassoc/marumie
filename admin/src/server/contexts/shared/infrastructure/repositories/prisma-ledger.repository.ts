import "server-only";

import type { PrismaClient } from "@prisma/client";
import { isLedgerTransactionType } from "@/shared/ledger/ledger";
import type {
  ILedgerRepository,
  LedgerOrganizationTransactions,
} from "@/server/contexts/shared/domain/repositories/ledger-repository.interface";

/** 記録への追記を直列にするアドバイザリロックの番号（この用途だけで使う任意の値） */
const LEDGER_LOCK_KEY = 760_613;

export class PrismaLedgerRepository implements ILedgerRepository {
  constructor(private prisma: PrismaClient) {}

  async findPublicTransactions(): Promise<LedgerOrganizationTransactions[]> {
    const organizations = await this.prisma.politicalOrganization.findMany({
      select: {
        slug: true,
        transactions: {
          where: { transactionType: { in: ["income", "expense"] } },
          select: {
            financialYear: true,
            transactionNo: true,
            transactionDate: true,
            transactionType: true,
            debitAccount: true,
            debitAmount: true,
            creditAccount: true,
            creditAmount: true,
            friendlyCategory: true,
            label: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return organizations.map((org) => ({
      slug: org.slug,
      transactions: org.transactions
        .filter((t) => isLedgerTransactionType(t.transactionType))
        .map((t) => ({
          financial_year: t.financialYear,
          transaction_no: t.transactionNo,
          transaction_date: t.transactionDate,
          transaction_type: t.transactionType,
          debit_account: t.debitAccount,
          debit_amount: Number(t.debitAmount),
          credit_account: t.creditAccount,
          credit_amount: Number(t.creditAmount),
          friendly_category: t.friendlyCategory ?? "",
          label: t.label,
        })),
    }));
  }

  async append(build: (lines: string[]) => string[]): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_KEY})`;
      const existing = await tx.ledgerRecord.findMany({
        orderBy: { seq: "asc" },
        select: { line: true },
      });
      const lines = existing.map((r) => r.line);
      const added = build(lines);
      if (added.length > 0) {
        await tx.ledgerRecord.createMany({
          data: added.map((line, i) => ({ seq: lines.length + i, line })),
        });
      }
      return added;
    });
  }
}
