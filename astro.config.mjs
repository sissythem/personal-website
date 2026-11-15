import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://themeli.me",
  markdown: {
    shikiConfig: { theme: "github-dark" },
  },
});
