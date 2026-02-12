-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."agents" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "role_cn" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "current_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "resource_inventory" JSONB NOT NULL DEFAULT '{}',
    "system_prompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "influence" INTEGER NOT NULL DEFAULT 50,
    "is_sanctioned" BOOLEAN NOT NULL DEFAULT false,
    "sanction_rounds" INTEGER NOT NULL DEFAULT 0,
    "satisfaction" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "secondme_session_id" TEXT,
    "title" TEXT,
    "last_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."council_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "internal_state" JSONB,

    CONSTRAINT "council_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."council_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "chair_agent_id" TEXT,
    "round_number" INTEGER NOT NULL DEFAULT 0,
    "trigger" TEXT,
    "final_verdict" JSONB,
    "resource_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "schedule_output" JSONB,
    "user_profile_snapshot" JSONB,
    "completed_at" TIMESTAMP(6),
    "result_card" JSONB,

    CONSTRAINT "council_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."council_votes" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "council_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."life_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_cn" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weight_matrix" JSONB NOT NULL,
    "exchange_rates" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notes" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "secondme_note_id" INTEGER,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transactions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "proposer_id" TEXT NOT NULL,
    "responder_id" TEXT,
    "method" TEXT NOT NULL,
    "action_type" TEXT,
    "description" TEXT NOT NULL,
    "resource_delta" JSONB NOT NULL,
    "condition" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rationale" TEXT,
    "round_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "secondme_user_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatar_url" TEXT,
    "route" TEXT,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "energy_level" INTEGER DEFAULT 80,
    "mbti_type" TEXT,
    "mood_state" TEXT DEFAULT 'flow',
    "profession" TEXT,
    "profession_category" TEXT,
    "rigidity_coefficient" DOUBLE PRECISION DEFAULT 0.5,
    "ubl_max_work_hours" DOUBLE PRECISION DEFAULT 2.0,
    "ubl_min_budget" DOUBLE PRECISION DEFAULT 500,
    "ubl_sleep_hours" DOUBLE PRECISION DEFAULT 8.0,
    "ubl_social_minutes" INTEGER DEFAULT 60,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_secondme_user_id_key" ON "public"."users"("secondme_user_id" ASC);

-- AddForeignKey
ALTER TABLE "public"."chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."council_logs" ADD CONSTRAINT "council_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."council_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."council_sessions" ADD CONSTRAINT "council_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."council_votes" ADD CONSTRAINT "council_votes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."council_votes" ADD CONSTRAINT "council_votes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."council_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_proposer_id_fkey" FOREIGN KEY ("proposer_id") REFERENCES "public"."agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_responder_id_fkey" FOREIGN KEY ("responder_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."council_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
