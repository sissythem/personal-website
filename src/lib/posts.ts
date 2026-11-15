import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"writing">;

const WORDS_PER_MINUTE = 220;

/** Posts to show, newest first. Drafts appear in development only. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection(
    "writing",
    ({ data }) => import.meta.env.DEV || !data.draft,
  );
  return posts.sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
  );
}

/** Estimated reading time in whole minutes, never less than one. */
export function readingMinutes(post: Post): number {
  const words = (post.body ?? "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
