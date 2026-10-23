# Khedma

*Khedma* (خدمة, "work" in Tunisian Arabic) is a local-first job and internship search companion. It scans job boards and employers' own hiring systems, ranks every offer against your CV, writes a tailored CV and cover letter you can send as they are, and tracks each application up to the offer.

Everything runs on your computer: a Next.js app and a SQLite file, no account and no server. AI is optional: with an API key Khedma uses an online model, and without one every feature still works with built-in offline methods. Each AI result says which engine produced it.

French and English interface, light and dark themes.

## What it does

**Find offers**
- **Radar**: one scan across 51 sources. These include job boards in Tunisia, France, Germany, Switzerland, the United Kingdom, Canada, the United States and Japan, plus remote and international boards. It also reads the hiring systems employers use directly: Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday, Teamtailor and others.
- **Scans that follow your CV**: search keywords come from the roles and skills your CV shows. "Auto scan (from my CV)" runs that search in one click. Replacing your CV re-ranks every offer and scans again.
- **After the scan**: the offers that fit you best, with the reasons, and one next step for each.
- **Clean results**: duplicates are merged across boards, closed postings are detected and archived, and each offer gets a trust check.
- **Logged-in sites**: a bookmark imports the offers visible on LinkedIn, Indeed, Glassdoor, JobTeaser or Welcome to the Jungle from your own browser session. It works with LinkedIn's security rules.

**Apply**
- **Fit score** on five dimensions, with strengths, gaps, eligibility checks and a verdict.
- **Tailored CV and cover letter**: grounded in your CV only. Nothing is invented, and they come with no placeholders left to fill.
  - PDF first, plus DOCX, Markdown and plain text.
  - Seven designs, including Harvard and Engineering, with fit to one page.
  - A readability check on the PDF you send.
- **Application forms**: the employer's real form questions are loaded (Greenhouse, Ashby, Workable, Recruitee). Answers come from your CV, and sensitive questions are left to you.
- **Pipeline**: kanban from first look to hired, plus reminders, follow-up messages, interviews, a timeline and an `.ics` calendar feed.
- **Recruiter replies**: paste an e-mail or import `.eml` and `.mbox` files to update the application stage.
- **Offers received**: note pay in any currency, start date, answer-by date and remote days, then compare them side by side.

**Prepare**
- **Interview coach**: a bilingual question bank, timed mock interviews, scored feedback and a STAR story bank.
- **Contacts**: recruiters, interviewers, alumni and referrals, across all your applications.
- **Upskill**: the skills your target offers ask for that your CV does not show yet.
- **Salaries**: indicative Tunisian internship and junior ranges, and the pay mentioned in your offers (10 currencies).

**Your profile**
- CV upload from PDF (including two-column layouts and scanned PDFs, read with OCR in your browser), DOCX, TXT or Markdown.
- A profile strength score and a CV review.

## Quick start

Requires Node.js 22.13 or newer (Khedma uses the built-in `node:sqlite`).

```bash
npm install
npm run dev
```

Open http://localhost:3000. A short onboarding asks for your CV and where you want to work.

### AI (optional)

Put an Anthropic API key in `.env.local` (never committed) and restart:

```
ANTHROPIC_API_KEY=...
```

Choose the engine in Settings → AI. Without a key, Khedma runs in offline mode with heuristic scoring and writing.

### Optional job APIs

A few boards are aggregator APIs with free developer keys. Add them to `.env.local`; until then the catalogue shows the missing names.

| Board | Variables | Get a key |
|---|---|---|
| Adzuna (Europe, North America) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | https://developer.adzuna.com |
| Jooble (Tunisia and 60+ countries) | `JOOBLE_KEY` | https://jooble.org/api/about |
| Reed (United Kingdom) | `REED_KEY` | https://www.reed.co.uk/developers |
| Findwork (remote, US developers) | `FINDWORK_KEY` | https://findwork.dev/developers |

Every other source needs no key.

## Your data

- Everything lives in `data/khedma.db` (SQLite) and `data/cv/` (your uploaded CV), both ignored by git. Export, restore and reset are in Settings → Data.
- Scans read public job pages politely. They never log in, bypass a CAPTCHA or submit an application for you.
- Scanned CVs are read with OCR in your browser. The OCR engine is served by Khedma itself, so the file never leaves your computer.
- Job postings are treated as untrusted text: the AI is told to ignore any instructions hidden in a posting.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` then `npm start` | production build and server |
| `npm test` | unit tests (node:test) |
| `npm run e2e` | browser and accessibility tests (Playwright with axe, using your installed Chrome) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |

`npm run e2e` never touches your data: it seeds a throwaway database, builds into `.next-e2e` and runs on port 3107 with no AI key.

The stack is Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4 and SQLite. Job board connectors live in `src/lib/sources/`, AI prompts and output checks in `src/lib/ai/`, and CV parsing, designs and export in `src/lib/cv/`.

## Credits

Khedma started as an end-of-year engineering project (PFA) at ENIT, Tunis.

Some parts adapt ideas or code from these open-source projects:

| Project | License | Used for |
|---|---|---|
| [Reactive Resume](https://github.com/reactive-resume/reactive-resume) | MIT | CV designs, fit to one page |
| [RenderCV](https://github.com/rendercv/rendercv) and Jake's Resume | MIT | Harvard and Engineering designs |
| [open-jobs](https://github.com/elliottdehn/open-jobs) | CC0 | employer hiring-system readers, closed-offer detection, salary parsing |
| [Resume-Matcher](https://github.com/srbhr/Resume-Matcher) | Apache-2.0 | two-column PDF import, PDF checks |
| [job-application-tracker](https://github.com/waddington/job-application-tracker) | Apache-2.0 | offer records, e-mail import |
| [JobSync](https://github.com/Gsync/jobsync) | MIT | contacts network |
| [open-career-skills](https://github.com/squerne/open-career-skills) | MIT | truthfulness rules for AI writing |
| [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) | MIT | application gates, follow-up cadence |
| [career-ops](https://github.com/career-ops-hq/career-ops) | MIT | triage, calibration, writing checks |

Libraries: [postal-mime](https://github.com/postalsys/postal-mime) (MIT-0), [tesseract.js](https://github.com/naptha/tesseract.js) and [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0), [unpdf](https://github.com/unjs/unpdf) (MIT), [lucide](https://lucide.dev) (ISC).
