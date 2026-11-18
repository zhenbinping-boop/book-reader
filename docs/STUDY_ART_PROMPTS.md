# 书房展卷素材生成记录

2026-11-03，使用内置 image_gen（未使用 CLI / API 回退）。三幅原画保留在 assets/study/；人物以打坐图集为身份参考，书房以原有青绿山水为风格参考。原画经现有 Sharp 工具裁切注册后用于应用。

## 宽屏书房

```text
Use case: stylized-concept.
Asset type: WIDE responsive background for the same 芸窗 wuxia study scene.
Reference image 1 is the existing portrait study, for exact room identity, palette and furnishing style, NOT an edit target.
Create a new WIDE landscape composition approximately 5:2 for a desktop hero. Same traditional Chinese wooden study, same dark wooden lattice window open onto misty 青绿 mountain peaks and a pine branch, same book shelves at the far left and scroll vessel at far right. Refined traditional gongbi-and-watercolor on warm xuan paper, matching the reference's delicate wood grain, ivory plaster and muted mineral greens.
IMPORTANT framing: the open window and distant mountain landscape must be clearly visible across the TOP HALF, with the bottom window sill near 48% canvas height. The bottom HALF is a quiet wooden floor for compositing a seated character and his low desk around 58% from the left, baseline near 88% canvas height. Keep this foreground floor empty, no desk, cushion, character or scroll on it. View from the same seated eye level with gently downward floor perspective. This is a real wide room composition, do not stretch or squash the portrait image. Complete window, side shelves and usable floor all fit in the wide frame.
Warm soft morning daylight from the window, restrained and tranquil. Full bleed, no interface, lettering, calligraphy, logos, border, watermark, person, human silhouettes, anime, 3D or photorealism.
```


## 书房场景

```text
Use case: stylized-concept.
Asset type: production portrait background for the Chinese guofeng mobile reader 芸窗.
Input image 1 is STYLE / PALETTE reference only, not an edit target. Create a NEW scene in the SAME refined traditional Chinese ink-and-mineral watercolor on warm xuan paper: a tranquil wuxia scholar's study, facing an open wooden lattice window with distant misty Chinese mountains and pine branches, soft morning light. Subtle muted 青绿, ink grey, ivory paper, aged warm wooden floorboards. A modest shelf with a few bound Chinese books along the left edge, scroll storage at the right, wooden beams; uncluttered, elegant, quiet. No human.
Composition: full-bleed tall portrait 9:16. Camera looks from inside the room toward the window, slightly down toward the floor, suitable for compositing a floor-seated wuxia with a small low reading desk at the LOWER MIDDLE (his baseline near 78% image height). Keep the central floor from 50% to 82% height EMPTY: do NOT draw a desk, chair, cushion, scroll or character here, as the animated foreground supplies all of these. Upper-middle open window frames the distant landscape, lower floor calm and spacious. Preserve useful detail in central crop for a wide landscape hero too.
Lighting: soft diffuse daylight from upper right / window, restrained warm glow, no theatrical beams.
Style: refined original Chinese 国风 illustration, delicate brush linework, painterly paper grain, matches the provided mountain painting. Not anime, not photorealistic, not 3D.
Text: none. No calligraphy, readable lettering, logos, interface, border, watermark, person or silhouette.
```

## 32 个展卷关键姿态

```text
Use case: stylized-concept.
Asset type: transparent animation sprite sheet for 芸窗, 32 consecutive key drawings of the SAME wuxia opening a reading scroll.
Input image 1: CHARACTER IDENTITY reference only (the 32-pose meditation atlas). Preserve this man's muted jade-grey 青衣 outer robe, ivory wide inner sleeves, brown belt, long dark half-tied hair, small top knot with a subtle red tie, and the same sheathed sword. Input image 2: PALETTE / LIGHTING reference for the study where these sprites will be composited. Neither input is an edit target.
Output: EXACTLY 8 columns by 4 rows, 32 evenly spaced separate sprites on a genuinely TRANSPARENT background. Wide 2:1 canvas. Read left to right, row by row. NO scenery, grids, borders, labels, numbering, writing or watermark. Generous clear transparent gutters; no overlap between neighboring cells. Each cell uses the same camera, same scale, same floor baseline, same character position and same props.
View / composition: entire seated character and a very small low wooden reading desk visible in EACH cell; gentle three-quarter SIDE view facing right, with just enough rear view to match the long hair and robe in reference 1, and enough of the hands / tabletop / parchment clearly visible to understand the opening action. A plain round sitting cushion on the floor; the same sheathed sword rests beside his LEFT hip throughout. The desk is fixed in front of his knees. Keep head, shoulders, body, cushion, desk and sword nearly still in the SAME pixel positions across all cells. Both hands and scroll visible, restrained natural anatomy.
Action:
Frames 1-4: seated upright in quiet anticipation, a tightly rolled cream Chinese handscroll rests on the low desk, both hands relaxed beside the scroll; small preparation as eyes move toward it.
Frames 5-10: both hands gently settle on the two ends of the rolled scroll, wrists and sleeves move naturally.
Frames 11-24: gently unroll the scroll horizontally across the desk, hands moving apart a small amount in smooth tiny increments; cream paper progressively opens between wooden rolled ends, and remaining paper curls near the right hand. Do NOT use a modern codex or book pages.
Frames 25-30: the scroll is fully spread on the desk, forearms settle, chin gently lowers to read.
Frames 31-32: calmly reading the opened scroll, stable relaxed final pose, gaze down.
Each successive drawing MUST be a small coherent continuation of the previous, including across row boundaries. Never jump back to the closed scroll. No body turning, rising or teleporting. Do not change outfit, hair volume, desk size or sword.
Style: refined Chinese 国风 gongbi and light watercolor on xuan-paper visual texture within the painted cutouts; restrained ink-grey / teal robe and warm ivory paper, matching the references. Delicate painterly edges, soft daylight from upper right. No anime, no 3D, no photorealism. Real alpha transparency outside each cutout, never a painted checkerboard.
```
