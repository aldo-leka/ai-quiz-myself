#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/root/ai-quiz-myself"
IMAGE_TAG="${1:-latest}"

cd "$REPO_DIR"
git pull --ff-only
IMAGE_TAG="$IMAGE_TAG" docker compose pull app
IMAGE_TAG="$IMAGE_TAG" docker compose up -d app
