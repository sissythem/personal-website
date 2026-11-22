---
title: Code review is the new bottleneck
description: Coding agents made writing code cheap, so the time moved to reviewing it. This is the tiered AI review I designed to give human attention to the changes that need it.
pubDate: 2026-11-22
tags: [code-review, ai-agents, ci-cd]
draft: true
---

Most of my code is now written by coding agents, as is a growing share of my team's. Writing a change has become cheap, yet reading it has not, so the time saved on one side of the merge request has reappeared on the other. Merge requests wait for a reviewer, while the person who opened them moves on to the next one.

We are not alone in this. Anthropic reports that the changes landing in its monorepo went from about 2,500 a day in May 2026 to more than 30,000 in September, and its playbook for agent-driven development opens with the observation that "code is no longer the bottleneck". The bottleneck has moved to the steps that still run at human speed, and review is the largest of them.

Since October I have been designing a tiered AI review for our merge requests. The proposal was accepted in October and is being built now, so what follows is a design rather than a result. Nothing below has run in shadow mode yet, and I will write again once it has.

## Why review became the bottleneck

Review used to have two jobs. The first is catching problems before they ship. The second is spreading knowledge: by reading each other's changes, a team learns how the system fits together. Both still matter, yet the economics behind them have changed. When a person wrote a change in a day, half an hour of reading it was a fair price. When an agent writes it in ten minutes, the same half hour is most of the cost, and every engineer can now open several changes a day.

We already had an AI reviewer, a hosted service commenting on every merge request, and it showed the limits of the obvious answer. It was rate limited, so on one of our busiest repositories almost a quarter of merge requests hit the limit and roughly one in six received no review at all. About a third of its reviews were automated dependency updates, on which it had posted no findings across more than a hundred merged changes. It saw only the diff, so it could not check a workflow against the platform it runs on, or a service against its deployment files. It also knew nothing about our standards, and I had never seen it suggest an improvement to the design of the code.

Meanwhile, people were still spending time on merge requests that did not need it, and on some of them the AI reviewer was already the only approval. That happened without any rule about which changes qualified and without an audit trail. Since our compliance obligations expect every change to be reviewed, silent gaps were a problem in their own right.

So the goal was set as follows: people stop reviewing simple merge requests, while complex ones get a review at least as good as the one we had. Spending should follow risk, with a fast model for simple changes and an advanced one for complex changes.

## The design in one picture

Every merge request goes through the same steps. Automated dependency updates are skipped entirely, since another bot already approves them. Everything else is triaged, given a tier, reviewed by the model matching that tier, and either approved or answered with findings:

- **Simple:** a fast model reviews the diff and the repository. If it finds nothing blocking, the merge request is approved and set to merge automatically once its pipeline passes.
- **Complex:** an advanced model reviews the diff, the repository and the repositories it depends on, followed by a verification pass with a cheaper model to drop false positives. If nothing blocking is found, the merge request is approved, yet never merged automatically. The author decides when to merge and whether to ask a colleague.
- **Findings in either tier:** they are posted as threads on the merge request, and nothing is approved.

The interesting parts are the decisions behind those steps.

## What made it work, on paper

### Triage is classification, not generation

We already had a tool that triaged merge requests with a single free-text call to a language model. Triage, however, is a classification problem, so it was moved to a small classification model, which reads a compact description of the change and a set of typed questions, and returns a probability for every possible answer instead of generating text. Four questions are asked for each merge request: how much review effort it needs (light, normal or deep), how risky it is (low, medium or high), whether it is a candidate for the safe lane, and whether its current state is clean or challenged.

The probabilities are the point. Rather than trusting a single label, a merge request whose answers are uncertain is sent to the complex tier. It also gives us a number for "how confident are we in this risk level?" on every merge request, which can be checked against labels set by people.

### The tier is decided in code

The model's answers are inputs, not a decision. A merge request is simple only if all of the following hold, and complex otherwise:

- light effort, low risk and a "yes" for the safe lane, each with a probability of at least 0.8 by default, to be tuned from a benchmark
- no changes to workflows, external writes, CI configuration, Dockerfiles, authentication or secrets, migrations, dependency manifests or any path a repository declares as sensitive
- fewer than 200 changed lines by default, lockfiles excluded

A missing, degraded or oversized triage result is always treated as complex, so a failure never leads to the cheaper path. Draft merge requests are not reviewed until they are marked ready, since nothing should approve unfinished work. A person can force the complex tier or skip AI review with a label, yet there is deliberately no label forcing the simple tier.

### The model proposes, code approves

The reviewer only proposes findings. A separate, deterministic step validates them, decides whether to approve and performs every write to GitLab, which means the model never holds a write token and never decides an approval. That step also writes a summary note recording the tier, the triage probabilities, the reviewer model, the reviewed commit and the outcome, which doubles as the audit trail we were missing.

Several rules protect the approval. It requires that no thread opened by a person is unresolved, since the AI must not override a colleague's concern. Projects drop all approvals when new commits are pushed. If a rebase leaves the diff unchanged and the target branch touched none of the changed files, the approval is restored without a new review; otherwise only the new commits are reviewed.

### The reviewer is an agent, and it doesn't read the description

A model given only a diff can only comment on what it is shown. An agent such as Claude Code or Codex can read the rest of the repository, search for callers and check the history before raising a finding, and it carries our standards through the plugins the team already uses. Each review therefore runs as a short-lived job in Kubernetes, with read-only tools and cost limits.

Inside it, each dimension of the review is a focused subagent: intent, correctness, tests, standards, design, behaviour under retries when workflows or external writes change, and, for complex merge requests, architecture and coherence. Each one receives the diff and its own rubric, but not the merge request description or the ticket, so it checks the code rather than the author's account of it. Only the intent check compares the two, by listing every behaviour the diff changes and then reading the description.

### Rules for code written by agents

The rubrics name the problems I see most often in merge requests written by agents. Tests should be in proportion to the behaviour changed, one per rule, and a test that cannot fail, or only asserts on a mock, is a finding. For each test the reviewer has to name a one-line bug that it would not catch. Documentation contradicting itself or the code is a finding, as is history written into comments, such as "used to" or a ticket number. On complex changes, every new option or mode needs a user today, whether a caller, a configuration or a test.

The check I care about most is coherence. Many changes can each look fine on their own, yet together leave several ways of doing the same thing, so every later change needs more context and work slows down. The coherence check flags a merge request that adds a second way of doing something the codebase already does, starts a migration without finishing it, relies on undocumented assumptions about another module, or works around complexity it could remove. Since small changes add second ways as often as large ones, simple merge requests get a lighter version of the same check.

### Context from other repositories, cheaply

Complex reviews receive context from the repositories a change depends on, which is where I expect to beat a reviewer that sees only the diff. Each repository declares its context in a file read from the target branch, so a merge request cannot widen its own context. To keep the cost down, an entry applies only when certain paths change, only the architecture and coherence checks receive it, and each starts from a short card per repository describing its purpose, public contracts and conventions, cached by commit. Raw code is read only when the card is not enough. When a public interface changes, the architecture check lists the repositories that would break.

### A service, not a CI job

The first version of the proposal ran the review as CI jobs, and the feedback from colleagues identified three problems with it. A CI job reruns on every push, including rebases, thus wasting tokens. It cannot see changes that arrive without a push, such as a resolved thread or a draft marked ready. Finally, merge request pipelines run the configuration from the merge request's own branch, so they cannot hold protected keys. The reviewer was therefore turned into a small GitLab app, which reviews when a merge request is opened or marked ready, and again only when the diff changes or someone mentions it.

### Prompt injection

Once the AI can approve and merge, the main risk is text in the diff aimed at the reviewer. The model returns only findings and probabilities, so it cannot grant an approval directly, yet an injection could hide a finding and let a simple merge request through. The rules the model cannot influence, such as sensitive paths and size, limit which changes can be simple, while the app also scans every merge request for text addressed to the reviewer, and a hit blocks the AI approval. A failed, timed-out or malformed review is never approved, a secret scan runs before every model call, and if the reviewer fails, the merge request waits for a person instead of being blocked.

## How Anthropic does it, and where we differ

Anthropic has since described how the Claude Code team reviews its own code, and the overlap is reassuring. They layer checks rather than relying on any single one, set the risk tier from the change and not from its author, read the reviewer's instructions from the base branch so that a change cannot alter its own judge, and turn past incidents and reverts into an evaluation set for the reviewer.

There are three differences worth noting. First, an agent's approval never counts as a person's approval for them, whereas in our design an AI approval is accepted as the review of record for simple merge requests, although complex ones are never merged automatically. Second, they found that a single, well-tuned reviewer often does better than stacking a second, more expensive one, whereas our complex tier adds a verification pass, which the benchmark will have to justify. Third, they cap the number of review rounds after one of their pull requests went through more than fifty rounds overnight. We have no cap yet, and their numbers make a strong case for adding one before the rollout.

Their answer to review's second job is also worth borrowing. Instead of reading trivial diffs line by line, people ask the agent for an explainer of the part of the code they are about to change. That replaces the knowledge sharing we lose when people stop reading simple merge requests, provided someone actually asks.

## How we will know if it works

The rollout is staged so that every step produces evidence before the next one:

1. Run in shadow mode on three pilot repositories. Findings and the would-be approval are stored next to the existing reviewer's comments and the comments left by people, which gives recall against both and the issues only one of them caught.
2. Benchmark on a labelled set of past merge requests, each linked to the fixes, reverts and incidents that followed it, with the labels checked by a person.
3. Post findings as comments, then approve while people still merge everything.
4. Enable automatic merging for simple merge requests only once the false-simple rate is close to zero.

The false-simple rate, the share of merge requests triaged as simple that a person would label complex, is the number that gates everything else. The others are the share of merge requests merged without a human review, the share of findings that lead to a code change, the incidents and reverts traced back to an AI-approved merge request, and the cost per tier against the bill of the reviewer we have today.

## Trade-offs and next steps

The biggest trade-off is the one Anthropic's numbers can hide. A team that stops reading simple changes stops learning from them, and nothing in this design gives that back automatically. Shared knowledge now has to be built on purpose, through design discussions, explainers and colleagues reviewing the core logic of every feature.

The second is cost. Every merge request other than a dependency update now gets a review, which costs more tokens than reviewing only the deep ones, even though that is exactly what saves human time on the simple ones. Turn caps, timeouts, caching, incremental reviews and skipping rebases with an unchanged diff are meant to keep it bounded, and each run records its cost so the defaults can be set from real data rather than guesses.

Finally, normal-effort merge requests are treated as complex for now. If the advanced model proves too expensive for them, a middle tier can be added later.

<div class="callout">

## If you only do one thing

Let code, not the model, decide which changes are simple. A model is good at estimating how risky a change looks, and the probabilities it returns are useful, yet the rule that turns them into "no person needs to read this" should be a few lines anyone can review, with sensitive paths, a size cap and a default of "complex" whenever anything is uncertain.

</div>

## References

- [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/), Addy Osmani, Morgan Westlee Lunt and Qing Wang, Anthropic
- [How the Claude Code team thinks about verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/), Addy Osmani, Anthropic
- [The AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook), Louis Claxton, Anthropic
