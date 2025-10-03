-- Quizzes table for caching pre-generated quizzes
CREATE TABLE IF NOT EXISTS quizzes (
    id SERIAL PRIMARY KEY,
    questions JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster random selection
CREATE INDEX IF NOT EXISTS idx_quizzes_created_at ON quizzes(created_at);