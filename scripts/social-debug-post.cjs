#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) {
      continue;
    }

    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const repoRoot = path.resolve(__dirname, '..');
for (const envName of ['.env', '.env.production', '.env.local']) {
  const envPath = path.join(repoRoot, envName);
  if (fs.existsSync(envPath)) {
    loadEnvFile(envPath);
  }
}

const target = process.argv[2];
const limit = Number.parseInt(process.argv[3] ?? '5', 10);

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL.');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    if (target) {
      const postResult = await client.query(
        `
          select id, status, quiz_id, created_at, updated_at, published_at, publer_job_id, last_error,
                 play_url, copy_snapshot, publer_response, quiz_snapshot->>'title' as title
          from social_posts
          where id = $1 or quiz_id = $1
          order by created_at desc
          limit 1
        `,
        [target],
      );

      if (postResult.rows.length === 0) {
        console.error(`No social post found for: ${target}`);
        process.exit(1);
      }

      const post = postResult.rows[0];
      const attemptsResult = await client.query(
        `
          select stage, success, error_message, created_at, request_payload, response_payload
          from social_post_attempts
          where social_post_id = $1
          order by created_at asc
        `,
        [post.id],
      );

      console.log(JSON.stringify({ post, attempts: attemptsResult.rows }, null, 2));
      return;
    }

    const recentResult = await client.query(
      `
        select id, status, quiz_id, created_at, updated_at, published_at, publer_job_id, last_error,
               play_url, quiz_snapshot->>'title' as title
        from social_posts
        order by created_at desc
        limit $1
      `,
      [Number.isFinite(limit) ? limit : 5],
    );

    console.log(JSON.stringify({ recent: recentResult.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
