This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Running with Docker

[![Docker](https://github.com/francoiseee/Coding-Simulator/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/francoiseee/Coding-Simulator/actions/workflows/docker-publish.yml)
[![codely-web](https://img.shields.io/badge/ghcr.io-codely--web-blue?logo=docker)](https://github.com/francoiseee/Coding-Simulator/pkgs/container/codely-web)
[![codely-inference](https://img.shields.io/badge/ghcr.io-codely--inference-blue?logo=docker)](https://github.com/francoiseee/Coding-Simulator/pkgs/container/codely-inference)

Prebuilt images (no build needed):

```bash
docker pull ghcr.io/francoiseee/codely-web:latest
docker pull ghcr.io/francoiseee/codely-inference:latest
```

Also on Docker Hub:

[![Docker Hub: codely-web](https://img.shields.io/badge/docker%20hub-codely--web-blue?logo=docker)](https://hub.docker.com/r/jezrlll19/codely-web)
[![Docker Hub: codely-inference](https://img.shields.io/badge/docker%20hub-codely--inference-blue?logo=docker)](https://hub.docker.com/r/jezrlll19/codely-inference)

```bash
docker pull jezrlll19/codely-web:latest
docker pull jezrlll19/codely-inference:latest
```

The whole stack runs locally as two containers:

| Container   | What it is                                | Port |
| ----------- | ----------------------------------------- | ---- |
| `web`       | The Next.js app                           | 3000 |
| `inference` | The FastAPI Random Forest service         | 8000 |

`inference` loads the latest `model_*.joblib` / `metadata_*.json` pair from `ml_out/` (currently M2). Supabase, Judge0 (RapidAPI), and the Anthropic API stay external cloud services.

### Prerequisites

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), then check:

```bash
docker --version
docker compose version
```

### Setup

```bash
git clone https://github.com/francoiseee/Coding-Simulator.git
cd Coding-Simulator
cp .env.example .env
```

Open `.env` and fill in the values:

| Variable                        | What it's for                                         | Where to get it                                                              |
| ------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (prefilled in `.env.example`)    | Supabase dashboard → Project Settings → API                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public (anon) key, used in the browser       | Supabase dashboard → Project Settings → API                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase server-side key                              | Supabase dashboard → Project Settings → API                                  |
| `JUDGE0_BASE_URL`               | Judge0 API base URL (prefilled)                       | Keep the default                                                             |
| `JUDGE0_RAPIDAPI_HOST`          | Judge0 RapidAPI host header (prefilled)               | Keep the default                                                             |
| `JUDGE0_RAPIDAPI_KEY`           | Key for running submitted code on Judge0              | [RapidAPI](https://rapidapi.com) → Judge0 CE → your app's API key           |
| `ANTHROPIC_API_KEY`             | Key for the AI feedback                               | [console.anthropic.com](https://console.anthropic.com) → API Keys            |
| `RF_INTERNAL_SECRET`            | Shared secret between `web` and `inference`           | Any random string. Generate one with `openssl rand -hex 32`                  |

> **Never commit `.env`.** It holds secrets. Only `.env.example` belongs in git.

### Run

First time (the build takes several minutes):

```bash
docker compose up --build
```

Afterwards:

```bash
docker compose up
```

`web` waits for `inference` to pass its health check before it starts.

### Verify

1. Open <http://localhost:8000/health>. It should show `model_loaded: true` and `reviewed_by_expert: true`.
2. Open <http://localhost:3000>. The app should load.
3. Submit a practice problem. The logs should show `POST /complexity` and `POST /predict` returning 200.

### Common commands

```bash
docker compose up -d            # run in the background
docker compose logs -f web      # follow web logs
docker compose logs -f inference  # follow inference logs
docker compose ps               # container status
docker compose down             # stop and remove containers
```

Rebuild with `docker compose up --build` after code changes, or after changing any `NEXT_PUBLIC_*` variable.

### Notes

- `NEXT_PUBLIC_*` variables are baked in at build time, so changing them requires `--build`. Server-side variables only need a restart.
- Inside compose, `RF_SERVICE_URL` is set automatically to `http://inference:8000`.
- Student `dataset_*.csv` files are excluded from the images via `.dockerignore`.
- `output: "standalone"` in `next.config.mjs` exists for the Docker image; Vercel ignores it.
- The `GET /health` lines every 15 seconds in the logs are the health check. This is normal.
- Images are published automatically by GitHub Actions to both Docker Hub and GHCR whenever changes are merged to `main`.

### Troubleshooting

**`/complexity` returns 500 with "RF_INTERNAL_SECRET is not configured".**
The variable is missing from `.env`. Add it, then:

```bash
docker compose down && docker compose up
```

**Anthropic API error 401 "invalid x-api-key".**
The key is expired or wrong. Create a new one at [console.anthropic.com](https://console.anthropic.com), update `ANTHROPIC_API_KEY` in `.env`, and restart:

```bash
docker compose down && docker compose up
```

**Login redirect issues on localhost.**
In the Supabase dashboard, add `http://localhost:3000` to Auth's allowed redirect URLs.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
