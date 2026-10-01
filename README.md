# NativeExpress agent skills

Public entry point for [NativeExpress](https://native.express), a commercial React
Native + Expo boilerplate.

## Install

```bash
npx skills add robinfaraj/nativeexpress-skills -g --copy -y
```

Then, in an empty folder, tell your coding agent:

```text
Create a new NativeExpress app called my-app, then set it up.
```

`-g` installs for every coding agent on your machine, so it works before any project
exists — which is the point: the boilerplate's own skills only arrive with the clone,
so something has to know how to get there first.

`--copy` is worth keeping. The installer symlinks by default, and a symlink is a broken
file on Windows without `core.symlinks`.

Drop `-g` to install into the current project only.

### As a Codex plugin

```bash
codex plugin marketplace add robinfaraj/nativeexpress-skills
codex plugin add nativeexpress@nativeexpress
```

### As a Claude Code plugin

```bash
claude plugin marketplace add robinfaraj/nativeexpress-skills
claude plugin install nativeexpress@nativeexpress
```

Both plugins carry the same skills as the `npx skills add` route.

## Check an app before App Store review

`app-store-check` works on any Expo or React Native repo, NativeExpress or not. In the
project, ask your agent:

```text
Is my app ready for the App Store?
```

It runs `skills/app-store-check/scripts/scan.mjs` (Node 18+, no dependencies) over the
repo, reads every file the scan flags to confirm or overturn it, and reports what will
block review, what is likely to be flagged, and how to fix each. It never edits code
unless you ask. The scan also runs on its own:

```bash
node skills/app-store-check/scripts/scan.mjs path/to/app        # readable report
node skills/app-store-check/scripts/scan.mjs path/to/app --json # for agents
node --test 'skills/app-store-check/tests/*.test.mjs'           # its tests
```

## What's here

| Skill | Does |
|---|---|
| `nativeexpress` | Scaffolds a new app, then hands off to the project's own `setup` skill |
| `app-store-check` | Checks any Expo or React Native app against the App Review Guidelines that most often reject apps |

`nativeexpress` is deliberately the only skill here that touches the boilerplate. Everything else — configuring
Supabase, the AI edge functions, RevenueCat, Superwall, OneSignal, Sentry, PostHog,
Google and Apple sign-in — lives in the boilerplate itself, versioned alongside the code
it edits. A copy here would drift.

## What you get after the clone

The boilerplate ships its own skills, already on disk:

| Skill | Does |
|---|---|
| `setup` | Configures every integration, tier by tier, verifying each |
| `conventions` | The codebase's conventions, for writing or reviewing code |
| `uniwind` | Uniwind (Tailwind v4 for React Native) styling |
| `heroui-native` | The HeroUI Native component library |

Claude Code reads `.claude/skills/`; Cursor, Codex, Copilot, Gemini CLI, Cline and
OpenCode read `.agents/skills/`. Both are in the repository, so there is nothing to
install. For any other agent, `yarn skills:install` inside the project copies them
across.

## Requirements

Cloning the boilerplate needs a NativeExpress licence and the GitHub access granted at
purchase. Without it the scaffold step fails with a permission error — that is expected,
not a bug.

Buy at [native.express](https://native.express).
