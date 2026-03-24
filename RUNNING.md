# Running Locally

## Prerequisites

- Node.js 18+
- Docker Desktop (running)

## 1. Install dependencies

```bash
npm install
```

## 2. Start MongoDB

Prisma requires MongoDB to run as a replica set. A plain `mongod` will not work.

```bash
docker run -d -p 27017:27017 --name mongo mongo:7 --replSet rs0
```

Wait 2–3 seconds, then initiate the replica set:

```bash
docker exec mongo mongosh --eval "rs.initiate()"
```

You only need to do this once. On subsequent runs just start the container:

```bash
docker start mongo
```

## 3. Configure environment variables

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

`.env.local` values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | MongoDB connection string — use `mongodb://127.0.0.1:27017/seo-tool` for local |
| `AHREFS_API_KEY` | Bearer token from Ahrefs |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis endpoint (must start with `https://`) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `OWN_DOMAIN` | Your domain without protocol or trailing slash, e.g. `10pearls.com` |

Redis is optional — if not configured the app works without caching.

## 4. Push the database schema

```bash
npx prisma db push
```

## 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stopping MongoDB

```bash
docker stop mongo
```
