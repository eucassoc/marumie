import "server-only";
import { loadLedgerChain } from "@/server/contexts/public-finance/presentation/loaders/load-ledger";

export const dynamic = "force-dynamic";

/** いちばん新しいチェックポイント（運営者の署名と連署サーバーの連署がついた署名付きノート） */
export async function GET() {
  const { checkpoint } = await loadLedgerChain();
  if (checkpoint === null) {
    return new Response("no checkpoint yet\n", { status: 404 });
  }
  return new Response(checkpoint, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
