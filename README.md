# themeli.me

Personal website of Sissy Themeli: CV and articles. Built with [Astro](https://astro.build/) and TypeScript, deployed to GitHub Pages by GitHub Actions.

## Develop

```bash
npm install
npm run dev      # local site on http://localhost:4321, drafts included
npm run check    # type-check
npm run build    # production build into dist/
```

## Edit the content

| What | Where |
|---|---|
| Name, bio, social links, interests, education, publications | `src/data/profile.ts` |
| Roles, bullets and technologies | `src/data/experience.ts` |
| Profile photo | `src/assets/avatar.jpg` |
| Colours, fonts, spacing | `src/styles/global.css` |
| CV button | put the PDF in `public/` and set `cvPdfPath` in `src/data/profile.ts` |

## Write an article

Add a Markdown file to `src/content/writing/`. The file name becomes the address, so `replay-testing.md` is published at `/writing/replay-testing/`.

```markdown
---
title: Replay testing Temporal workflows
description: One line shown under the title and on cards.
pubDate: 2026-12-01
tags: [temporal]
draft: false
---
```

Posts with `draft: true` show in `npm run dev` only. `src/content/writing/how-to-write-a-post.md` is a draft that demonstrates the layout.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which type-checks, builds and publishes to GitHub Pages.

One-off setup:

1. In the repository, set **Settings → Pages → Source** to **GitHub Actions**.
2. At the domain registrar, point `themeli.me` at GitHub Pages:
   - `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www`: `<github-username>.github.io`
3. In **Settings → Pages**, set the custom domain to `themeli.me` and tick **Enforce HTTPS** once the certificate is issued.

`public/CNAME` keeps the custom domain set across deployments.
