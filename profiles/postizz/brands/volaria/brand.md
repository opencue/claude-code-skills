# VOLARIA — brand kit

Financial / markets brand. Cinematic, editorial, weighty. Bloomberg
Businessweek meets late-night talk-show meme aesthetic.

## Logo

`brands/volaria/logo.png` — 388×240 PNG, RGBA. **Use it EXACTLY as supplied.**
Never redraw, recolor, restyle, crop the chrome, or generate a "similar"
mark. Pass it as a reference image to every image-gen call.

## Palette

- **Jet black** `#000000` — primary background, header/footer bands
- **Warm spotlight amber** — single editorial highlight tone for hero subject
- **Teal-and-amber** color grade — cinematic mid-tones
- **Subtle red glow** — accent for emotional weight, sparingly
- **Pure white** `#FFFFFF` — headline type only

## Typography

- **Headline**: Druk / Bebas Neue — massive bold uppercase condensed sans,
  perfectly kerned, tight leading. White on black.
- **Label/eyebrow**: thin white uppercase sans, small caps feel
- **Body**: not used on card-format posts — keep image-first

## Voice

Authoritative, dry-witty, market-aware. Drop opinions confidently.
Never hedge. Avoid finfluencer cringe ("to the moon", emoji-spam,
"this is huge"). Tickers stay clean (`$NVDA`, not `$NVDA 🚀`).

## Composite voices (article-writer)

When invoking `/article` (article-writer skill) under VOLARIA, use these
voice mixes by default. Voice definitions live in the article-writer
skill's [voices library](../../../../../resources/skills/skills/content/article-writer/voices.md).
Do not invent new voices — add them to the shared library so other
brands can reuse them.

| Preset | Default voice mix | Notes |
|---|---|---|
| `qa-interview` | `macro-strategist, eu-prime-broker, us-vc-partner` | Pick 2-3. Add `hk-allocator` for Asia-tilted topics, `defense-procurement` for dual-use / supply-chain stories. |
| `op-ed` | `none` | VOLARIA op-eds are single-author voice. Use the brand voice above. |
| `sector-analysis` | `macro-strategist, quant-hedge, ai-infra-founder` | Swap `ai-infra-founder` for `defense-procurement` / `eu-policy-analyst` depending on the sector. |
| `listicle` | `none` | Crisp brand voice; no composite quotes. |
| `breaking-news` | `none` | Lede + context only. If a quote is essential, use one voice — never a multi-voice panel for breaking. |

Composite-voice articles MUST include the standard composite-voices
disclaimer in frontmatter (see article-writer SKILL.md, Phase 2).

## Templates (rotate per post)

VOLARIA cards rotate through four named templates. All share: real logo
post-composited via ImageMagick (see `feedback-volaria-logo-composite`
memory — 220px black band, logo `-resize x180 -gravity north -geometry
+0+20`), white uppercase Druk/Bebas Neue headline (3 lines exact, tight
leading), jet-black palette, single warm amber spotlight, teal-and-amber
color grade, 50mm macro feel. All output 4:5 vertical (928×1152 from
`nano_banana_pro` at 1k).

Across every template, the **top header band must be EMPTY in the
generation prompt** (a real logo is composited post-gen) and the headline
is left-aligned with breathing margin. Pick one template per thread for
visual coherence — don't mix mid-thread.

### Template 1 — `tri-band-cinematic` (default)

Best for: trade ideas, single-stock movers, announcements where the
subject is a clear hero object on black. The bordered/banded look.

```
LAYOUT — three stacked horizontal bands.

1) TOP HEADER BAR (10%): solid jet-black, completely empty (logo
   composited post-generation — do not place any logo, wordmark, or
   text in this band).

2) MIDDLE IMAGE (55%): Cinematic editorial close-up of <SUBJECT>,
   single dramatic warm spotlight, deep black space, subtle red glow
   from below if emotional, deep cinematic shadows, teal-and-amber
   color grade, 50mm macro lens. No people, no other text. Bloomberg
   Businessweek meets late-night talk-show meme aesthetic — weighty,
   dramatic, inviting.

3) BOTTOM TEXT BLOCK (35%): solid jet-black. Massive bold white
   #FFFFFF uppercase condensed sans-serif headline (Druk Wide / Bebas
   Neue), perfectly kerned, tight leading, three lines exactly,
   left-aligned with breathing margin:

   <LINE 1>
   <LINE 2>
   <LINE 3>

Under headline, small thin white uppercase label letter-spaced: <CTA>

All three lines FULLY VISIBLE. Apple Keynote precision. Hyper-sharp
text. No emoji, no hashtags.
```

### Template 2 — `billboard` (movie-poster)

Best for: bold single statements, sentiment posts, macro reactions, mood
pieces. Fewer borders, more immersive.

```
LAYOUT — top logo band + one large image with overlaid headline.

1) TOP HEADER BAR (10%): solid jet-black, completely empty (logo
   composited post-generation — no logo, wordmark, or text here).

2) MAIN IMAGE (90%): Full-bleed cinematic editorial scene of <SUBJECT>,
   single dramatic warm spotlight, deep black, teal-and-amber color
   grade, 50mm macro lens, deep cinematic shadows. Composition leaves
   the BOTTOM THIRD in deeper shadow so a large white text block reads
   cleanly over it.

Overlay text on the bottom third, left-aligned with breathing margin —
massive bold white #FFFFFF uppercase condensed sans-serif headline
(Druk Wide / Bebas Neue), perfectly kerned, tight leading, three lines
exactly:

<LINE 1>
<LINE 2>
<LINE 3>

Small thin white uppercase CTA label letter-spaced below: <CTA>

Apple Keynote precision. Hyper-sharp text. No emoji, no hashtags.
```

### Template 3 — `ticker-tape` (Bloomberg terminal)

Best for: macro / multi-asset takes, market recaps, "here's what the
tape said today" posts. Adds a data-rich strip between subject and
headline.

```
LAYOUT — four stacked bands.

1) TOP HEADER BAR (10%): solid jet-black, empty (logo composited
   post-generation).

2) CINEMATIC SUBJECT (60%): Editorial close-up of <SUBJECT> on deep
   black, single warm amber spotlight, teal-and-amber color grade,
   50mm macro lens, deep shadows. No people, no other text.

3) TICKER STRIP (5%): Horizontal band, solid black background, single
   row of bold amber #FFA500 monospaced uppercase ticker text reading
   left to right with subtle motion blur on the right edge as if
   scrolling:

   <TICKER STRIP TEXT, e.g. "▶ $BRAI +141%   •   S&P 7,535   •   SQQQ
   3X INV   •   NDX 26,684 +1.29%">

4) BOTTOM TEXT BLOCK (25%): Solid jet-black. Massive bold white
   #FFFFFF uppercase condensed sans-serif headline (Druk Wide / Bebas
   Neue), perfectly kerned, tight leading, three lines exactly,
   left-aligned:

<LINE 1>
<LINE 2>
<LINE 3>

Small thin white uppercase CTA label letter-spaced beneath: <CTA>

Apple Keynote precision. Hyper-sharp text. No emoji, no hashtags.
```

### Template 4 — `magazine` (split-vertical cover)

Best for: op-eds, sector analyses, "issue cover" framing where the
headline IS the visual. Vanity Fair / The Atlantic feel.

```
LAYOUT — top logo band + 50-50 vertical split below.

1) TOP HEADER BAR (10%): solid jet-black, empty (logo composited
   post-generation).

2) LEFT HALF (45% width × 90% height): Editorial cinematic portrait of
   <SUBJECT> on deep black, warm amber spotlight, teal-amber grade,
   50mm macro. Subject crops tight, occupies most of the left column.

3) RIGHT HALF (55% width × 90% height): Solid jet-black. Massive bold
   white #FFFFFF uppercase condensed sans-serif headline (Druk Wide /
   Bebas Neue), perfectly kerned, tight leading, three lines exactly,
   left-aligned, vertically centered with breathing margin:

<LINE 1>
<LINE 2>
<LINE 3>

Small thin white uppercase CTA label letter-spaced beneath the headline,
also left-aligned: <CTA>

Apple Keynote precision. Hyper-sharp text. No emoji, no hashtags.
```

### Picking a template

| Post type | Template |
|---|---|
| Trade idea / single-stock mover / announcement | `tri-band-cinematic` |
| Bold one-line sentiment / macro mood | `billboard` |
| Multi-asset recap / market wrap / cross-asset take | `ticker-tape` |
| Op-ed / sector analysis / cover-story framing | `magazine` |

## Subject / headline examples

| Subject | Headline (3 lines) | CTA |
|---|---|---|
| Vintage chrome studio microphone with "HOTTEST TAKE" tag | DROP YOUR / HOTTEST / MARKET TAKE. | ENGAGE |
| Bull and bear figurines mid-collision | THE TAPE / DOESN'T / CARE. | READ |
| Cracked CD labeled S&P 500 | THE INDEX / IS NOT / THE MARKET. | DIG IN |

Always three lines. Always uppercase. Always tight.

## Don't

- Don't generate the logo from scratch — always reference the PNG
- Don't add gradients to the bands (solid jet-black only)
- Don't use color photography that fights the teal-amber grade
- Don't use stock-photo people — keep it object-first, editorial
- Don't include emoji or hashtags inside the image
