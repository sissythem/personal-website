---
title: Code review is the new bottleneck
description: Coding agents made writing code cheap, so the time moved to reviewing it. This is the tiered AI review I designed so that people only read the merge requests that need them.
pubDate: 2026-11-22
tags: [code-review, ai-agents, ci-cd]
draft: false
cover: ../../assets/covers/ai-code-review-bottleneck.png
coverAlt: "Before and after diagram: on the left, five merge requests all wait in one queue for human review; on the right, AI triage splits them into simple ones, reviewed by a fast model and merged automatically, and complex ones, reviewed in depth with the author deciding whether a person reads them too."
---

Since most of my code is now written with coding agents, opening a merge request takes a fraction of the time it used to. Reviewing one, however, takes exactly as long as before, so the time saved while writing the code is now spent waiting for someone to read it. As a result, the slowest part of shipping a change is no longer writing it but getting it reviewed.

This is not a problem specific to my team. Anthropic [reports](https://claude.dev/blog/solving-code-review-at-anthropic/) that the changes landing in its monorepo grew from about 2,500 a day in May 2026 to more than 30,000 in September, and its [playbook for agent-driven development](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) starts from the observation that "code is no longer the bottleneck". Whatever still runs at human speed becomes the new bottleneck, and code review is the biggest part of it.

The effect is easy to recognise. Merge requests queue up waiting for a reviewer, while their authors move on to the next change and lose the context of the previous one. Reviewers, faced with more diffs than they can read properly, either become the slowest step of every delivery or start skimming, approving changes nobody has really read. Neither is sustainable, and adding an AI reviewer that comments on every change does not fix it on its own, since a person still has to read both the code and the comments. What follows is how I approached it for my team, with a tiered review in which an AI reviews every merge request and people read only the ones that really need them.

## How review became the bottleneck

Code review always had two jobs: catching problems before they reach production, and spreading knowledge, since reading each other's changes is how a team learns the parts of the system it didn't write. Both still matter, yet the cost behind them has changed. When a change took a day to write, half an hour of reading it was a reasonable price. When it takes an agent ten minutes, that same half hour becomes most of its cost, while every engineer now opens several merge requests a day.

An AI reviewer commenting on every merge request is the obvious answer, yet on its own it does not help much. A reviewer that sees only the diff cannot check a change against the systems around it, such as a workflow against the platform running it or a service against its deployment files, and unless it knows the team's standards, it rarely has anything to say about the design of the code. More importantly, a person still has to read both the code and the comments, so the queue stays exactly where it was.

The goal was therefore to stop people from reviewing simple merge requests, while making sure that complex ones still got a thorough review, and to spend in proportion to the risk: a fast model for simple changes and an advanced one for complex changes.

## How it works

The idea is simple. When a merge request is opened, or marked ready after being a draft, a small GitLab app picks it up and first works out how risky it is. Based on the answer, it puts the merge request in one of two tiers, simple or complex, and starts a coding agent to review it. If the reviewer finds nothing wrong with a simple merge request, it approves it and merges it once the pipeline passes, so nobody has to read it. A complex merge request gets a deeper review and, even when nothing is found, it is approved but never merged automatically, so its author decides whether a colleague should look at it too. Whenever something is found, the reviewer posts it as threads on the merge request, just as a person would, and approves nothing.

The first step, working out how risky a change is, is done by a System One model, such as [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev). Unlike a language model, it doesn't generate text. It reads a short description of the change and answers four questions about it: how much effort reviewing it needs, how risky it is, whether it could go through the safe lane, and whether it is in a clean state. Rather than a single answer, it returns how likely each option is, which matters more than the answers themselves, since a merge request the model is unsure about can simply be treated as complex. Dependency updates skip this step altogether, as another bot already approves them.

The model, however, does not decide the tier. That is done by a few lines of code that anyone can read: a merge request counts as simple only if the model is at least 80% sure that it needs little effort, carries little risk and fits the safe lane, if it doesn't touch workflows, external writes, authentication or secrets, migrations, dependency manifests or anything the repository marks as sensitive, and if it changes fewer than 200 lines. Changes to CI configuration and Dockerfiles can still be simple, since the pipeline tests them itself: a broken pipeline fails, and a broken Dockerfile is caught by the image build or the integration tests. Everything else is complex, and so is any merge request the model couldn't assess, so a failure never takes the cheaper path. A person can always push a merge request into the complex tier with a label, yet deliberately there is no label for the opposite.

The review itself is done by a coding agent, such as Claude Code or Codex, rather than by sending the diff to a model, since a model that sees only the diff can only comment on the diff. An agent can read the rest of the repository, find the callers of a function and check the history before raising anything, and it already knows our standards from the plugins the team uses every day. Simple merge requests get a fast model looking at the repository, while complex ones get an advanced model with access to the repositories they depend on, followed by a cheaper model whose only job is to throw away false positives.

Each review is split into a few smaller reviewers, one per concern: whether the code does what the description says, correctness, tests, standards, design, behaviour under retries, and, for complex merge requests, how the change fits the architecture and the rest of the codebase. Apart from the first one, none of them sees the description or the ticket, so they judge the code rather than the author's account of it. Their instructions come from reviewing a lot of code written by agents. For instance, a test that cannot fail, or that only checks a mock, counts as a finding, and for every test the reviewer has to name a bug it would not catch.

The check I care about most, though, is coherence. Many changes can each look fine on their own, yet together leave three ways of doing the same thing, so that every later change needs more context and work slows down. The coherence check therefore flags a merge request that adds a second way of doing something the codebase already does, starts a migration without finishing the previous one, or works around complexity it could have removed. Annoyingly, small changes do this as often as large ones, so simple merge requests get a lighter version of it too.

Since the AI can now approve and merge, the model itself is never trusted with that decision. It only suggests findings, while a plain piece of code checks them, decides whether to approve and does every write to GitLab, so the model never holds a token that could merge anything. That code also leaves a note on every merge request with the tier, how confident the model was, which model reviewed it and the outcome, so there is always a record of why something was approved. An approval also needs every thread opened by a person to be resolved, so the AI can never override a colleague, and it is removed as soon as new commits are pushed.

The biggest risk is someone, or some agent, writing text in the diff that is meant for the reviewer, to hide a finding and get a change through. The rules the model cannot influence, such as sensitive paths and the size limit, already restrict what can be simple, while every merge request is also scanned for text aimed at the reviewer, and a hit blocks the AI approval. Finally, a review that fails, times out or returns nonsense is never treated as an approval, and the merge request simply waits for a person.

## What Anthropic does differently

Shortly after I wrote the proposal, Anthropic described [how the Claude Code team reviews its own code](https://claude.dev/blog/solving-code-review-at-anthropic/), and it was reassuring to see how much overlapped. They layer several checks rather than relying on one, set the risk tier from the change and not from who wrote it, [read the reviewer's instructions from the base branch](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/) so that a change cannot rewrite its own rules, and turn past incidents and reverts into a test set for the reviewer.

The differences, however, are worth thinking about. For them, an agent's approval never counts as a person's, whereas in our design an AI approval is enough for simple merge requests, although complex ones are never merged automatically. They also found that one well-tuned reviewer often does better than adding a second, more expensive one, while our complex tier adds a verification pass, which our benchmark will have to justify. Finally, they limit the number of review rounds, after one of their pull requests went through more than fifty rounds overnight. We have no such limit yet, and their numbers make a strong case for adding one before we roll out.

## Trade-offs and next steps

The rollout is staged so that each step produces evidence for the next. The reviewer will first run in shadow mode on a few repositories, storing its findings next to those of the existing reviewer and the comments left by people, and will be benchmarked on past merge requests linked to the fixes, reverts and incidents that followed them. Only then will it comment, then approve while people still merge, and finally merge simple changes on its own, once almost no merge request triaged as simple turns out to be complex when a person looks at it.

The trade-off I worry about most is the second job of review. A team that stops reading simple changes also stops learning from them, and nothing in this design gives that back on its own. Anthropic's answer is to ask the agent for an explainer of the code you are about to change, which works only if people actually ask. For us, shared understanding will have to be built on purpose, through design discussions and through colleagues still reviewing the core logic of every feature.

The other trade-off is cost, since every merge request other than a dependency update now gets reviewed. Turn caps, timeouts, incremental reviews and skipping rebases with an unchanged diff should keep it bounded, and since every run records what it cost, the defaults will be set from real data rather than guesses.

<div class="callout">

## What I took away

When I started, I thought the problem was finding a better AI reviewer. In hindsight, the reviewer is the easy part. The hard question is deciding which changes nobody needs to read, and who is accountable when one of them breaks, which is as much a question about the team as about the model. I expect the line between simple and complex to keep moving as the reviewer earns trust, which is exactly why the rule drawing it should stay small enough for anyone to read.

</div>

## References

- [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/), Addy Osmani, Morgan Westlee Lunt and Qing Wang, Anthropic
- [How the Claude Code team thinks about verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/), Addy Osmani, Anthropic
- [Introducing System One models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), TypeSafe
- [The AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook), Louis Claxton, Anthropic
