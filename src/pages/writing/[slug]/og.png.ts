import type { APIContext } from "astro";
import { renderOgImage } from "@/lib/og-image";
import { getPosts, type Post } from "@/lib/posts";

export async function getStaticPaths() {
  const posts = await getPosts();
  // Posts with a cover use it as their preview image instead.
  return posts.filter((post) => !post.data.cover).map((post) => ({ params: { slug: post.id }, props: { post } }));
}

export async function GET({ props }: APIContext<{ post: Post }>): Promise<Response> {
  const { title, description } = props.post.data;
  const png = await renderOgImage({ title, description, eyebrow: "Writing", seed: props.post.id });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
}
