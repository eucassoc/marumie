#!/usr/bin/env bash
# 公開データの「更新の記録」を、4 つの場面で通して見せるデモ。
#
# 前提: ローカルの Supabase、webapp（:3000）、admin（:3001）が動いていて、admin/.env.local に
# LEDGER_CHAIN=marumie.example/ledger があること。dlog（https://github.com/eucassoc/deedlog）が PATH にあること。
# 手順は docs/old/20261119_1500_公開データの更新の記録_deedlog連携デモ.md を参照。
#
#   scripts/ledger/demo/run.sh [作業ディレクトリ]
#
# 登場する政治団体・取引はすべて架空（シードの「サンプル党」と、このデモが取り込む 2026 年の 4 件）。
set -u
cd "$(dirname "$0")/../../.."
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK/shots" "$WORK/kept"
URL="${WEBAPP_URL:-http://localhost:3000}"
ORG=sample-party
YEAR=2026
DEMO="scripts/ledger/demo"
E2E="admin/e2e/ledger-demo" # 画面を操作するもの（Playwright は admin の依存にある）
psql_() { docker exec -i supabase_db_marumie psql -U postgres -q -At -c "$1"; }
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
run() { printf '$ %s\n' "$*"; "$@"; local code=$?; [ $code -ne 0 ] && printf '（終了コード %s）\n' "$code"; return 0; }
verify() { run node scripts/ledger/verify.mjs --url "$URL" --org $ORG --year $YEAR --key "$WORK/operator.vkey" --witness "$WORK/witness.vkey"; }

say "準備: 記録と 2026 年の取引を空にし、運営者と連署サーバーの鍵を作る"
psql_ "delete from ledger_checkpoints; delete from ledger_records; delete from transactions where financial_year = $YEAR"
rm -f "$WORK"/operator.* "$WORK"/witness.*
dlog keygen -name marumie.example/ledger -out "$WORK/operator"
dlog keygen -witness -name witness.example -out "$WORK/witness"
pkill -f "dlog witness .*-listen 127.0.0.1:8090" 2>/dev/null; sleep 0.5
dlog witness -key "$WORK/witness.key" -log "$WORK/operator.vkey" -state "$WORK/witness.state" -listen 127.0.0.1:8090 >"$WORK/witness.log" 2>&1 &
WITNESS_PID=$!
trap 'kill $WITNESS_PID 2>/dev/null' EXIT
sleep 1
export LEDGER_OPERATOR_KEY="$WORK/operator.key" LEDGER_OPERATOR_VKEY="$WORK/operator.vkey"
export LEDGER_WITNESSES="$WORK/witness.vkey=http://127.0.0.1:8090"

say "場面 1: 会計ソフトの CSV を管理画面から取り込む。取引の追加が記録に載り、連署を受ける"
run node $E2E/admin-import.cjs $YEAR $DEMO/import-1.csv "$WORK/shots/1-admin.png"
run node scripts/ledger/anchor.mjs
verify
node $E2E/shot-public.cjs $ORG $YEAR "$WORK/shots/1-public.png"
# 第三者が、このときの記録とチェックポイントを控えておく
curl -sS "$URL/ledger/chain.jsonl" >"$WORK/kept/chain-1.jsonl"
curl -sS "$URL/ledger/checkpoint" >"$WORK/kept/checkpoint-1"

say "場面 2: 公開後に家賃を 80,000 円から 85,000 円に直して取り込み直す。「修正」として記録に残る"
run node $E2E/admin-import.cjs $YEAR $DEMO/import-2.csv "$WORK/shots/2-admin.png"
run node scripts/ledger/anchor.mjs
verify
node $E2E/shot-public.cjs $ORG $YEAR "$WORK/shots/2-public.png"
curl -sS "$URL/ledger/chain.jsonl" >"$WORK/kept/chain-2.jsonl"
curl -sS "$URL/ledger/checkpoint" >"$WORK/kept/checkpoint-2"

say "場面 3: 管理画面を通さず、データベースの金額を直接 12,000 円から 2,000 円に書き換える。公開データが記録と食い違う"
psql_ "update transactions set debit_amount = 2000, credit_amount = 2000 where financial_year = $YEAR and transaction_no = '7003'"
verify
psql_ "update transactions set debit_amount = 12000, credit_amount = 12000 where financial_year = $YEAR and transaction_no = '7003'"

say "場面 4: 家賃を直した事実そのものを消すため、記録を作り直す。連署サーバーは連署せず、検証も通らない"
run node $DEMO/rewrite-history.mjs $ORG $YEAR 7002
verify
run node scripts/ledger/anchor.mjs
node $E2E/shot-public.cjs $ORG $YEAR "$WORK/shots/4-public.png"

say "場面 4 の続き: 運営者が作り直した記録に自分で署名すると、控えを持つ人は運営者の公開鍵だけで不正を証明できる"
curl -sS "$URL/ledger/chain.jsonl" >"$WORK/kept/chain-rewritten.jsonl"
dlog checkpoint -key "$WORK/operator.key" "$WORK/kept/chain-rewritten.jsonl" >"$WORK/kept/checkpoint-rewritten"
dlog misbehavior build -key "$WORK/operator.vkey" "$WORK/kept/chain-2.jsonl" "$WORK/kept/checkpoint-2" \
  "$WORK/kept/chain-rewritten.jsonl" "$WORK/kept/checkpoint-rewritten" >"$WORK/kept/misbehavior.json"
run dlog misbehavior check -key "$WORK/operator.vkey" "$WORK/kept/misbehavior.json"

say "デモの出力は $WORK にあります（shots/ に画面、kept/ に第三者の控えと不正の証明）"
