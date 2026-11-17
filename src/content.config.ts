import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/og-image";

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
        cover: image()
          .refine((img) => img.width >= OG_WIDTH && img.height >= OG_HEIGHT, {
            message: `The cover must be at least ${OG_WIDTH}×${OG_HEIGHT} pixels, so the link preview isn't blurry.`,
          })
          .optional(),
        coverAlt: z.string().optional(),
      })
      .refine((data) => !data.cover || data.coverAlt, {
        message: "Set coverAlt to describe the cover image.",
        path: ["coverAlt"],
      }),
});

export const collections = { writing };
