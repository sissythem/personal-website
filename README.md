<div align="center">

# Personal Website

**Personal website and writing of Sissy Themeli, Staff Software Engineer.**

[![Deploy](https://github.com/sissythem/personal-website/actions/workflows/deploy.yml/badge.svg)](https://github.com/sissythem/personal-website/actions/workflows/deploy.yml)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fsissy.themeli.me&label=sissy.themeli.me&up_message=online&down_message=offline)](https://sissy.themeli.me)
[![Astro](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![GitHub Pages](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-222222?logo=githubpages&logoColor=white)](https://pages.github.com/)
[![RSS](https://img.shields.io/badge/RSS-feed-FFA500?logo=rss&logoColor=white)](https://sissy.themeli.me/rss.xml)

[**Visit the site**](https://sissy.themeli.me) · [Writing](https://sissy.themeli.me/writing/) · [RSS](https://sissy.themeli.me/rss.xml)

</div>

---

## ✨ Overview

A fast, static personal site with a CV and a writing section. It's built with [Astro](https://astro.build/) and TypeScript, ships almost no JavaScript, and deploys to GitHub Pages on every push to `main`.

- **About and experience**: profile, bio, roles, technologies, education and publications, all driven by typed data files
- **Writing**: Markdown articles with tags, reading times, drafts and an RSS feed
- **SEO-ready**: canonical URLs, Open Graph tags and meta descriptions on every page
- **Link previews**: every article has its own 1200×627 preview image, so links render with an image on LinkedIn, Slack and X. It's the article's cover if it has one, otherwise a card generated at build time with an accent colour and pattern picked from the slug (`/writing/<slug>/og.png`, plus `/og.png` for the rest of the site)
- **Type-checked**: `astro check` runs in CI before every deploy
- **Self-hosted fonts**: Inter and JetBrains Mono via Fontsource, with no third-party font requests

## 🚀 Quick start

> Requires **Node.js 22** or later.

```bash
npm install
npm run dev
```

Open <http://localhost:4321>. The dev server reloads on save and includes draft posts.

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Start the local dev server, drafts included   |
| `npm run check`   | Type-check `.astro` and `.ts` files           |
| `npm run build`   | Build the production site into `dist/`        |
| `npm run preview` | Serve the production build locally            |

## 🗂️ Project structure

```text
.
├── .github/workflows/deploy.yml   # CI: check, build, deploy to Pages
├── public/                        # Static files copied as-is (favicon, CNAME)
└── src/
    ├── assets/                    # Optimised images (avatar)
    ├── components/                # About, Experience, Publications, PostList…
    ├── content/writing/           # Markdown articles
    ├── data/                      # Profile and experience content
    ├── layouts/Base.astro         # Shared HTML shell, meta tags, fonts
    ├── pages/                     # Routes: home, /writing, RSS, 404
    └── styles/global.css          # Design tokens and global styles
```

## ✏️ Editing content

All content lives in plain data files, so there's no need to touch the components.

| What                                                          | Where                     |
| ------------------------------------------------------------- | ------------------------- |
| Name, bio, social links, interests, education, publications   | `src/data/profile.ts`     |
| Roles, bullets and technologies                               | `src/data/experience.ts`  |
| Profile photo                                                 | `src/assets/avatar.jpg`   |
| Colours, fonts, spacing                                       | `src/styles/global.css`   |
| Downloadable CV                                               | Put the PDF in `public/` and set `cvPdfPath` in `src/data/profile.ts` |

## 📝 Writing an article

Add a Markdown file to `src/content/writing/`. The file name becomes the URL, so `replay-testing.md` is published at `/writing/replay-testing/`.

```markdown
---
title: Replay testing Temporal workflows
description: One line shown under the title and on cards.
pubDate: 2026-12-01
updatedDate: 2026-12-15   # optional
tags: [temporal, testing]
cover: ../../assets/covers/replay-testing.jpg   # optional, at least 1200×627
coverAlt: A timeline of workflow events being replayed   # required with cover
draft: false
---

Your article starts here.
```

A cover is optional. With one, it's shown above the article and cropped to 1200×627 for the link preview, so keep the important part near the centre. Without one, a preview card is generated from the title and description, with its own accent colour and pattern. After publishing, paste the URL into the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) to refresh LinkedIn's cached preview.

To put one block in a highlighted card, such as a conclusion or a key takeaway, wrap it in a `callout` div. Leave blank lines inside the div so the Markdown is still parsed:

```markdown
<div class="callout">

## If you only do one thing

Your text here.

</div>
```

Posts marked `draft: true` appear in `npm run dev` only, never in the published site or the RSS feed. See [`how-to-write-a-post.md`](src/content/writing/how-to-write-a-post.md) for an example of the layout.

## 🌍 Deployment

Every push to `main` triggers the [deploy workflow](.github/workflows/deploy.yml), which installs dependencies, type-checks, builds and publishes the site to GitHub Pages. You can also run it manually from the **Actions** tab.

For first-time setup (the custom domain, DNS and HTTPS) and troubleshooting, see **[docs/SETUP.md](docs/SETUP.md)**.

## 📬 Contact

Find me through the links on [sissy.themeli.me](https://sissy.themeli.me).

---

<div align="center">
<sub>Built with <a href="https://astro.build/">Astro</a> · Hosted on <a href="https://pages.github.com/">GitHub Pages</a></sub>
</div>
