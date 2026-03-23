FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=BUILD_ENV \
    node -e "const fs=require('fs'); const dotenv=require('dotenv'); const {spawnSync}=require('child_process'); const parsed=dotenv.parse(fs.readFileSync('/run/secrets/BUILD_ENV')); const result=spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, ...parsed } }); process.exit(result.status ?? 1)"

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "server.js"]
