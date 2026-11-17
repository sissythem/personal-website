import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const writing = defineCollection({
  loader: glob({ base: "./src/content/writing", pattern: "**/*.md" }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
        /** Shown above the article and used as its link preview image. */
        // The minimum size is checked in src/pages/writing/[slug].astro, because the image
        // isn't loaded yet when this schema runs.
        cover: image().optional(),
        coverAlt: z.string().optional(),
      })
      .refine((data) => !data.cover || data.coverAlt, {
        message: "Set coverAlt to describe the cover image.",
        path: ["coverAlt"],
      }),
});

export const collections = { writing };
