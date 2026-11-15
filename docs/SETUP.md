# Hosting setup

How `themeli.me` is hosted on GitHub Pages: the one-off setup, and how to fix the usual problems. For local development and content editing, see the [README](../README.md).

## Overview

| Piece          | Where it's configured                                         |
| -------------- | ------------------------------------------------------------- |
| Build & deploy | [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), runs on every push to `main` |
| Pages source   | Repository **Settings → Pages → Build and deployment**        |
| Custom domain  | Repository **Settings → Pages → Custom domain**, plus [`public/CNAME`](../public/CNAME) |
| DNS            | The domain's DNS provider                                     |
| HTTPS          | Certificate issued automatically by GitHub (Let's Encrypt)    |

## 1. Enable GitHub Pages

In the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

## 2. Configure DNS

At the domain's DNS provider, create these records:

| Type    | Name  | Value                   |
| ------- | ----- | ----------------------- |
| `A`     | `@`   | `185.199.108.153`       |
| `A`     | `@`   | `185.199.109.153`       |
| `A`     | `@`   | `185.199.110.153`       |
| `A`     | `@`   | `185.199.111.153`       |
| `AAAA`  | `@`   | `2606:50c0:8000::153`   |
| `AAAA`  | `@`   | `2606:50c0:8001::153`   |
| `AAAA`  | `@`   | `2606:50c0:8002::153`   |
| `AAAA`  | `@`   | `2606:50c0:8003::153`   |
| `CNAME` | `www` | `sissythem.github.io.`  |

The `AAAA` records are optional, but they let visitors on IPv6 reach the site. Remove any other `A`, `AAAA` or `CNAME` records for `@` and `www`, such as registrar parking or forwarding, because they stop GitHub from verifying the domain.

Check the records from your terminal:

```bash
dig +short A themeli.me
```

```bash
dig +short CNAME www.themeli.me
```

## 3. Set the custom domain

1. *(Recommended)* Verify the domain on your account, under your profile's **Settings → Pages → Add a domain**. GitHub asks for a `TXT` record. Verifying stops anyone else from claiming the domain for their own Pages site.
2. In the repository, go to **Settings → Pages → Custom domain**, enter `themeli.me` and click **Save**.
3. Wait for **DNS check successful**.

`public/CNAME` contains the domain as well and is published with every build. When you deploy with GitHub Actions, the **Custom domain** setting is the one that counts, so keep it filled in.

## 4. Enforce HTTPS

After the DNS check succeeds, GitHub requests a certificate. This usually takes 15–60 minutes. Once the **Enforce HTTPS** checkbox becomes clickable, tick it, and every `http://` request will redirect to `https://`.

Check which certificate is being served:

```bash
echo | openssl s_client -servername themeli.me -connect themeli.me:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

The subject should be `CN=themeli.me`. If it shows `CN=*.github.io`, the certificate hasn't been issued yet.

## Troubleshooting

### "Enforce HTTPS" is greyed out, or the browser warns about the certificate

GitHub hasn't issued a certificate for the domain yet, so it's serving its default `*.github.io` one. This usually means the DNS check never succeeded. Follow the next section.

### "DNS Check in Progress" never finishes, or "NotServedByPagesError"

First, confirm that DNS really is correct (see [step 2](#2-configure-dns)) and that `curl -sI http://themeli.me` returns `Server: GitHub.com`. If both are fine, the check is stuck on GitHub's side. Try these in order:

1. Click **Check again**.
2. Click **Remove**, wait a minute, then enter `themeli.me` again and click **Save**.
3. Re-run the latest **Deploy to GitHub Pages** workflow from the **Actions** tab.
4. Verify the domain at account level (see [step 3](#3-set-the-custom-domain)), then remove and re-add it again.
5. If it still fails after 24 hours, contact GitHub Support.

### The site deploys but shows a 404

Check that **Settings → Pages → Source** is set to **GitHub Actions**, and that the latest workflow run finished successfully.

### Renaming the repository

This is safe. The custom domain setting moves with the repository, and the DNS records point at the account (`sissythem.github.io`), not at the repository. Only the fallback `github.io` address changes. Afterwards, check that **Settings → Pages → Custom domain** still says `themeli.me`.

## References

- [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Securing your GitHub Pages site with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Troubleshooting custom domains and GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)
- [Deploy your Astro site to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)
