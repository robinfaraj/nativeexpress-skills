---
name: nativeexpress
description: Scaffold a new NativeExpress React Native app and configure it end to end. Use when the user wants to start a new mobile app, create a NativeExpress project, "make me an iOS app", "build a React Native app", "scaffold NativeExpress", or asks to set up NativeExpress before the repository exists on disk. Hands off to the repo's bundled setup skill once the clone lands.
compatibility: Requires node 22+, git and network access. A NativeExpress licence and GitHub access to the boilerplate repository are needed for the clone to succeed.
license: Proprietary — NativeExpress.
---

# Create a NativeExpress app

NativeExpress is a commercial React Native + Expo boilerplate: Expo Router, Supabase
auth/database/storage, streaming AI chat, image generation, camera scan, RevenueCat and
Superwall paywalls, OneSignal push, Sentry, PostHog, i18n, iPad support.

This skill covers **only the step before the repository exists**. The repository ships
its own, far more detailed `setup` skill — hand off to it as soon as the clone lands and
do not try to configure anything yourself.

## Scaffold

Ask for the app name if the user has not given one, then:

```bash
npx nativeexpress@latest create-app <app-name>
```

The scaffolder asks two things: the app name and the Expo account username that will
own the project. It derives the slug, URL scheme, iOS bundle identifier and Android
package name from those, shows them once to confirm or correct, and optionally takes
a Supabase URL and anon key. Do not ask the user for identifiers yourself; the
scaffolder and the project's `setup` skill share one set of derivation rules, and
`create-app --help` lists the flags that pin a value for a scripted run.

Add `--ssh` if the user's GitHub access is SSH-only. **If the clone fails with an
authentication error, retry once with `--ssh` before reporting a problem.** HTTPS
versus SSH is the single most common failure here.

## After the clone

The scaffolder ends by printing what to do next. Follow it exactly: `cd` into the
project, `yarn install`, then load the project's own `setup` skill from
`.claude/skills/setup/` or `.agents/skills/setup/` and start with its discovery
phase, which interviews the user, writes `PRODUCT.md`, and continues through the
tiers. That skill is versioned with the code it edits and is always newer than this
file.

If the agent in use reads neither `.claude/skills/` nor `.agents/skills/`, run
`yarn skills:install` inside the project first. It copies the skills into whichever
directory that agent does read.

## Do not

- **Do not configure integrations from this skill.** Everything past `yarn install`
  belongs to the project's `setup` skill, which is versioned with the code it edits and
  will be newer than this file.
- **Do not invent credentials.** Every key comes from a vendor dashboard only the human
  can reach.
- **Do not clone by hand** with `git clone` unless `npx nativeexpress` genuinely fails.
  The scaffolder also rewrites `config.js`, writes `.env.local`, and mirrors the skills
  for non-Claude agents — a bare clone skips all three.

## If the user has no licence

The clone requires GitHub access granted at purchase. If it fails with a 404 or a
permission error, the likely cause is a missing licence or a GitHub account that differs
from the one used to buy. Point them at https://native.express rather than guessing.
