-- AlterTable
ALTER TABLE "council_sessions" ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "credit_score" INTEGER DEFAULT 100,
ADD COLUMN     "daily_budget_cap" DOUBLE PRECISION DEFAULT 500,
ADD COLUMN     "hourly_wage" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "token_balance" DOUBLE PRECISION DEFAULT 500;
