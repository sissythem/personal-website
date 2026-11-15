---
title: A monorepo that works with coding agents
description: Our last monorepo needed 20 minutes of CI on every commit. I'm trying a monorepo again, this time built for working with coding agents.
pubDate: 2026-11-15
tags: [monorepo, ci-cd, ai-agents, python]
draft: true
---

A few years ago, at the company I was working for, we had one big monorepo. Every pull request waited 15 to 20 minutes for CI, a dependency bump could break services nobody had touched, and the repository grew to about a gigabyte. Then we moved to many small repositories, and CI became fast again.

Today most of my code is written together with coding agents, and I started wondering whether a monorepo makes more sense again. So I'm trying it in my own new monorepo, and in this post I go through why the old one was slow, what changes with agents and the practices I'm applying so that the new one doesn't end up the same way.

## Why the old monorepo was slow

The repository had services, shared libraries, machine learning code, notebooks and a frontend, all together. Looking back, the problem wasn't the monorepo itself but the way it was set up.

All the code shared one environment, with every dependency of every project in a single list, from deep learning frameworks to web frameworks. Therefore every developer and every CI job installed everything, even for a small change in one library.

The libraries were meant to be independent, but in practice they weren't. They imported shared code that lived outside of any library, so several of them couldn't be installed or tested on their own, and a library that should be lightweight could end up pulling in heavy dependencies.

CI only checked whether any Python file had changed. If it had, the whole test suite and the type check ran for the whole repository, which took 15 to 20 minutes. The dependency cache was tied to the whole lockfile, so any dependency update, in any part of the repository, started all the jobs from scratch.

Dependencies were also declared in more than one place, e.g. the main lockfile and separate requirements for each service's Docker image, and they drifted apart over time, so we spent time fixing the lockfile instead of working on the product.

Finally, large files ended up in git, such as notebooks with their outputs and data exports. Even after they were deleted, they stayed in the history, which is why the repository kept growing.

Moving to many repositories fixed the CI time, since each repository tests only itself, but it has its own cost. A change in a shared library needs a release and then a bump in every repository that uses it, one merge request at a time. Each repository can be green while the combination is broken, and we only find out with a later bump.

## What changes with coding agents

The monorepo vs multiple repositories question isn't new and the answer usually depends on how often a change crosses the boundaries between packages. With agents, I see two differences.

The first one is what the agent can see. In a separate repository, an agent changing a library doesn't see the code that uses it, so it can't know which callers it breaks. This is easier to solve today, e.g. Claude Code can open other directories with `--add-dir`, or the agent can use a code search tool.

The second one is what a single CI run can test. Ranjan Kumar calls it the [proof perimeter](https://ranjankumar.in/monorepo-vs-polyrepo-ai-coding-agents-proof-perimeter). In a monorepo, the change in the library and the change in its callers go in one pull request and are tested together before merging. With multiple repositories, the same change is split in several pull requests that are merged in order, and each one is tested against older versions of the others. Agents make many more of these cross-cutting changes than people, as the effort doesn't stop them, so this matters more than before.

There are also arguments against it. A [study on `AGENTS.md` files](https://arxiv.org/abs/2602.11988) with 138 tasks found that context files in the repository often lowered the agents' success rate and increased the inference cost by more than 20%, so a big repository with long instructions can make an agent worse. [Faros AI](https://www.faros.ai/blog/monorepo-vs-polyrepo-benchmark-data) measured a median pull request cycle time of 19 hours for teams in monorepos and 2 hours for teams with multiple repositories. They explain it with immature CI and review routing rather than the monorepo itself, which matches our experience, but it's still a risk. Lastly, a single commit, or a single agent with write access, can touch everything.

My new monorepo is a side project where I'm building AI agents, with a few Python packages and tools, and below are the practices I'm applying to it.

## The practices

### 1. A workspace instead of a shared environment

The repository is a [uv workspace](https://docs.astral.sh/uv/concepts/projects/workspaces/). The root `pyproject.toml` is a virtual root, which only lists the members (e.g. `packages/*` and `tools/*`) and the tools used across the repository, e.g. pre-commit, pip-audit and towncrier. Each package has its own dependencies, dev group and pyright and pytest settings, and the lint rules are shared through ruff's `extend`.

There is one lockfile, so all packages resolve to the same versions, but each package installs only what it declares. `uv lock --check` runs in pre-commit and `uv sync --locked` in CI, so the lockfile can't get out of sync with the `pyproject.toml` files. A workspace isn't always the right choice though. The uv documentation suggests path dependencies between separate projects when packages need conflicting versions of a dependency or separate environments.

### 2. Boundaries checked by tools

A workspace doesn't stop a package from importing the dependencies of another package, and agents are quite good at finding an import that works. Therefore a rule that is only written in the README doesn't last long. Each package runs pyright in strict mode and [import-linter](https://import-linter.readthedocs.io/) contracts check the layers, e.g. the core logic of a package can't import the HTTP client or the adapters to external services, so that the core is tested with fakes and the adapters can be replaced.

Phoebe [moved to Bazel](https://www.phoebe.work/blog/enforcing-architecture-in-an-agent-driven-codebase) partly for this reason, as their agents fixed build errors by loosening the constraints. When the constraint is a contract checked in CI, loosening it shows up in the diff and someone has to approve it.

### 3. CI for what changed and what depends on it

A small tool in the repository, with no dependencies, reads the workspace graph and decides what to check:

- A change in a package checks that package and every package that depends on it
- A change in a shared file (the lockfile, the root `pyproject.toml`, `.python-version` or the workflows) checks everything
- A change only in the docs or plans checks nothing

It creates a matrix with one quality job per package (lint, types and tests), and a single `CI success` job is the required check, which counts the skipped jobs as passed. A push to `main` checks everything anyway.

GitHub's `paths` filters and GitLab's `rules:changes` would be simpler, but they only see the changed files and not the packages that use them, so we would lose the benefit of testing the whole change together.

At the moment a full CI run takes 25 to 90 seconds and the quality job of a package 12 to 29 seconds. With only two packages this doesn't prove much, so I'll see if it stays fast as the repository grows.

### 4. Short instructions for the agents per package

Claude Code, Codex, Cursor and Copilot all read instruction files in a hierarchy. Claude Code loads the `CLAUDE.md` files from the working directory and its parents at start-up, and a subdirectory's file only when it reads or edits a file there. Codex combines the `AGENTS.md` files from the root down to the working directory, where the deeper files take precedence, up to 32 KiB by default. Based on the [agents.md](https://agents.md/) convention, the file closest to the edited code wins.

This fits a monorepo, as long as the files are short. The root file should have pointers and the rules for the whole repository, and the file of each package its own conventions and the exact commands for linting, type checking and running a single test. Anything longer or used occasionally can be a skill, which is only loaded when needed. Given the study above, I prefer to keep these files small. The repository doesn't have them yet, so this is the next step, one package at a time.

### 5. Rules as checks

The [Claude Code documentation](https://code.claude.com/docs/en/best-practices) notes that the instruction files are guidance, which the model may decide doesn't apply. If a rule must always hold, it should be a hook, a permission rule or a CI check.

In `CONTRIBUTING.md` each rule is listed with the tool that enforces it. Pull request titles follow Conventional Commits and each package has changelog fragments, both checked in CI. `check-added-large-files` rejects files larger than 1 MB, so that notebooks with outputs or data exports can't be added again, and the generated code is marked in `.gitattributes` to keep it out of the diffs. For the agents, a hook can run the type checker before the agent finishes, so that it fixes its own errors.

### 6. Agents working in parallel

When several agents work on the repository, each one gets its own git worktree on its own branch (e.g. with `--worktree` in Claude Code), so they don't edit the same checkout. `CODEOWNERS` sends changes that cross a package boundary to the right reviewer, and every change is still reviewed by a person. Stripe merges more than a thousand pull requests written by agents per week, and [each one is reviewed by an engineer](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents). As the number of parallel changes grows, a merge queue would also help, since it tests each change against `main` together with the changes ahead of it.

### 7. Supply chain

Every GitHub Action is pinned to a commit SHA, the workflows have read-only permissions and untrusted input reaches the scripts only through environment variables. zizmor and actionlint check the workflows, gitleaks looks for secrets and pip-audit runs on the lockfile. Dependabot updates are grouped and wait seven days after a release, so that a compromised version is more likely to be noticed before it reaches the repository.

## Next steps

The repository is new and has only two packages, so the change detection doesn't save much yet. I'll know if it works when there are many more. I also want to add the instruction files of point 4 and the first services, building each Docker image with `uv sync --package` so that it only contains what that service needs.

Since there is one lockfile, a dependency bump still checks every package. That's the right behaviour, but it will get slower as the repository grows. At that point I'd look at remote caching, or at tools like Nx, Bazel or Pants, which do change detection and caching properly at a much larger scale. For now, about a hundred lines of Python reading the uv workspace graph are enough.

## Conclusion

Our old monorepo wasn't slow because it was a monorepo, but because everything shared one environment, the boundaries were only conventions and CI couldn't tell what a change affected. With agents it's more useful to keep a change in one place and test it together, so I think it's worth fixing these issues rather than avoiding monorepos altogether.

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
