import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sissy.themeli.me",
  markdown: {
    shikiConfig: { theme: "github-dark" },
  },
});
