---
title: A monorepo that works with coding agents
description: Our last monorepo needed 20 minutes of CI on every commit. I'm trying a monorepo again, this time built for working with coding agents.
pubDate: 2026-11-15
tags: [monorepo, ci-cd, ai-agents, python]
draft: false
cover: ../../assets/covers/monorepo-with-coding-agents.png
coverAlt: "Diagram of a uv workspace: a change to the core package checks core and the agents and api packages that depend on it, while the other packages are skipped."
---

A few years ago, the company I was working for kept everything in one large monorepo. As a result, every pull request suffered a 15 to 20 minute delay for CI, any dependency bump could break unmodified services, while the repository had grown to the size of about a gigabyte. Rather than pay down the monorepo's technical debt, the company made the decision to move to many small repositories to improve CI speed and enable daily releases.

Between the two, releases were the main weakness of the repository set-up. Even with feature flags, few people were confident enough to release from the monorepo on their own, so most releases turned into a huddle of platform, software and ML engineers, thus ruling out any possibility of product scale-up. Switching to many repositories did indeed support several releases per day, although there are other repository set-ups serving the same purpose. For instance, a properly built monorepo can be released just as often, yet ours had simply been established in a way that made it impossible.

As odd as it may seem, I'm building a monorepo again. Most of my code is now written using coding agents, which has shifted the trade-offs enough to make it worth another try, this time without repeating mistakes of the past.

## Why the old monorepo was slow

The repository held services, shared libraries, machine learning code, notebooks and a frontend, all side by side. In hindsight, the problem lay not in the monorepo itself but in the way it had been set up.

The entire code shared a single environment, in which every dependency of every project, from deep learning frameworks to web frameworks, was declared in one list. As a result, everything was installed by every developer and every CI job, even when implementing a small change to one of the libraries.

The libraries were intended to be independent units, yet this was not the case in practice. Several of them relied on shared code living outside any library, which prevented them from being installed or tested in isolation, forcing an otherwise lightweight library to pull in heavy dependencies.

CI checked only whether any Python file had changed. If any modification was detected, then the entire test suite and the type check would run for the whole repository. Since the dependency cache was tied to the whole lockfile, any dependency update in any part of the repository restarted every job from scratch.

Dependencies were also declared in more than one place, such as the main lockfile and a separate set of requirements for each service's Docker image. Since these drifted apart over time, effort intended for the product was spent on repairing the lockfile instead.

Finally, large files such as notebooks with their outputs and data exports were committed to git. Even after deletion they remained in the history, which caused the repository to keep growing.

Splitting the code into many repositories did indeed resolve the CI delay, since each repository tests only itself, yet this set-up carries a cost of its own. Any change to a shared library has to be released and then bumped in every repository relying on it, one merge request at a time. As a result, each repository can be green while the combination is broken, with the breakage surfacing only at a later bump.

## What changes with coding agents

The choice between a monorepo and multiple repositories is an old one, and the answer usually depends on how often a change crosses the boundaries between packages. Coding agents alter that calculation in two respects.

The first concerns what the agent can see. In a separate repository, an agent modifying a library has no view of the code relying on it, and is therefore unable to tell which callers it breaks. This limitation has become easier to work around: for instance, Claude Code can open other directories with `--add-dir`, or the agent can be given a code search tool.

The second concerns what a single CI run can test, which Ranjan Kumar calls the [proof perimeter](https://ranjankumar.in/monorepo-vs-polyrepo-ai-coding-agents-proof-perimeter). In a monorepo, the change to the library and the changes to its callers travel in one pull request and are tested together before merging. With multiple repositories, the same change is split across several pull requests merged in order, each tested against older versions of the others. Since the effort involved does not deter them, agents make far more of these cross-cutting changes than people do, thus making the perimeter more important than it used to be.

There are arguments against the monorepo as well. A [study on `AGENTS.md` files](https://arxiv.org/abs/2602.11988) found that context files in the repository often lowered the agents' success rate and increased the inference cost by more than 20%, suggesting that a large repository with long instructions can make an agent worse. [Faros AI](https://www.faros.ai/blog/monorepo-vs-polyrepo-benchmark-data) measured a median pull request cycle time of 19 hours for teams in monorepos and 2 hours for teams with multiple repositories. Although they attribute the gap to immature CI and review routing rather than to the monorepo itself, which matches our experience, the risk remains. Lastly, a single commit, or a single agent with write access, can touch everything.

My new monorepo is a side project for building AI agents, consisting of a few Python packages and tools. What I'm doing differently this time falls into three groups: keeping the packages apart, keeping CI fast, and keeping the agents in line.

## Keeping the packages apart

### A workspace instead of a shared environment

The repository is a [uv workspace](https://docs.astral.sh/uv/concepts/projects/workspaces/). The root `pyproject.toml` is a virtual root listing only the members (such as `packages/*` and `tools/*`) and the tools used across the repository, such as pre-commit, pip-audit and towncrier. Each package declares its own dependencies, dev group and pyright and pytest settings, while the lint rules are shared through ruff's `extend`.

A single lockfile ensures that all packages resolve to the same versions, yet each package installs only what it declares. Since `uv lock --check` runs in pre-commit and `uv sync --locked` in CI, the lockfile cannot fall out of sync with the `pyproject.toml` files. A workspace is not always the right choice, though. For instance, the uv documentation suggests path dependencies between separate projects when packages need conflicting versions of a dependency or separate environments.

### Boundaries checked by tools

A workspace does nothing to prevent a package from importing the dependencies of another, while agents are remarkably good at finding an import that happens to work. As a result, a rule existing only in the README does not survive for long. Each package is therefore checked by pyright in strict mode, with the layers enforced by [import-linter](https://import-linter.readthedocs.io/) contracts. For instance, the core logic of a package cannot import the HTTP client or the adapters to external services, which allows the core to be tested with fakes and the adapters to be replaced.

Phoebe [moved to Bazel](https://www.phoebe.work/blog/enforcing-architecture-in-an-agent-driven-codebase) partly for this reason, as their agents fixed build errors by loosening the constraints. When the constraint is a contract checked in CI, any loosening shows up in the diff and requires someone's approval.

## Keeping CI fast

### Check what changed and what depends on it

A small, dependency-free tool in the repository reads the workspace graph and determines what has to be checked:

- A change in a package checks that package and every package that depends on it
- A change in a shared file (the lockfile, the root `pyproject.toml`, `.python-version` or the workflows) checks everything
- A change only in the docs or plans checks nothing

Based on this, a matrix is generated with one quality job per package (lint, types and tests), while a single `CI success` job, which counts skipped jobs as passed, serves as the required check. A push to `main` checks everything regardless.

GitHub's `paths` filters and GitLab's `rules:changes` would be simpler, yet they see only the changed files and not the packages depending on them, thus losing the benefit of testing the whole change together.

At the moment a full CI run takes well under two minutes, although with only two packages this proves very little, so ask me again when there are twenty.

## Keeping the agents in line

### Short instructions per package

Claude Code, Codex, Cursor and Copilot all read instruction files arranged in a hierarchy. Claude Code loads the `CLAUDE.md` files from the working directory and its parents at start-up, and a subdirectory's file only once it reads or edits a file there. Codex combines the `AGENTS.md` files from the root down to the working directory, with deeper files taking precedence. Under the [agents.md](https://agents.md/) convention, the file closest to the edited code wins.

This arrangement suits a monorepo, provided the files stay short. The root file should hold pointers and the rules applying to the whole repository, while each package's file holds its own conventions and the exact commands for linting, type checking and running a single test. Anything longer, or needed only occasionally, is better written as a skill, which is loaded only when required. Given the study mentioned above, I prefer to keep these files small. Since the repository does not have them yet, they are the next step, to be added one package at a time.

### Rules as checks, not as instructions

The [Claude Code documentation](https://code.claude.com/docs/en/best-practices) notes that instruction files are guidance, which the model may decide does not apply. Any rule that must always hold should therefore be established as a hook, a permission rule or a CI check.

In `CONTRIBUTING.md`, each rule is listed alongside the tool enforcing it. Pull request titles follow Conventional Commits and every package keeps changelog fragments, both of which are checked in CI. Files larger than 1 MB are rejected by `check-added-large-files`, preventing notebooks with outputs and data exports from creeping back in, while generated code is marked in `.gitattributes` to keep it out of the diffs. As for the agents, a hook can run the type checker before the agent finishes, forcing it to fix its own errors.

### Agents working in parallel

When several agents work on the repository, each is given its own git worktree on its own branch (with `--worktree` in Claude Code, for instance), so that no two of them edit the same checkout. Changes crossing a package boundary are routed to the right reviewer by `CODEOWNERS`, and every change is still reviewed by a person. For instance, Stripe merges more than a thousand pull requests written by agents per week, yet [each one is reviewed by an engineer](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents). As the number of parallel changes grows, a merge queue would help as well, since it tests each change against `main` together with the changes ahead of it.

### Supply chain

Since a single agent with write access can touch everything, the repository itself has to be harder to compromise. Every GitHub Action is pinned to a commit SHA, the workflows run with read-only permissions, and untrusted input reaches the scripts only through environment variables. The workflows are checked by zizmor and actionlint, secrets are searched for by gitleaks, and the lockfile is audited by pip-audit. Dependabot updates are grouped and held back for seven days after a release, thus increasing the likelihood that a compromised version is noticed before it reaches the repository.

## Next steps

Since the repository is new and holds only two packages, the change detection does not save much yet, and whether it works will become clear only once there are many more. The per-package instruction files are still to be added, as are the first services, each of whose Docker images will be built with `uv sync --package` so that it contains only what that service needs.

With a single lockfile, a dependency bump still checks every package. Although this is the right behaviour, it will become slower as the repository grows. At that point remote caching would be worth considering, as would tools like Nx, Bazel or Pants, which handle change detection and caching properly at a much larger scale. For now, about a hundred lines of Python reading the uv workspace graph are sufficient.

<div class="callout">

## So, monorepo or not?

For years my answer was "many repositories", shaped by my experience of the old monorepo. Looking at it again, almost everything that made it slow was a matter of set-up: one environment for everything, boundaries that were only conventions, and a CI unable to tell what a change affected. All of these can be fixed. What cannot be fixed with many repositories is that a change spanning several packages is split up and tested in pieces, which is exactly the kind of change agents make all the time. For now, therefore, I'm betting on the monorepo, and I'll write again once it's big enough to tell whether I was right.

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
