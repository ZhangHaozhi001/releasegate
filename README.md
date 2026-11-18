# ReleaseGate

**An assignable Rovo agent that renders evidence-cited GO / CAUTION / NO-GO verdicts for Jira releases.**

Built for **Atlassian Codegeist 2026** — category *Apps for Software Teams*, bonus target *Best Agents (Rovo Agent)*.

Assign ReleaseGate to a release issue (or ask it in Rovo chat) and it aggregates the release's linked issues, fix-version scope, pull-request states and build results, runs a configurable rule engine, and answers with a verdict where **every finding cites the issue, PR or build it came from**. On request it can also create follow-up subtasks for each finding and post the full verdict as a comment on the release issue.

> Status: **pre-account skeleton (M0 pending)**. The verdict engine, demo, manifest and Forge wiring are in place and unit-tested locally. Deploying needs an Atlassian developer site — see "Deploy once accounts exist" below.

## Why

Release go/no-go calls are made every week by every software team, usually from a spreadsheet, a gut feel, and whoever shouts loudest in the release channel. The data needed for a defensible call already lives in Jira and the dev tools connected to it — it is just never assembled, with receipts, at decision time. ReleaseGate assembles it.

## Architecture

```
manifest.yml                  Forge app declaration
├─ modules.rovo:agent         the ReleaseGate agent (prompt = resource file)
├─ modules.action             assess-release / create-follow-up-subtasks / post-verdict-comment
├─ modules.jira:issuePanel    verdict card on the release issue (UI Kit shell)
├─ modules.jira:adminPage     threshold configuration page (useAsConfig)
└─ modules.function           resolver + action handlers -> src/index.ts

resource/agent/prompts/       the agent's system prompt (single source of truth)

src/core/                     PLATFORM-AGNOSTIC verdict engine (pure functions)
├─ types.ts                   ReleaseInput / VerdictResult / EvidenceItem ...
├─ config.ts                  thresholds + validation (admin-tunable, never hard-coded)
├─ evaluate.ts                rule engine: blockers, scope ratio, stale/overdue,
│                             unmerged/declined PRs, build state -> verdict + score
└─ report.ts                  text report + Jira comment body (ADF) rendering

src/forge/                    Atlassian-facing layer (only place that knows Jira payloads)
├─ jiraClient.ts              REST mapping: issues, links, fix versions, dev-status PRs
├─ actions.ts                 the three Rovo action handlers + config loading (Forge storage)
└─ resolver.ts                getVerdict (panel) / getConfig / saveConfig (admin page)

src/demo/                     constructed data + CLI demo (no account needed)
test/                         node:test unit tests for the core engine
static/                       UI Kit shells for the panel and config page
```

**Design rule:** the verdict logic never touches `@forge/api`. The Forge layer maps Jira data into `ReleaseInput`; the core returns a `VerdictResult`. That is what makes the engine fully testable offline and the thresholds honestly configurable instead of demo-hard-coded.

### Rules (defaults; all tunable on the config page)

| Rule | Default behaviour |
|---|---|
| `open-blocker` | An unfinished blocker-priority issue, or one that blocks the release via a "Blocks" link → **blocker** (tolerated up to `maxOpenBlockers`, then warning) |
| `scope-incomplete` | Done-ratio < 80% (`doneRatioBlockerBelow`) → **blocker**; < 100% (`doneRatioWarningBelow`) → warning |
| `no-linked-issues` | No scope found at all → warning (unverifiable ≠ green) |
| `stale-issue` | Open issue untouched for > 7 days (`staleDays`) → warning + chase follow-up |
| `overdue-issue` | Open issue past its due date → warning |
| `declined-pr` | A declined PR whose change is expected in the release → **blocker** |
| `unmerged-pr` | Open PRs beyond `maxUnmergedPrs` (default 0) → **blocker**; within tolerance → warning |
| `build-failed` | Failed build → **blocker** while `requireSuccessfulBuild` is on |
| `build-unverified` / `no-build-evidence` | Build still running/unknown, or no build data → warning (never silently green) |

Verdict: any blocker → **NO-GO**; else any warning → **CAUTION**; else **GO**. Score = 100 − 35·blockers − 10·warnings (informational).

## Run it locally (no Atlassian account needed)

```bash
npm test     # 19 unit tests over the verdict engine (node --test, zero framework deps)
npm run demo # CLI demo over constructed data
```

The demo runs two constructed releases:

- **REL-101 "Payments v2.4.0"** — everything done, PRs merged, build green → **GO, 100/100**.
- **REL-102 "Payments v2.5.0"** — two open blockers, 50% scope, a declined PR, an open PR, a failed build, one stale and one overdue issue → **NO-GO** with the full cited evidence list, suggested follow-up subtasks, and the exact ADF comment body the `post-verdict-comment` action would post.

## Deploy once accounts exist

Prerequisites (user steps, from the project plan): a **Devpost account** and an **Atlassian account with a free Cloud developer site** (developer.atlassian.com/cloud). Nothing here registers accounts on anyone's behalf.

```bash
npm install -g @forge/cli        # >= 10.6.0 required (prompt-as-resource in the manifest)
forge login                      # user's Atlassian account
forge register                   # writes the real app.id into manifest.yml
forge deploy
forge install                    # into the developer site
```

Then, in Jira on the developer site:

1. Create the demo data set (healthy release + doomed release, mirroring `src/demo/fixtures.ts`).
2. Open Rovo chat, pick the **ReleaseGate** agent, ask it to assess the doomed release.
3. Check the **ReleaseGate verdict** panel on the release issue and the thresholds on the **ReleaseGate configuration** page (Jira admin → Apps).

For the Codegeist submission, generate the judge install link via Forge's "Start sharing your app" distribution flow and paste it into the Devpost form together with the test instructions.

### Known skeleton-stage gaps (tracked, not hidden)

- **Build results**: Jira has no single stable REST read for build state without a connected CI app, so `fetchBuilds()` returns `[]` and the engine honestly reports "no build evidence" warnings. Wiring a concrete CI source is an M1 task (see `src/forge/jiraClient.ts` header).
- **Endpoints to verify on the dev site** (marked `TODO(verify-at-deploy)` in code): the `search/jql` response shape, the dev-status PR payload shape, whether dev-status reads need extra permission scopes, and the site-specific subtask issue-type name.
- **Config page** is a UI shell; binding its form to `getConfig`/`saveConfig` and enforcing admin-only saves is M2 work.
- **Issue panel** is a UI shell; binding it to `getVerdict` is M1/M2 work.

## Milestone map (project plan)

| Milestone | What lands here |
|---|---|
| M0 (accounts + hello world) | `forge register` replaces the placeholder app id; first deploy/install on the dev site |
| M1 (skeleton, Nov 22–29) | Agent answers with a raw evidence list on seeded test data; dev-site endpoint verification TODOs cleared |
| M2 (core, Nov 30–Dec 7) | Config page binding, panel binding, action polish — the engine in this repo is already the M2 core |
| M4 (materials, Dec 15–18) | This README + test instructions finalised for judges |
| M6 (submit, Dec 21) | Devpost submission with install link + <5 min demo video |
