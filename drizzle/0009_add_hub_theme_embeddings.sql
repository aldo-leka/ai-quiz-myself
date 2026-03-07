CREATE TABLE IF NOT EXISTS "hub_theme_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "quiz_id" uuid NOT NULL,
  "theme" text NOT NULL,
  "theme_key" text NOT NULL,
  "game_mode" "quiz_game_mode" NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "hub_theme_embeddings"
    ADD CONSTRAINT "hub_theme_embeddings_quiz_id_quizzes_id_fk"
    FOREIGN KEY ("quiz_id")
    REFERENCES "public"."quizzes"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "hub_theme_embeddings_quiz_id_uq" ON "hub_theme_embeddings" USING btree ("quiz_id");
CREATE INDEX IF NOT EXISTS "hub_theme_embeddings_game_mode_idx" ON "hub_theme_embeddings" USING btree ("game_mode");
CREATE INDEX IF NOT EXISTS "hub_theme_embeddings_theme_key_idx" ON "hub_theme_embeddings" USING btree ("theme_key");
CREATE INDEX IF NOT EXISTS "hub_theme_embeddings_embedding_hnsw_idx"
  ON "hub_theme_embeddings"
  USING hnsw ("embedding" vector_cosine_ops);
