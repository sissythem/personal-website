import { profile } from "@/data/profile";
import { renderOgImage } from "@/lib/og-image";

/** Default preview image for pages without their own, e.g. the home page. */
export async function GET(): Promise<Response> {
  const png = await renderOgImage({ title: profile.name, description: profile.tagline, eyebrow: profile.role });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
}
