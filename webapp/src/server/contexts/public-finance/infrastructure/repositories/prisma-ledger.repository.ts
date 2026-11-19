import "server-only";
import type { PrismaClient } from "@prisma/client";
import type {
  ILedgerRepository,
  LedgerCheckpointRow,
} from "@/server/contexts/public-finance/domain/repositories/ledger-repository.interface";

export class PrismaLedgerRepository implements ILedgerRepository {
  constructor(private prisma: PrismaClient) {}

  async readLines(): Promise<string[]> {
    const records = await this.prisma.ledgerRecord.findMany({
      orderBy: { seq: "asc" },
      select: { line: true },
    });
    return records.map((r) => r.line);
  }

  async findLatestCheckpoint(): Promise<LedgerCheckpointRow | null> {
    const checkpoint = await this.prisma.ledgerCheckpoint.findFirst({
      orderBy: [{ size: "desc" }, { id: "desc" }],
      select: { size: true, note: true, createdAt: true },
    });
    return checkpoint;
  }
}
