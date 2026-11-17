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
};

// Accents that read well on the dark background. The first one is the site's own violet.
const ACCENTS = ["#a78bfa", "#2dd4bf", "#fbbf24", "#fb7185", "#38bdf8", "#a3e635"] as const;

type Pattern = "dots" | "grid" | "stripes" | "rings";
const PATTERNS: readonly Pattern[] = ["dots", "grid", "stripes", "rings"];

// Paths are resolved from the project root, which is where `astro build` runs.
const FONT_DIR = "node_modules/@fontsource/inter/files";
const AVATAR_PATH = "src/assets/avatar.jpg";

const ACCENT_BAR = 10;
const PADDING_TOP = 64;
const PADDING_BOTTOM = 56;
const PADDING_X = 72;
/** The pattern covers the right part of the card and fades out towards the text. */
const PATTERN_WIDTH = 520;

interface OgImageOptions {
  title: string;
  description: string;
  /** Small label above the title, e.g. "Writing". */
  eyebrow?: string;
  /** Picks the accent colour and pattern, e.g. the post slug. Without it, the site's defaults are used. */
  seed?: string;
}

type Node = { type: string; props: Record<string, unknown> };

function el(type: string, style: Record<string, unknown>, children?: unknown): Node {
  return { type, props: { style, children } };
}

/** FNV-1a, so the same seed always gets the same look. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (const char of seed) {
    h ^= char.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function pickVariant(seed?: string): { accent: string; pattern: Pattern } {
  if (!seed) return { accent: ACCENTS[0], pattern: "dots" };
  const h = hash(seed);
  return {
    accent: ACCENTS[h % ACCENTS.length] ?? ACCENTS[0],
    pattern: PATTERNS[Math.floor(h / ACCENTS.length) % PATTERNS.length] ?? "dots",
  };
}

/** Opacity that grows from 0 at the left edge of the pattern to `max` at the right edge of the card. */
function fade(x: number, max: number): number {
  return Math.max(0, Math.min(1, x / PATTERN_WIDTH)) * max;
}

function absolute(style: Record<string, unknown>): Node {
  return el("div", { position: "absolute", display: "flex", ...style });
}

function patternNodes(pattern: Pattern, accent: string): Node[] {
  const left = OG_WIDTH - PATTERN_WIDTH;
  const nodes: Node[] = [];
  switch (pattern) {
    case "dots": {
      const step = 32;
      for (let x = 0; x < PATTERN_WIDTH; x += step) {
        for (let y = step / 2; y < OG_HEIGHT; y += step) {
          nodes.push(absolute({ left: left + x, top: y, width: 6, height: 6, borderRadius: 3, background: accent, opacity: fade(x, 0.45) }));
        }
      }
      break;
    }
    case "grid": {
      const step = 48;
      for (let x = 0; x < PATTERN_WIDTH; x += step) {
        nodes.push(absolute({ left: left + x, top: 0, width: 1, height: OG_HEIGHT, background: accent, opacity: fade(x, 0.35) }));
      }
      for (let y = step; y < OG_HEIGHT; y += step) {
        // Horizontal lines are split into segments so they fade like the vertical ones.
        for (let x = 0; x < PATTERN_WIDTH; x += step) {
          nodes.push(absolute({ left: left + x, top: y, width: step, height: 1, background: accent, opacity: fade(x, 0.35) }));
        }
      }
      break;
    }
    case "stripes": {
      const step = 36;
      for (let x = 0; x < PATTERN_WIDTH + OG_HEIGHT; x += step) {
        nodes.push(
          absolute({
            left: left + x - OG_HEIGHT / 2,
            top: -OG_HEIGHT / 2,
            width: 3,
            height: OG_HEIGHT * 2,
            background: accent,
            opacity: fade(x - OG_HEIGHT / 4, 0.3),
            transform: "rotate(35deg)",
          }),
        );
      }
      break;
    }
    case "rings": {
      const centreX = OG_WIDTH - 40;
      const centreY = OG_HEIGHT / 2;
      for (let r = 40; r < PATTERN_WIDTH; r += 44) {
        nodes.push(
          absolute({
            left: centreX - r,
            top: centreY - r,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            border: `2px solid ${accent}`,
            opacity: 0.45 * (1 - r / PATTERN_WIDTH),
          }),
        );
      }
      break;
    }
  }
  return nodes;
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
export async function renderOgImage({ title, description, eyebrow, seed }: OgImageOptions): Promise<Buffer> {
  const { regular, bold, avatarUri } = await loadAssets();
  const { accent, pattern } = pickVariant(seed);
  const titleSize = title.length > 60 ? 56 : 64;

  // satori sizes boxes as content-box, so the padding is subtracted by hand.
  const card = el(
    "div",
    {
      position: "relative",
      width: OG_WIDTH - 2 * PADDING_X,
      height: OG_HEIGHT - PADDING_TOP - PADDING_BOTTOM,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      paddingTop: PADDING_TOP,
      paddingBottom: PADDING_BOTTOM,
      paddingLeft: PADDING_X,
      paddingRight: PADDING_X,
      background: COLOURS.bg,
      fontFamily: "Inter",
      color: COLOURS.fg,
      overflow: "hidden",
    },
    [
      // Drawn first so the text sits on top. Positions are relative to the card's outer edge.
      el("div", { position: "absolute", left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT, display: "flex" }, [
        ...patternNodes(pattern, accent),
        absolute({ left: 0, top: 0, width: OG_WIDTH, height: ACCENT_BAR, background: accent }),
      ]),
      el("div", { display: "flex", flexDirection: "column", gap: "24px" }, [
        ...(eyebrow
          ? [el("div", { fontSize: 26, fontWeight: 700, color: accent, letterSpacing: "0.04em" }, eyebrow.toUpperCase())]
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
