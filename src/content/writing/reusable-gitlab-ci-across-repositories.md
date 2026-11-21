---
title: Reusable GitLab CI across many repositories
description: Shared CI templates included from main broke every repository at once. Moving them to versioned CI/CD catalog components, with the logic in a tested CLI, fixed most of it.
pubDate: 2026-11-16
tags: [gitlab, ci-cd, python]
draft: false
cover: ../../assets/covers/reusable-gitlab-ci-across-repositories.png
coverAlt: "Before and after diagram: on the left, five repositories include CI templates from main and all their pipelines fail; on the right, they are pinned to versions v3.2.0 to v3.4.0 and all pass."
---

Our CI templates started small, yet over time more and more logic accumulated inside the YAML files, as bash and Python, with the same logic copied across several of them. Whenever something changed in our internal tools, even the version of an internal package, the bash or Python had to be updated in every YAML file relying on it. Often one copy was missed, with the omission discovered only when a pipeline failed.

In my [previous post](/writing/monorepo-with-coding-agents) I described how, at work, one large monorepo was split into many small repositories on GitLab. Although CI became fast again, every repository still needs a pipeline, and most of them need the same one: lint, tests, a changelog check, an image build, a deploy and a check that the deploy is live. Since nobody wants to copy that into a hundred `.gitlab-ci.yml` files, the pipelines were shared through a repository of YAML templates.

Over the last few months that repository has been replaced with components in the GitLab CI/CD catalog, while the logic has been moved out of YAML into a typed CLI. The catalog turned out to be the smaller part of the change.

## How the old templates were shared

The old repository contained more than 50 YAML files, grouped by language and project type (Python libraries, Python services, Go services, Temporal workers and frontends, among others). A repository consumed them with `include:`, pointing at a project and a file:

```yaml
include:
  - project: my-group/ci/templates
    ref: main
    file: python/.libraries.yml
```

Some repositories included a single entry file, which in turn included the rest. Others picked five or six of the smaller files themselves, such as lint, unit tests, coverage and the version check for Go. This is the standard way of sharing CI in GitLab, and it serves a handful of repositories well. As the number grew, however, several problems emerged.

The first was versioning, or rather its absence. Since the templates repository had no tags at all, `main` was included everywhere. As a result, any change to a template reached every pipeline in the company the next time it ran, without the possibility of testing it beforehand or of keeping a repository on the old behaviour. The history contains the commits one would expect, such as "drop debug echo that broke generated child pipeline YAML" and a few plain reverts.

The second was the bash, which is the part I disliked most. The jobs did real work: they compared versions, created tags, built changelogs, pushed commits with a retry loop, checked that images existed in the registry, posted comments on merge requests and waited for Argo CD. All of it was written inline in the YAML, as bash with `awk`, `sed`, `jq` and some Python heredocs. The same logic had been written a second time, slightly differently, for Python and for Go, which is why any change to one of our internal tools meant hunting down every copy. None of it was tested, and the only way to run it was to push a commit and wait for the pipeline.

The third was the interface. A template was configured through global CI variables such as `PYTHON_VERSION` or `CHANGELOG_ENABLED`. Nothing listed which variables a template read, a typo was silently ignored, causing the job to run with the default, while two included files could read the same variable for different purposes.

Finally, the runner image was versioned separately from the templates. A job ran on an image tag like `python-3.13`, which itself moved, allowing the same template to behave differently from one day to the next.

## What the CI/CD catalog gives you

A [CI/CD component](https://docs.gitlab.com/ci/components/) is a template living in a project marked as a catalog resource, under `templates/`. Each component declares its inputs in a `spec` header, and a repository includes it by its path and a version:

```yaml
include:
  - component: gitlab.com/my-group/ci/pipelines/python-library@v3.4.0
    inputs:
      python-version: "3.13"
      changelog-enabled: true
```

The version is a git tag of the components project, and a release is published to the catalog by a `release` job whenever a tag is created. Inputs are typed (`string`, `boolean`, `number` or `array`), may carry defaults, a list of allowed values or a regex, and are validated when the pipeline is created. As a result, a wrong name or a wrong type fails the pipeline immediately with an error, rather than letting it run with the default. Inside the template they are referenced as `$[[ inputs.python-version ]]`, and since they are substituted before the YAML is parsed, they can also appear where variables cannot, for instance in `rules:changes`, `stage` or a job name.

In hindsight, neither inputs nor tags are specific to the catalog. `spec:inputs` works with a plain `include:project` as well, and the old repository could have been tagged. What the catalog adds is a short address, a page per component with its inputs and documentation, and a convention establishing versions as the normal way of consuming it. Were I to do this again, I would start with the CLI and the tags, and move to the catalog afterwards.

## What made it work

### Pin every repository to a version

Every repository includes a component at an exact tag, never `@main`. The tag carries the leading `v`, since components are published to the catalog under the git tag name. Renovate recognises component references and opens a merge request in each repository when a new version is released, although only patch and minor versions are updated automatically. Once the pipeline of such a merge request passes, a bot approves it and it is merged, allowing fixes to reach every repository without anyone having to act. Major versions are intentionally excluded from this process. A repository moves to a new major deliberately, through its own merge request, and can stay behind until it is ready.

This works only if the components follow semantic versioning strictly, since a minor release is merged everywhere without anyone reading it. Any breaking change, such as removing a component or renaming an input, is therefore always a major release. When an input is renamed in a minor release, the old name keeps working as an alias until the next major release, preventing the automatic bump from breaking a repository whose configuration has not been updated yet.

### Logic in a CLI, not in YAML

The bash was replaced by a Python CLI built with Typer and Pydantic, with one subcommand per operation, such as `version release`, `changelog check`, `image build` or `deploy verify`. Each job in a component now consists of a few lines of YAML calling one or two subcommands with explicit flags. For instance, the job that tags a release used to be about 50 lines of bash and has been reduced to:

```yaml
check-version:
  image: ${CI_IMAGE}
  stage: release
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - ci version release --user-name "GitLab CI" --user-email "ci@example.com"
```

Every option can be set by a flag or an environment variable and is validated by Pydantic, so a missing value fails with the names of both. The CLI is unit tested like any other Python package and can be run locally against a real repository, with `--dry-run` for anything that pushes, tags or comments. It is also indifferent to the language a repository is written in. Since it works with git, the registry, the GitLab API and Argo CD, the same commands serve Python, Go and TypeScript repositories alike.

### One tag for the templates, the CLI and the image

The CLI is installed in the runner image, while the components, the CLI and the image are all released from the same git tag. The image tag is set in a shared variables file that is rewritten during the release, so component `v3.4.0` always runs image `3.4.0`, which always contains CLI `3.4.0`. As a result, a repository pinned to a version gets the same pipeline every time.

The tag is created only after the image has been pushed, thus ruling out any possibility of a catalog version pointing to an image that does not exist yet. Two images are built: a small default one with Python and the CLI, and a larger one adding buildah and the AWS CLI, used only by the jobs that build images.

### Four components instead of fifteen templates

The old repository had more than 15 entry templates, one per project type, with a great deal in common. The catalog has four components, each assembled from small partials, one job per file, which are included with `include:local` and take their own inputs. Since the partials live in a `_jobs/` folder that is not published as a component, repositories can use only the four components, while the partials can change without a major release.

What to build is also inferred from the layout of the repository. For instance, the `service` component discovers every service in a repository by its folder, whether it is written in Go, Python or TypeScript, and runs the jobs of each changed service in a child pipeline. Services are not listed in the CI configuration, and a repository only has to follow the conventions in the documentation.

Each component also takes a `code-changes` input, a list of globs passed to the `rules:changes` of the lint and test jobs, so that a merge request editing only a README or adding a design document skips them. The default list covers source code, manifests, the lockfile, Dockerfiles and the tests folder. Annoyingly, GitLab cannot append to an array input, forcing a repository that needs one more pattern to pass the whole list.

### Testing the components themselves

A component can be included from a branch, e.g. `@my-branch`, which suffices for a change touching only YAML. Since most changes touch the CLI as well, however, both images are built from the branch and pushed with a tag for the commit in every merge request pipeline of the components project. To try a change, a repository points its include at the branch and overrides the two image variables. The branch images are deleted when the merge request is merged, while any older than three days are removed by a scheduled job.

Since the image build is the slowest part of the pipeline, it is skipped when the merge request changes nothing that goes into the image (only documentation or tests, say) or when the `skip-docker` label is set.

A component with a wrong input reference fails only when a repository includes it, which is too late. Every component is therefore validated against GitLab's CI lint API on each merge request. The components project also uses its own partials for its own pipeline wherever possible, so a broken partial usually fails there first.

## Moving the repositories

The old templates repository was left as it was and marked as deprecated, while each repository was migrated by replacing its `include:project` with the matching component, one merge request at a time. Some flows, such as Python libraries, were migrated unchanged. For others, several old templates were replaced by a single component, as with `service`, which took over from separate templates for Go services, Python services, jobs and lambdas. For those, a migration guide lists the old variables, the new inputs and the behaviour that changed.

## Trade-offs and next steps

Automatic merges are only as safe as the pipeline approving them. A minor release that changes behaviour without failing any job, such as a new default for an input, reaches every repository without anyone noticing. Deciding what counts as a breaking change is therefore more important than it would be if a person read every bump.

Major versions have the opposite problem. A repository that is never moved to the new major stays on the old one and misses every fix released after it, allowing the fleet to drift apart over time, just as it did with shared libraries. The difference is that this drift is visible, since the version is written in each `.gitlab-ci.yml`, whereas previously every repository was on `main` and nobody knew which behaviour it was getting.

Not everything has been moved yet. A few flows still rely on the old templates, and the next step is to migrate them and archive the old repository.

<div class="callout">

## If you only do one thing

Move the bash out of the YAML. Versions and typed inputs did indeed stop a single change from breaking every repository at once, yet it was the CLI that turned the pipelines into something we could test, run locally and change without fear. If you have more than a handful of repositories on GitLab, start there, and tag the result.

</div>

## References

- [CI/CD components](https://docs.gitlab.com/ci/components/), GitLab
- [CI/CD inputs](https://docs.gitlab.com/ci/inputs/), GitLab
- [CI/CD catalog](https://gitlab.com/explore/catalog), GitLab
- [GitLab CI manager](https://docs.renovatebot.com/modules/manager/gitlabci/), Renovate
- [Typer](https://typer.tiangolo.com/) and [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
