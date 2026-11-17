---
title: Reusable GitLab CI across many repositories
description: Shared CI templates included from main broke every repository at once. Moving them to versioned CI/CD catalog components, with the logic in a tested CLI, fixed most of it.
pubDate: 2026-11-16
tags: [gitlab, ci-cd, python]
draft: false
cover: ../../assets/covers/reusable-gitlab-ci-across-repositories.png
coverAlt: "Before and after diagram: on the left, five repositories include CI templates from main and all their pipelines fail; on the right, they are pinned to versions v3.2.0 to v3.4.0 and all pass."
---

Our CI templates started small, but over time more and more logic ended up inside the YAML files, as bash and Python, and the same logic was copied across several of them. Every time something changed in the internal tools we were using, even a version update of an internal package, someone had to remember to change the bash or Python in every YAML file that used it. Often someone forgot one, and we only found out when a pipeline failed.

In my [previous post](/writing/monorepo-with-coding-agents) I wrote that at work we moved from one big monorepo to many small repositories on GitLab. CI became fast again, but every repository still needs a pipeline, and most of them need the same one: lint, tests, a changelog check, an image build, a deploy and a check that the deploy is live. Nobody wants to copy that into a hundred `.gitlab-ci.yml` files, so we shared them through a repository of YAML templates.

Over the last months I replaced that repository with components in the GitLab CI/CD catalog, and moved the logic out of YAML into a typed CLI. The catalog turned out to be the smaller part of the change.

## How the old templates were shared

The old repository had more than 50 YAML files, grouped by language and project type (e.g. Python libraries, Python services, Go services, Temporal workers and frontends). A repository used them with `include:`, pointing at a project and a file:

```yaml
include:
  - project: my-group/ci/templates
    ref: main
    file: python/.libraries.yml
```

Some repositories included one entry file, which included the rest. Others picked five or six of the smaller files themselves, e.g. lint, unit tests, coverage and the version check for Go. This is the standard way of sharing CI in GitLab and it's fine for a few repositories. With more, a few problems showed up.

The first one was versioning, or rather the lack of it. The templates repository had no tags at all, so every repository included `main`. A change to a template reached every pipeline in the company the next time it ran, with no way to test it first and no way for a single repository to stay on the old behaviour. The history has the expected commits, e.g. "drop debug echo that broke generated child pipeline YAML" and a few plain reverts.

The second one was the bash, and this is the part I disliked the most. The jobs did real work: they compared versions, created tags, built changelogs, pushed commits with a retry loop, checked that images existed in the registry, posted comments on merge requests and waited for Argo CD. All of it was written inline in the YAML, as bash with `awk`, `sed`, `jq` and some Python heredocs, about 80 KB in total. The same logic was written again, a bit differently, for Python and for Go, which is why a change in one of our internal tools meant hunting for every copy. None of it was tested, and the only way to run it was to push a commit and wait for the pipeline.

The third one was the interface. A template was configured with global CI variables, e.g. `PYTHON_VERSION` or `CHANGELOG_ENABLED`. Nothing listed which variables a template read, a typo was silently ignored and the job ran with the default, and two included files could read the same variable for different things.

Finally, the runner image was versioned separately from the templates. A job ran on an image tag like `python-3.13`, which also moved, so the same template could behave differently from one day to the next.

## What the CI/CD catalog gives you

A [CI/CD component](https://docs.gitlab.com/ci/components/) is a template that lives in a project marked as a catalog resource, under `templates/`. Each component declares its inputs in a `spec` header, and a repository includes it by its path and a version:

```yaml
include:
  - component: gitlab.com/my-group/ci/pipelines/python-library@v3.4.0
    inputs:
      python-version: "3.13"
      changelog-enabled: true
```

The version is a git tag of the components project, and a release is published to the catalog by a `release` job when a tag is created. Inputs are typed (`string`, `boolean`, `number` or `array`), can have defaults, a list of allowed values or a regex, and are checked when the pipeline is created. A wrong name or a wrong type fails the pipeline straight away with an error, instead of running with the default. Inside the template, they're used as `$[[ inputs.python-version ]]`, and since they're replaced before the YAML is parsed, they can also be used in places where variables can't, e.g. in `rules:changes`, `stage` or a job name.

Looking back, inputs and tags aren't specific to the catalog. `spec:inputs` also works with a plain `include:project`, and the old repository could have been tagged. What the catalog adds is a short address, a page per component with its inputs and documentation, and a convention that makes versions the normal way to use it. If I did this again, I'd start with the CLI and the tags, and move to the catalog afterwards.

## What made it work

### Pin every repository to a version

Every repository includes a component at an exact tag, never `@main`. The tag includes the leading `v`, since the catalog publishes components under the git tag name. Renovate recognises component references and opens a merge request in each repository when a new version is released, so a repository moves to a new version through its own pipeline, and can stay behind if the new version breaks it.

The components follow semantic versioning. A breaking change, e.g. removing a component or renaming an input, is a major release. When an input is renamed, the old name keeps working for one minor release, so that a Renovate bump doesn't break a repository that hasn't changed its configuration yet.

### Logic in a CLI, not in YAML

The bash was replaced by a Python CLI, built with Typer and Pydantic, with one subcommand for each operation, e.g. `version release`, `changelog check`, `image build` or `deploy verify`. Each job in a component is a few lines of YAML that call one or two subcommands with explicit flags. For example, the job that tags a release used to be about 50 lines of bash and is now:

```yaml
check-version:
  image: ${CI_IMAGE}
  stage: release
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - ci version release --user-name "GitLab CI" --user-email "ci@example.com"
```

Every option can be set by a flag or an environment variable, and is validated by Pydantic, so a missing value fails with the name of both. The CLI is unit tested like any other Python package, and it can be run locally against a real repository, with `--dry-run` for anything that pushes, tags or comments. It also doesn't care which language the repository is written in, since it works with git, the registry, the GitLab API and Argo CD, so the same commands are used for Python, Go and TypeScript repositories.

### One tag for the templates, the CLI and the image

The CLI is installed in the runner image, and the components, the CLI and the image are released from the same git tag. The image tag is set in a shared variables file, which is rewritten during the release, so component `v3.4.0` always runs image `3.4.0`, which always contains CLI `3.4.0`. A repository pinned to a version gets the same pipeline every time.

The tag is only created after the image has been pushed, so a version that appears in the catalog can never point to an image that doesn't exist yet. There are two images: a small default one with Python and the CLI, and a larger one that also has buildah and the AWS CLI, used only by the jobs that build images.

### Four components instead of fifteen templates

The old repository had more than 15 entry templates, one per project type, with a lot in common. The catalog has four components, and each one is put together from small partials, one job per file, which are included with `include:local` and get their own inputs. The partials live in a `_jobs/` folder that isn't published as a component, so repositories can only use the four components and the partials can change without a major release.

The components also find what to build from the layout of the repository. The `service` component, for example, finds every service in a repository by its folder, whether it's written in Go, Python or TypeScript, and runs the jobs of each changed service in a child pipeline. A repository doesn't list its services in the CI configuration, it only follows the conventions in the documentation.

Each component also has a `code-changes` input, a list of globs that is passed to `rules:changes` of the lint and test jobs, so a merge request that only edits a README or adds a design document skips them. The default list covers source code, manifests, the lockfile, Dockerfiles and the tests folder. Annoyingly, GitLab can't append to an array input, so a repository that needs one more pattern has to pass the whole list.

### Testing the components themselves

A component can be included from a branch, e.g. `@my-branch`, which is enough for a change that only touches YAML. Most changes touch the CLI too though, so every merge request pipeline of the components project builds both images from the branch and pushes them with a tag for the commit. A repository that wants to try a change points the include at the branch and overrides the two image variables. The branch images are deleted when the merge request is merged, and a scheduled job removes any older than three days.

The image build is the slowest part of the pipeline, so it's skipped when the merge request changes nothing that goes into the image, e.g. only documentation or tests, or when the `skip-docker` label is set.

A component with a wrong input reference only fails when a repository includes it, which is too late. Therefore the components project has a job that validates every component against GitLab's CI lint API on each merge request. It also uses its own partials for its pipeline where it can, so a broken partial usually fails there first.

## Moving the repositories

The old repository was left as it was. Each repository moved by replacing its `include:project` with the matching component, one merge request at a time, and the old one was marked as deprecated. Some flows were migrated as they were, e.g. Python libraries, and for others the components replaced several old templates with one, e.g. `service`, which replaced separate templates for Go services, Python services, jobs and lambdas. For those, a migration guide lists the old variables, the new inputs and the behaviour that changed.

## Trade-offs and next steps

Versions come with their own cost. The components project has had about 150 releases so far, and each one opens a Renovate merge request in every repository that uses it. To be honest, most of them are merged without anyone reading them, which makes a major release easy to miss. That's partly my fault for releasing so often, and grouping the bumps would help.

A repository pinned to an old version also misses fixes, so the fleet drifts apart over time, just like it did with shared libraries. The difference is that this drift is visible, since the version is in each `.gitlab-ci.yml`, while before every repository was on `main` and nobody knew which behaviour it got.

Not everything has moved yet. A few flows still use the old templates, and the next step is to move them and archive the old repository.

<div class="callout">

## If you only do one thing

Move the bash out of the YAML. Versions and typed inputs stopped one change from breaking every repository at once, but the CLI is what made the pipelines something we could test, run locally and change without being afraid of them. If you have more than a handful of repositories on GitLab, start there, and tag the result.

</div>

## References

- [CI/CD components](https://docs.gitlab.com/ci/components/), GitLab
- [CI/CD inputs](https://docs.gitlab.com/ci/inputs/), GitLab
- [CI/CD catalog](https://gitlab.com/explore/catalog), GitLab
- [GitLab CI manager](https://docs.renovatebot.com/modules/manager/gitlabci/), Renovate
- [Typer](https://typer.tiangolo.com/) and [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
