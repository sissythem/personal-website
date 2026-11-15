import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { profile } from "@/data/profile";
import { getPosts } from "@/lib/posts";

export async function GET(context: APIContext): Promise<Response> {
  if (!context.site) {
    throw new Error("Set `site` in astro.config.mjs to build the RSS feed.");
  }
  const posts = await getPosts();
  return rss({
    title: `${profile.name} · Writing`,
    description: profile.tagline,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/writing/${post.id}/`,
    })),
  });
}
