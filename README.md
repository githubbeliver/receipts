# Receipts

Receipts is a visibility engine for under-documented talent.

It takes messy raw evidence such as notes, project fragments, launch copy, bug fixes, and outcome snippets, then transforms them into:

- a sharper personal headline
- a signature bio
- portfolio-ready bullets
- a launch-ready social post
- a shareable proof card

It can now also ingest screenshots and other visual receipts through the OpenAI Responses API vision input path.

## Why this stands out

Most capable people are not underqualified. They are under-documented.

Receipts helps builders, operators, and creators turn scattered proof into a narrative that is easier to hire, remember, and bet on.

## Demo flow

1. Paste rough project evidence into the intake area, or upload a screenshot.
2. Switch between Builder, Operator, and Creator modes.
3. Watch the app extract impact signals, working traits, themes, visible evidence from the image, and a transparent evidence-to-strength mapping panel.
4. Export the result as markdown, download a proof-card image, or open a print-friendly proof card.

## Product angle

Receipts is not about inventing credibility.
It is about revealing the credibility already hiding inside unfinished notes and quiet wins.

## Tech

- `index.html`
- `styles.css`
- `app.js`
- `server.js`

## Run locally

1. Create a local env file:
   copy `.env.example` to `.env`
2. Put your real key in `.env`:
   `OPENAI_API_KEY=your_key_here`
3. Start the local server:
   `node server.js`
4. Open:
   `http://localhost:3000`

If `OPENAI_API_KEY` is missing, the app still works in local-analysis fallback mode.

## Deploy to Vercel

1. Push this project to GitHub.
2. Import the repo into Vercel.
3. In the Vercel project settings, add environment variables:
   `OPENAI_API_KEY`
   `OPENAI_MODEL` (optional, defaults to `gpt-5`)
4. Deploy.

The frontend is served as static files and the AI backend runs through Vercel Functions in [`api/generate.js`](C:\project\codex challenge\api\generate.js) and [`api/health.js`](C:\project\codex challenge\api\health.js).
