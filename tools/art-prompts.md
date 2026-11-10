# Card art prompts (Gemini / ChatGPT image)

Four original, animal-based creatures, one per colour card. Use the **same
model** for all four so they look like one set. Generate 3–4 variations each
and pick the best. Once you have one you love, attach it to the next prompts
with: "Same art style, rendering and lighting as the attached image."

The brand of the famous creature game is deliberately not named: models may
refuse it or copy an existing creature, and the post needs clearly original
designs. If a result looks too much like an existing creature, regenerate.

## Output

- Landscape **3:2** (ChatGPT: 1536×1024; Gemini: ask for 3:2), PNG.
- Keep the creature roughly centred with some free margin (the card crops a
  little).
- Save as `tools/art-src/warden.png`, `pipewright.png`, `polyglot.png`,
  `watcher.png`. They get optimised into `site/assets/art/` (WebP).

## Shared style (paste where it says [shared style])

```
Original monster-collecting card game illustration of a brand-new creature
species (not an existing character). The creature is based on a real animal,
with animal anatomy: not humanoid, no armour, no clothing. It has a simple,
iconic, instantly readable silhouette and a few distinctive elemental features;
charming and cool at the same time, expressive eyes, confident: appealing to
adults, not babyish. Anime-influenced creature art: clean shapes, soft cel
shading with gentle painterly gradients. Composition like classic trading-card
art: the whole creature in the mid-ground in a dynamic, characterful pose,
three-quarter view, slightly low camera, with a lush, detailed natural habitat
behind it, depth and atmospheric perspective, and bright, colourful lighting;
the scene fills the frame edge to edge. Absolutely no text, letters, numbers,
logos, UI, card frame or border. Landscape 3:2, creature centred with some
margin around it.
```

## 1 · Warden (red): governance and security, a pangolin

```
[shared style] A red pangolin-like creature (vermilion #F25022 dominant, warm
orange accents) whose overlapping scales look like small shields; a
keyhole-shaped marking glows softly on its forehead and its tail ends in a
key-shaped tip. It stands protectively on a ledge in a canyon of hexagonal
basalt columns: some columns glow warmly, others are wrapped in frosted mist.
Personality: loyal guardian, calm and alert.
```

## 2 · Pipewright (green): ingest and transform, a water serpent

```
[shared style] A lime-green (#7FBA00 dominant) serpent-like water creature whose
long body is made of smooth ring segments like pipe joints, with small round
fins shaped like valve wheels and softly glowing seams. It glides through a
green valley of clear streams and little dams, guiding a flowing river into neat
stepped pools full of sparkling cube-shaped pebbles. Personality: diligent,
playful engineer.
```

## 3 · Polyglot (blue): PySpark, SQL and KQL, a parrot

```
[shared style] A bright azure (#00A4EF dominant) parrot-like creature with a
large expressive crest of three distinct plumes: one crackling with orange-gold
sparks, one made of glowing stacked crystal layers, one flowing like ribbons of
light. It perches on a branch in a floating sky garden whose leaves are luminous
abstract glyph shapes (shapes only, no readable characters), beak open as if
talking. Personality: clever, chatty, confident.
```

## 4 · Watcher (yellow): monitor and optimise, a meerkat

```
[shared style] A golden-amber (#FFB900 dominant) meerkat-like creature standing
up tall on its hind legs on top of a sandstone rock, on lookout duty. Its large
dark eye rings have gauge-like markings with a thin glowing needle, the stripes
on its back rise in height like a small bar chart, and the tip of its tail glows
like a little alert lamp. Behind it stretches a wide golden savanna at sunrise:
the dunes and hills on the horizon form the gentle rising and falling shape of a
line chart, with a few faint glowing waypoints along it. Ground-level camera,
wide open sky. Personality: vigilant, quick, quietly proud.
```

## If a result is off

- Childish → add: "cool and majestic, not babyish".
- Text or letters appear → add: "remove all text and lettering", or regenerate.
- Colour drifts → repeat the hex colour and "the creature is mainly <colour>".
