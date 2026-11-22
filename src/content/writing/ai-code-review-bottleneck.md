---
title: Code review is the new bottleneck
description: Coding agents made writing code cheap, so the time moved to reviewing it. This is the tiered AI review I designed so that people only read the merge requests that need them.
pubDate: 2026-11-22
tags: [code-review, ai-agents, ci-cd]
draft: true
---

Since most of my code is now written with coding agents, opening a merge request takes a fraction of the time it used to. Reviewing one, however, takes exactly as long as before, so the time saved while writing the code is now spent waiting for someone to read it. As a result, the slowest part of shipping a change is no longer writing it but getting it reviewed.

This is not a problem specific to my team. Anthropic [reports](https://claude.dev/blog/solving-code-review-at-anthropic/) that the changes landing in its monorepo grew from about 2,500 a day in May 2026 to more than 30,000 in September, and its [playbook for agent-driven development](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) starts from the observation that "code is no longer the bottleneck". Whatever still runs at human speed becomes the new bottleneck, and code review is the biggest part of it.

One way out is a tiered review, in which an AI reviews every merge request and people read only the ones that really need them. This post describes the one I designed for my team: why adding an AI reviewer was not enough on its own, how it decides which changes are simple enough to skip a person, and how it compares with the way Anthropic reviews its own code.

## How review became the bottleneck

Code review always had two jobs: catching problems before they reach production, and spreading knowledge, since reading each other's changes is how a team learns the parts of the system it didn't write. Both still matter, yet the cost behind them has changed. When a change took a day to write, half an hour of reading it was a reasonable price. When it takes an agent ten minutes, that same half hour becomes most of its cost, while every engineer now opens several merge requests a day.

We already had an AI reviewer commenting on every merge request, and in hindsight it showed why adding one is not enough. It was rate limited, so on one of our busiest repositories almost a quarter of merge requests hit the limit and roughly one in six received no review at all. About a third of its reviews were dependency updates, on which it had not posted a single finding across more than a hundred merged changes. Since it only saw the diff, it couldn't check a workflow against the platform running it, or a service against its deployment files, and as it knew nothing about our standards, I never saw it suggest a better design for any piece of code.

At the same time, people were still reading merge requests that didn't need them, while on others the AI was already the only approval, without any rule about which changes qualified and without any record of why. For a company whose compliance commitments expect every change to be reviewed, that was a problem in itself.

The goal was therefore to stop people from reviewing simple merge requests, while making sure that complex ones got a review at least as good as the one we had, and to spend in proportion to the risk: a fast model for simple changes and an advanced one for complex changes.

## The first version, and why it changed

The first version of the proposal ran the review as a job in each repository's CI pipeline, which seemed the obvious place for it. Colleagues pointed out three problems with that in the review of the proposal, and they were right. A CI job runs on every push, rebases included, which spends tokens on the same diff again and again. It cannot react to anything that happens without a push, such as a thread being resolved or a draft being marked ready. Finally, merge request pipelines run the configuration of the merge request's own branch, so they cannot be trusted with protected keys. The reviewer was therefore moved into a small GitLab app, which reviews a merge request when it is opened or marked ready, and again only when its diff changes or someone mentions it.

Around the same time, a product manager suggested going further than I had planned, and letting the AI approve and merge small, low-risk changes on its own instead of only commenting on them. I liked that approach better than mine, so the proposal was updated, and most of the design follows from the question it raises: how do you decide which changes nobody needs to read?

## How it works

Dependency updates are skipped entirely, since another bot already approves them. Every other merge request is first triaged by a small classification model.

We already had a tool that triaged merge requests with a single free-text call to a language model, yet triage is a classification problem, so the new model reads a compact description of the change and answers four typed questions: how much review effort it needs, how risky it is, whether it is a candidate for the safe lane, and whether its current state is clean or challenged. Instead of a label, it returns a probability for every possible answer, which is the most useful part, since an uncertain answer can simply send the merge request down the cautious path.

The model, however, does not decide anything. The tier is decided by a few lines of code, which anyone can read, and a merge request counts as simple only if it needs light effort, carries low risk and is a safe-lane candidate, each with a probability of at least 0.8, if it touches no workflows, external writes, authentication or secrets, migrations, dependency manifests or paths the repository marks as sensitive, and if it changes fewer than 200 lines, lockfiles excluded.

Changes to CI configuration and Dockerfiles can still be simple, since the pipeline tests them itself: a broken pipeline fails, and a broken Dockerfile is caught by the image build or the integration tests. Anything else is complex, and so is any merge request whose triage is missing, degraded or too large, so a failure never leads to the cheaper path. A person can force a merge request into the complex tier with a label, yet deliberately there is no label forcing the simple one.

Simple merge requests are reviewed by a fast model, which sees the diff and the repository. If it finds nothing blocking, the merge request is approved and merged automatically once its pipeline passes. Complex merge requests are reviewed by an advanced model with context from the repositories they depend on, followed by a cheaper model whose only job is to drop false positives. If nothing blocking is found, the merge request is approved, yet never merged automatically, leaving its author to decide when to merge and whether to ask a colleague as well.

In both tiers the reviewer is a coding agent, such as Claude Code or Codex, rather than a single call to a model, because a model shown only a diff can only comment on the diff. An agent can read the rest of the repository, look for the callers of a function and check the history before raising anything, and it already knows our standards from the plugins the team uses every day.

Each review runs as a short-lived job in Kubernetes, with read-only tools and a cost limit, and is split into subagents, one per concern: intent, correctness, tests, standards, design, behaviour under retries when workflows change, and, on complex merge requests, architecture and coherence. Apart from the intent check, whose job is to compare what the diff does with what the description claims, none of them is shown the description or the ticket, so they judge the code and not the author's account of it.

The rubrics come from reviewing a lot of code written by agents. Tests have to be in proportion to the behaviour changed, and a test that cannot fail, or that only asserts on a mock, is a finding, while for every test the reviewer has to name a one-line bug it would not catch. Documentation contradicting the code is a finding, and so is history written into comments, such as "used to" or a ticket number.

The check I care about most, however, is coherence. Many changes can each look fine on their own, yet together leave three ways of doing the same thing, so that every later change needs more context and work slows down. The coherence check therefore flags a merge request that adds a second way of doing something the codebase already does, starts a migration without finishing the last one, or works around complexity it could have removed. Annoyingly, small changes do this as often as large ones, so simple merge requests get a lighter version of it too.

Since the AI can now approve and merge, the model is never trusted with the decision itself. It only proposes findings, while a deterministic step validates them, decides whether to approve and performs every write to GitLab, so the model never holds a write token. That step also writes a note with the tier, the triage probabilities, the model, the reviewed commit and the outcome, which finally gives us the record we were missing. An approval needs every thread opened by a person to be resolved, so the AI can never override a colleague's concern, and it is dropped whenever new commits are pushed.

The biggest risk is text in the diff written for the reviewer rather than for people, which could hide a finding and let a simple change through. Sensitive paths and the size cap, which the model cannot influence, limit what can be simple, while every merge request is also scanned for text addressed to the reviewer, and a hit blocks the AI approval. A review that fails, times out or returns something malformed is never approved, and the merge request simply waits for a person.

## What Anthropic does differently

Shortly after I wrote the proposal, Anthropic described [how the Claude Code team reviews its own code](https://claude.dev/blog/solving-code-review-at-anthropic/), and it was reassuring to see how much overlapped. They layer several checks rather than relying on one, set the risk tier from the change and not from who wrote it, [read the reviewer's instructions from the base branch](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/) so that a change cannot rewrite its own rules, and turn past incidents and reverts into a test set for the reviewer.

The differences, however, are worth thinking about. For them, an agent's approval never counts as a person's, whereas in our design an AI approval is enough for simple merge requests, although complex ones are never merged automatically. They also found that one well-tuned reviewer often does better than adding a second, more expensive one, while our complex tier adds a verification pass, which our benchmark will have to justify. Finally, they limit the number of review rounds, after one of their pull requests went through more than fifty rounds overnight. We have no such limit yet, and their numbers make a strong case for adding one before we roll out.

## Trade-offs and next steps

The rollout is staged so that each step produces evidence for the next. The reviewer will first run in shadow mode on three repositories, storing its findings next to those of the existing reviewer and the comments left by people, and will be benchmarked on past merge requests linked to the fixes, reverts and incidents that followed them. Only then will it comment, then approve while people still merge, and finally merge simple changes on its own, once almost no merge request triaged as simple turns out to be complex when a person looks at it.

The trade-off I worry about most is the second job of review. A team that stops reading simple changes also stops learning from them, and nothing in this design gives that back on its own. Anthropic's answer is to ask the agent for an explainer of the code you are about to change, which works only if people actually ask. For us, shared understanding will have to be built on purpose, through design discussions and through colleagues still reviewing the core logic of every feature.

The other trade-off is cost, since every merge request other than a dependency update now gets reviewed. Turn caps, timeouts, incremental reviews and skipping rebases with an unchanged diff should keep it bounded, and since every run records what it cost, the defaults will be set from real data rather than guesses.

<div class="callout">

## What I took away

When I started, I thought the problem was finding a better AI reviewer. In hindsight, the reviewer is the easy part. The hard question is deciding which changes nobody needs to read, and who is accountable when one of them breaks, which is as much a question about the team as about the model. Two of the biggest changes to the design came from colleagues rather than from me: running it as an app instead of a CI job, and letting it merge simple changes at all, which wasn't in my first draft. I expect the line between simple and complex to keep moving the same way, once the benchmark and the first months in shadow mode show us where it should really be.

</div>

## References

- [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/), Addy Osmani, Morgan Westlee Lunt and Qing Wang, Anthropic
- [How the Claude Code team thinks about verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/), Addy Osmani, Anthropic
- [The AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook), Louis Claxton, Anthropic
