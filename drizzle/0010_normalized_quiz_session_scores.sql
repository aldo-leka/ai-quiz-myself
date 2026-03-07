ALTER TABLE "quiz_sessions"
ADD COLUMN IF NOT EXISTS "normalized_score" real NOT NULL DEFAULT 0;

WITH normalized_scores AS (
  SELECT
    qs.id AS session_id,
    COALESCE(
      LEAST(
        100::numeric,
        GREATEST(
          0::numeric,
          ROUND(
            (
              COUNT(qsa.id) FILTER (WHERE qsa.is_correct)::numeric
              / NULLIF(q.question_count, 0)::numeric
            ) * 100,
            1
          )
        )
      ),
      0::numeric
    ) AS normalized_score
  FROM "quiz_sessions" qs
  INNER JOIN "quizzes" q
    ON q.id = qs.quiz_id
  LEFT JOIN "quiz_session_answers" qsa
    ON qsa.session_id = qs.id
  GROUP BY qs.id, q.question_count
)
UPDATE "quiz_sessions" qs
SET "normalized_score" = normalized_scores.normalized_score::real
FROM normalized_scores
WHERE qs.id = normalized_scores.session_id;
