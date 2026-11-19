-- CreateTable
CREATE TABLE "ledger_records" (
    "seq" INTEGER NOT NULL,
    "line" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_records_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "ledger_checkpoints" (
    "id" BIGSERIAL NOT NULL,
    "size" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_checkpoints_size_idx" ON "ledger_checkpoints"("size");
