import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import sharp from "sharp";
import { profile } from "@/data/profile";

/** LinkedIn's recommended link preview size (1.91:1). */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 627;

// Colours mirror the design tokens in src/styles/global.css.
const COLOURS = {
  bg: "#121214",
  line: "#2b2b32",
  fg: "#ececf1",
  muted: "#9a9aa6",
  accent: "#a78bfa",
};

// Paths are resolved from the project root, which is where `astro build` runs.
const FONT_DIR = "node_modules/@fontsource/inter/files";
const AVATAR_PATH = "src/assets/avatar.jpg";

const ACCENT_BAR = 10;
const PADDING_TOP = 64;
const PADDING_BOTTOM = 56;
const PADDING_X = 72;

interface OgImageOptions {
  title: string;
  description: string;
  /** Small label above the title, e.g. "Writing". */
  eyebrow?: string;
}

type Node = { type: string; props: Record<string, unknown> };

function el(type: string, style: Record<string, unknown>, children?: unknown): Node {
  return { type, props: { style, children } };
}

async function loadAssets() {
  const [regular, bold, avatar] = await Promise.all([
    readFile(join(process.cwd(), FONT_DIR, "inter-latin-400-normal.woff")),
    readFile(join(process.cwd(), FONT_DIR, "inter-latin-700-normal.woff")),
    readFile(join(process.cwd(), AVATAR_PATH)),
  ]);
  return { regular, bold, avatarUri: `data:image/jpeg;base64,${avatar.toString("base64")}` };
}

/** Renders a link preview card as a PNG for Open Graph (LinkedIn, Slack, X…). */
export async function renderOgImage({ title, description, eyebrow }: OgImageOptions): Promise<Buffer> {
  const { regular, bold, avatarUri } = await loadAssets();
  const titleSize = title.length > 60 ? 56 : 64;

  // satori sizes boxes as content-box, so the padding is subtracted by hand.
  const card = el(
    "div",
    {
      width: OG_WIDTH - 2 * PADDING_X,
      height: OG_HEIGHT - PADDING_TOP - PADDING_BOTTOM,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      paddingTop: PADDING_TOP,
      paddingBottom: PADDING_BOTTOM,
      paddingLeft: PADDING_X,
      paddingRight: PADDING_X,
      background: `linear-gradient(${COLOURS.accent}, ${COLOURS.accent}) top / 100% ${ACCENT_BAR}px no-repeat, ${COLOURS.bg}`,
      fontFamily: "Inter",
      color: COLOURS.fg,
    },
    [
      el("div", { display: "flex", flexDirection: "column", gap: "24px" }, [
        ...(eyebrow
          ? [el("div", { fontSize: 26, fontWeight: 700, color: COLOURS.accent, letterSpacing: "0.04em" }, eyebrow.toUpperCase())]
          : []),
        el("div", { fontSize: titleSize, fontWeight: 700, lineHeight: 1.12, letterSpacing: "-0.02em" }, title),
        el("div", { fontSize: 28, lineHeight: 1.4, color: COLOURS.muted, lineClamp: 3 }, description),
      ]),
      el(
        "div",
        { display: "flex", alignItems: "center", gap: "20px", paddingTop: "28px", borderTop: `1px solid ${COLOURS.line}` },
        [
          { type: "img", props: { src: avatarUri, width: 64, height: 64, style: { borderRadius: "50%" } } },
          el("div", { display: "flex", flexDirection: "column" }, [
            el("div", { fontSize: 26, fontWeight: 700 }, profile.name),
            el("div", { fontSize: 22, color: COLOURS.muted }, "sissy.themeli.me"),
          ]),
        ],
      ),
    ],
  );

  // satori accepts plain element objects, so no JSX runtime is needed.
  const svg = await satori(card as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      { name: "Inter", data: regular, weight: 400, style: "normal" },
      { name: "Inter", data: bold, weight: 700, style: "normal" },
    ],
  });
  return sharp(Buffer.from(svg)).png().toBuffer();
}
