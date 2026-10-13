# Khedma

*Khedma* ("work" in Tunisian) is a local-first, AI-assisted companion for engineering students looking for internships (stage, PFE) and first jobs. Built as an end-of-year project (PFA) at ENIT.

Everything runs on your laptop: Next.js + SQLite, no account, no server. AI runs through Claude (API key) or Ollama (local), with built-in offline heuristics when neither is available — every AI result is labelled with the engine that produced it.

## What it does

- **Discover** — recommendations built from your CV: your field and level, offers ranked for you with reasons, roles and keywords to add, skills to learn, sources and Tunisian companies to follow.
- **Offers** — import from public job boards (Keejob, Tanitjobs, Emploitunisie, Farojob, Greenhouse, Lever, Ashby, RSS) or paste any posting; filters, saved views, duplicate detection, bulk evaluation, CSV export.
- **Fit score** — each offer scored 1–5 on five dimensions (CV match, target fit, growth, culture signals, red flags), with strengths, gaps and a verdict; ATS keyword match; "Ask AI" about the posting.
- **Applications** — kanban pipeline from evaluated to hired, tailored CV and cover letter (from your uploaded PDF/DOCX or Markdown CV), downloads as .docx / PDF / .md, messages (follow-up, thank-you, LinkedIn), interviews, contacts, reminders, timeline, .ics calendar feed.
- **Apply assistant** — readiness check, answers to typical application-form questions grounded in your CV, outreach notes, outcome and lessons log.
- **Interview coach** — mock interviews with a 127-question bilingual bank, voice input, timed answers, scored feedback, STAR story bank, 60-second drills.
- **Companies** — profiles built from your offers, polite research of their website, posting liveness checks, ratings and blacklist.
- **Today, Calendar, Insights, Reports** — focus list, weekly goal, month view, funnel and response analytics, weekly digest and a printable HTML report.
- **Profile & CV** — onboarding wizard, CV upload (PDF/DOCX/TXT/MD) with optional conversion to Markdown, profile strength, CV health check, three print templates.
- **Salaries** — indicative Tunisian ranges for students and juniors, gross ↔ net calculator.

French and English, light and dark themes, keyboard shortcuts (`Ctrl+K`, `/`, `N`, `G` then a letter, `?`), WCAG AA contrast, reduced-motion support.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### AI

- **Claude**: put `ANTHROPIC_API_KEY=...` in `.env.local` (never committed) and restart.
- **Ollama**: install from https://ollama.com (`winget install Ollama.Ollama` on Windows), then `ollama pull llama3.1`.
- Choose the provider in Settings → AI engine. Without either, Khedma works in offline mode.

### Optional job APIs

Some catalog boards read aggregator APIs that hand out free developer keys. Add the variables to `.env.local` and restart; the catalog shows the missing names until then.

- **Adzuna** (Europe / North America, one country per source): `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` from https://developer.adzuna.com
- **Jooble** (Tunisia and 60+ countries): `JOOBLE_KEY` from https://jooble.org/api/about
- **Reed** (United Kingdom): `REED_KEY` from https://www.reed.co.uk/developers
- **Findwork** (remote / US developer jobs): `FINDWORK_KEY` from https://findwork.dev/developers

Remote OK, Jobicy, Himalayas, Remotive, Artificial Intelligence Jobs and Arbeitnow need no key.

### Data

All data lives in `data/khedma.db` (SQLite) and `data/cv/` (uploaded CV). Export, restore and reset from Settings → Data.

## Scripts

- `npm run dev` — development server
- `npm run build && npm start` — production
- `npm test` — unit tests
- `npm run typecheck` — TypeScript
- `npm run lint` — ESLint
