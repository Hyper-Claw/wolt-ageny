# --- build stage: compile deps (better-sqlite3 native module) ---
FROM node:22-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# --- runtime stage: slim image with just what we need ---
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app .
# SQLite ledger lives here; mounted as a volume in compose
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
