# Article covers

SVG sources for the article cover images in `src/assets/covers/`. The text uses Inter, so install it first (`brew install --cask font-inter`), otherwise another font is used.

To change a cover, edit its SVG and render it again:

```bash
node docs/covers/render.mjs docs/covers/monorepo-with-coding-agents.svg src/assets/covers/monorepo-with-coding-agents.png
```

The SVGs are 1200×627, the link preview size, and are rendered at 2× so they stay sharp on the article page. Keep the important parts away from the edges, because LinkedIn shows the preview as a small thumbnail.
