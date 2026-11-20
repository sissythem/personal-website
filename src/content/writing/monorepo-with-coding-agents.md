---
title: A monorepo that works with coding agents
description: Our last monorepo needed 20 minutes of CI on every commit. I'm trying a monorepo again, this time built for working with coding agents.
pubDate: 2026-11-15
tags: [monorepo, ci-cd, ai-agents, python]
draft: false
cover: ../../assets/covers/monorepo-with-coding-agents.png
coverAlt: "Diagram of a uv workspace: a change to the core package checks core and the agents and api packages that depend on it, while the other packages are skipped."
---

A few years ago, the company I was working for kept everything in one large monorepo. Every pull request waited 15 to 20 minutes for CI, a dependency bump could break services nobody had touched, and the repository had grown to about a gigabyte. Rather than pay down the monorepo's technical debt, the company decided to move to many small repositories, to make CI fast again and daily releases possible.

Of the two, releases had been the bigger problem. Even with feature flags, few people were confident enough to release from the monorepo on their own, so most releases turned into a huddle of platform, software and ML engineers, which was never going to scale. With many repositories, releases now go out several times a day, although that isn't something only many repositories can offer. A monorepo can be released just as often, and ours had simply been set up in a way that made it impossible.

It may seem odd, then, that I'm building a monorepo again. Most of my code is now written together with coding agents, and they shift the trade-off far enough that I want to try once more, this time without repeating the mistakes of the old one.

## Why the old monorepo was slow

The repository held services, shared libraries, machine learning code, notebooks and a frontend, all side by side. In hindsight, the problem lay not in the monorepo itself but in the way it had been set up.

All the code shared a single environment, in which every dependency of every project, from deep learning frameworks to web frameworks, was declared in one list. As a result, everything was installed by every developer and every CI job, even for a small change to one library.

The libraries were meant to be independent, but in practice they were not. Shared code that lived outside any library was imported by several of them, so they could not be installed or tested on their own, and a library that should have been lightweight could end up pulling in heavy dependencies.

CI checked only whether any Python file had changed. If one had, the entire test suite and the type check were run for the whole repository. The dependency cache was tied to the whole lockfile, so a dependency update in any part of the repository restarted every job from scratch.

Dependencies were also declared in more than one place, such as the main lockfile and a separate set of requirements for each service's Docker image. These drifted apart over time, and time that should have gone into the product was spent repairing the lockfile instead.

Finally, large files such as notebooks with their outputs and data exports were committed to git. Even once deleted they remained in the history, which is why the repository kept growing.

Splitting the code into many repositories fixed the CI time, since each repository tests only itself, but it carries a cost of its own. A change to a shared library has to be released and then bumped in every repository that uses it, one merge request at a time. Each repository can be green while the combination is broken, and the breakage only surfaces with a later bump.

## What changes with coding agents

The choice between a monorepo and multiple repositories is an old one, and the answer usually depends on how often a change crosses the boundaries between packages. Coding agents alter that calculation in two ways.

The first is what the agent can see. In a separate repository, an agent changing a library has no view of the code that uses it, and so cannot know which callers it breaks. This has become easier to work around: Claude Code can open other directories with `--add-dir`, for instance, or the agent can be given a code search tool.

The second is what a single CI run can test, which Ranjan Kumar calls the [proof perimeter](https://ranjankumar.in/monorepo-vs-polyrepo-ai-coding-agents-proof-perimeter). In a monorepo, the change to the library and the changes to its callers travel in one pull request and are tested together before merging. With multiple repositories, the same change is split across several pull requests that are merged in order, each tested against older versions of the others. Agents make far more of these cross-cutting changes than people do, because the effort involved doesn't deter them, so the perimeter matters more than it used to.

There are arguments against the monorepo as well. A [study on `AGENTS.md` files](https://arxiv.org/abs/2602.11988) found that context files in the repository often lowered the agents' success rate and increased the inference cost by more than 20%, which suggests that a large repository with long instructions can make an agent worse. [Faros AI](https://www.faros.ai/blog/monorepo-vs-polyrepo-benchmark-data) measured a median pull request cycle time of 19 hours for teams in monorepos and 2 hours for teams with multiple repositories. They attribute the gap to immature CI and review routing rather than to the monorepo itself, which matches our experience, but the risk remains. Lastly, a single commit, or a single agent with write access, can touch everything.

My new monorepo is a side project for building AI agents, made up of a few Python packages and tools. What I'm doing differently falls into three groups: keeping the packages apart, keeping CI fast, and keeping the agents in line.

## Keeping the packages apart

### A workspace instead of a shared environment

The repository is a [uv workspace](https://docs.astral.sh/uv/concepts/projects/workspaces/). The root `pyproject.toml` is a virtual root that lists only the members (such as `packages/*` and `tools/*`) and the tools used across the repository, such as pre-commit, pip-audit and towncrier. Each package declares its own dependencies, dev group and pyright and pytest settings, while the lint rules are shared through ruff's `extend`.

A single lockfile means that all packages resolve to the same versions, yet each package installs only what it declares. `uv lock --check` runs in pre-commit and `uv sync --locked` in CI, so the lockfile cannot fall out of sync with the `pyproject.toml` files. A workspace isn't always the right choice, though: the uv documentation suggests path dependencies between separate projects when packages need conflicting versions of a dependency or separate environments.

### Boundaries checked by tools

A workspace does nothing to stop a package from importing the dependencies of another, and agents are remarkably good at finding an import that happens to work. A rule that exists only in the README therefore doesn't survive for long. Each package is checked by pyright in strict mode, and the layers are enforced by [import-linter](https://import-linter.readthedocs.io/) contracts. The core logic of a package cannot import the HTTP client or the adapters to external services, for example, so the core can be tested with fakes and the adapters can be replaced.

Phoebe [moved to Bazel](https://www.phoebe.work/blog/enforcing-architecture-in-an-agent-driven-codebase) partly for this reason, as their agents fixed build errors by loosening the constraints. When the constraint is a contract checked in CI, any loosening shows up in the diff and has to be approved by someone.

## Keeping CI fast

### Check what changed and what depends on it

A small, dependency-free tool in the repository reads the workspace graph and decides what has to be checked:

- A change in a package checks that package and every package that depends on it
- A change in a shared file (the lockfile, the root `pyproject.toml`, `.python-version` or the workflows) checks everything
- A change only in the docs or plans checks nothing

From this, a matrix is generated with one quality job per package (lint, types and tests), and a single `CI success` job, which counts skipped jobs as passed, serves as the required check. A push to `main` checks everything regardless.

GitHub's `paths` filters and GitLab's `rules:changes` would be simpler, but they see only the changed files and not the packages that depend on them, so the benefit of testing the whole change together would be lost.

At the moment a full CI run takes well under two minutes, but with only two packages that proves very little, so ask me again when there are twenty.

## Keeping the agents in line

### Short instructions per package

Claude Code, Codex, Cursor and Copilot all read instruction files arranged in a hierarchy. Claude Code loads the `CLAUDE.md` files from the working directory and its parents at start-up, and a subdirectory's file only once it reads or edits a file there. Codex combines the `AGENTS.md` files from the root down to the working directory, with deeper files taking precedence. Under the [agents.md](https://agents.md/) convention, the file closest to the edited code wins.

This suits a monorepo, provided the files stay short. The root file should hold pointers and the rules that apply to the whole repository, while each package's file holds its own conventions and the exact commands for linting, type checking and running a single test. Anything longer, or needed only occasionally, is better written as a skill, which is loaded only when required. Given the study above, I prefer to keep these files small. The repository doesn't have them yet, so they are the next step, to be added one package at a time.

### Rules as checks, not as instructions

The [Claude Code documentation](https://code.claude.com/docs/en/best-practices) notes that instruction files are guidance, which the model may decide doesn't apply. A rule that must always hold should therefore be a hook, a permission rule or a CI check.

In `CONTRIBUTING.md`, each rule is listed alongside the tool that enforces it. Pull request titles follow Conventional Commits and every package keeps changelog fragments, both of which are checked in CI. Files larger than 1 MB are rejected by `check-added-large-files`, so that notebooks with outputs and data exports cannot creep back in, and generated code is marked in `.gitattributes` to keep it out of the diffs. For the agents, a hook can run the type checker before the agent finishes, so that it fixes its own errors.

### Agents working in parallel

When several agents work on the repository, each is given its own git worktree on its own branch (with `--worktree` in Claude Code, for example), so that no two of them edit the same checkout. Changes that cross a package boundary are routed to the right reviewer by `CODEOWNERS`, and every change is still reviewed by a person. Stripe merges more than a thousand pull requests written by agents per week, and [each one is reviewed by an engineer](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents). As the number of parallel changes grows, a merge queue would help too, since it tests each change against `main` together with the changes ahead of it.

### Supply chain

Because a single agent with write access can touch everything, the repository itself has to be harder to compromise. Every GitHub Action is pinned to a commit SHA, the workflows run with read-only permissions, and untrusted input reaches the scripts only through environment variables. The workflows are checked by zizmor and actionlint, secrets are searched for by gitleaks, and the lockfile is audited by pip-audit. Dependabot updates are grouped and held back for seven days after a release, which makes it more likely that a compromised version is noticed before it reaches the repository.

## Next steps

The repository is new and holds only two packages, so the change detection doesn't save much yet, and whether it works will only become clear once there are many more. The per-package instruction files are still to be added, as are the first services, each of whose Docker images will be built with `uv sync --package` so that it contains only what that service needs.

With a single lockfile, a dependency bump still checks every package. That is the right behaviour, but it will become slower as the repository grows. At that point remote caching would be worth a look, as would tools like Nx, Bazel or Pants, which handle change detection and caching properly at a much larger scale. For now, about a hundred lines of Python reading the uv workspace graph are enough.

<div class="callout">

## So, monorepo or not?

For years my answer was "many repositories", shaped by what the old monorepo felt like. Looking at it again, almost everything that made it slow was a matter of setup: one environment for everything, boundaries that were only conventions, and a CI that couldn't tell what a change affected. All of these can be fixed. What cannot be fixed with many repositories is that a change spanning several packages is split up and tested in pieces, and that is exactly the kind of change agents make all the time. So for now I'm betting on the monorepo, and I'll write again when it's big enough to tell whether I was right.

</div>

## References

- [The Proof Perimeter: monorepo vs polyrepo for AI coding agents](https://ranjankumar.in/monorepo-vs-polyrepo-ai-coding-agents-proof-perimeter), Ranjan Kumar
- [Evaluating AGENTS.md](https://arxiv.org/abs/2602.11988), Gloaguen et al.
- [Monorepo vs polyrepo benchmark data](https://www.faros.ai/blog/monorepo-vs-polyrepo-benchmark-data), Faros AI
- [Enforcing architecture in an agent-driven codebase](https://www.phoebe.work/blog/enforcing-architecture-in-an-agent-driven-codebase), Phoebe
- [Minions: Stripe's one-shot, end-to-end coding agents](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents), Stripe
- [Claude Code: memory and CLAUDE.md](https://code.claude.com/docs/en/memory) and [best practices](https://code.claude.com/docs/en/best-practices), Anthropic
- [AGENTS.md](https://agents.md/)
- [uv workspaces](https://docs.astral.sh/uv/concepts/projects/workspaces/), Astral
- [Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), GitHub
