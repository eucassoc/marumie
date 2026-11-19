import "server-only";
import { loadLedgerChain } from "@/server/contexts/public-finance/presentation/loaders/load-ledger";

export const dynamic = "force-dynamic";

/** 記録そのもの（deedlog のチェーン、JSON Lines）。dlog verify にそのまま渡せる */
export async function GET() {
  const { chain } = await loadLedgerChain();
  return new Response(chain, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
