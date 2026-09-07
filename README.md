# NativeExpress agent skills

Public entry point for [NativeExpress](https://native.express), a commercial React
Native + Expo boilerplate.

## Install

```bash
npx skills add robinfaraj/nativeexpress-skills -g --copy -y
```

Then, in an empty folder, tell your coding agent:

```text
Create a new NativeExpress app called my-app, then set it up. Start with the
setup skill's discovery phase: interview me, write PRODUCT.md, then continue
through the tiers.
```

`-g` installs for every coding agent on your machine, so it works before any project
exists — which is the point: the boilerplate's own skills only arrive with the clone,
so something has to know how to get there first.

`--copy` is worth keeping. The installer symlinks by default, and a symlink is a broken
file on Windows without `core.symlinks`.

Drop `-g` to install into the current project only.

## What's here

| Skill | Does |
|---|---|
| `nativeexpress` | Scaffolds a new app, then hands off to the project's own `setup` skill |

That is deliberately the only skill in this repo. Everything else — configuring
Supabase, the AI edge functions, RevenueCat, Superwall, OneSignal, Sentry, PostHog,
Google and Apple sign-in — lives in the boilerplate itself, versioned alongside the code
it edits. A copy here would drift.

## What you get after the clone

The boilerplate ships its own skills, already on disk:

| Skill | Does |
|---|---|
| `setup` | Interviews you, writes the product brief, then configures every integration, tier by tier, verifying each |
| `design` | Gives the app its own look: theme from brand colours, fonts, icon and splash from a logo |
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
