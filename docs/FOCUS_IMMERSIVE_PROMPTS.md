# 沉浸打坐美术生成记录

当前人物动作已在 2026-11-03 升级为 32 帧，完整提示与素材路径见文末；以下 16 帧记录作为历史来源保留。

日期：2026-11-02。内置 image_gen，未调用 CLI / API 回退。所有成品已复制到项目，原始生成输出保留。

## 竖屏山水

- 参考：`assets/focus/pine-retreat-source.png`，仅用于风格参考。
- 原画：`assets/focus/pine-vista-portrait-source.png`
- 运行：`public/art/focus/pine-vista-portrait.webp`

```text
Use case: stylized-concept
Asset type: full-screen PORTRAIT 9:16 environment painting for an immersive Chinese guofeng wuxia meditation experience.
Input image: reference is ONLY the established Chinese shanshui ink and mineral-green watercolor art style, paper texture, pine trees, morning light, and serene atmosphere. Compose a NEW portrait scene.
Primary request: a beautiful vertically composed Chinese mountain vista seen from a quiet stone ledge high above a valley. Authentic elegant 国风, ink-wash shanshui with subtle 青绿 mineral colors and fine gongbi detail, restrained ivory mist, pine green and weathered stone. Painterly and refined, not anime, not 3D, not photorealistic.
Composition: portrait 9:16, full bleed, no borders, no frame. Vast layered misty Chinese mountains occupy the upper 65 percent, with a distant waterfall and river valley leading the eye deep into the distance. An old pine arches gently from upper left without blocking the vista. A broad FLAT quiet stone terrace occupies around 60 to 82 percent of image height. The EMPTY standing/sitting spot is at horizontal 55 percent and vertical 64 percent of the canvas, a small level pale stone area with a believable horizon plane. This empty spot is crucial: a back-facing wuxia character will stand here and sit down on the SAME point. Keep it unobstructed. A few foreground grasses and dark rocks at the very bottom.
Leave the bottom 18 percent relatively simple and calm to support a few floating interface controls. Upper sky/mist should be open, not crowded with branches. Landscape should be the main subject, spacious and inviting to gaze at for a long time.
Lighting: early morning diffuse sun, soft mist, warm paper light, tranquil, no dramatic glowing effects.
Constraints: NO person, NO human silhouettes, NO statues, no lettering, calligraphy, red seals, logos, borders, watermarks, UI, clocks, decorative frames. No large buildings. New complete vertical environment, no landscape image pasted onto a portrait blank page.
```

## 背身站立至打坐动作图集

- 参考：`assets/focus/wuxia-meditator-source.png` 用于衣着、身份；新增竖屏山水用于画风、光线。
- 原画：`assets/focus/wuxia-sit-sequence-source.png`
- 运行：`public/art/focus/wuxia-sit-sequence.webp`
- 处理：保留源图，按透明间隔裁切 16 帧，统一地面，不逐帧缩放角色。生成器没有完全遵守等距行间隔，因此使用 `pose-atlas-layout.json` 记录实际裁切后再重排，不能直接把原图按四等分播放。

```text
Use case: stylized-concept
Asset type: production TRANSPARENT animation sprite atlas, 16 sequential frames, EXACT 4 columns by 4 rows of equal square cells on a square canvas.
Input images: Image 1 is the character identity / costume reference ONLY. Render this same generic Chinese young adult swordsman from the BACK, looking into the distance. Image 2 is only watercolor / lighting reference. No scenery in the output.
Primary request: a continuous slow STAND-TO-SIT animation: the wuxia traveller starts standing gazing far away, gently bends knees, lowers the body, folds legs and settles into a cross-legged meditation pose, always facing away from the viewer toward the far mountains. The back of the head / topknot, long dark hair, muted pine-teal hanfu outer robe, ivory inner robe, charcoal belt, small cinnabar hair tie, and sheathed jian beside the hip are consistent across all 16 frames. Back view in EVERY frame; do not rotate toward the camera.
Animation order left to right then next row:
Row 1 frames 1-4: full standing pose, gradual preparatory bend of knees and hips.
Row 2 frames 5-8: visibly and gradually lower into a deep squat; torso inclines very slightly; arms lower naturally to balance.
Row 3 frames 9-12: gradually fold one leg then the other, lower the hips onto the ground, straighten back.
Row 4 frames 13-16: ease into a stable CROSS-LEGGED seated back view with hands resting on the knees; final frame fully seated and still.
Technical registration: same orthographic camera, same character scale, same x center in every cell, no perspective change and no zoom. Every cell has a common ground baseline at 92 percent of its height. Standing head is around 10 percent of cell height; final seated head is around 48 percent of cell height. The seated body MUST be naturally about HALF the standing height: do NOT enlarge seated poses to fill their cells. Keep full hair, hands, feet, sword and all cloth edges inside each cell. Frame-to-frame differences should be small; this is ONE continuous action, no alternative character designs.
Style: fine Chinese gongbi watercolor brush lines, textured silk robe, warm muted colors, authentic restrained Chinese 国风 wuxia illustration, compatible with the reference mountain painting. Not pixel art, not chibi, not anime, not 3D.
Background: genuinely transparent across the whole atlas and between characters. NO landscape, rocks, floor, shadows, plinth, checkerboard pattern, panels, separators, labels, numbers, text, border, watermark. Exactly 16 back-view character frames on a perfectly regular 4x4 invisible grid.
```

## 32 帧升级（2026-11-03，当前）

- 内置 image_gen，以原 16 帧图集为人物、动作和画风参考，生成完整 32 帧连续姿态。
- 源图：`assets/focus/wuxia-sit-sequence-32-source.png`（1774 × 887）。
- 运行：`public/art/focus/wuxia-sit-sequence-32.webp`（3072 × 1536，8 × 4），包含 32 个不同的非空画面。
- 裁切与注册：`assets/focus/pose-atlas-32-layout.json`，统一地面和头部 / 上背轴线，一套倍率适用于全部姿态。保留旧 16 帧源图。

```text
Use case: stylized-concept
Asset type: production transparent animation atlas of exactly THIRTY-TWO (32) sequential poses, eight columns and four rows, wide 2:1 canvas, ideally 3072 x 1536 pixels.
Input image: the supplied 16-pose sheet is the character identity, costume, paint style, rear camera and action reference. Create a NEW denser 32-pose motion sequence, not a copy of the supplied grid.
Primary request: the SAME pine-teal and ivory Chinese wuxia swordsman, viewed from the BACK in every frame, gently moves from standing and gazing into the distance to cross-legged sitting. This is for a quiet Chinese guofeng meditation app. Retain the same high half-up topknot, long dark hair, cinnabar hair tie, worn teal hanfu, ivory sleeves, charcoal waist belt and sheathed jian at the left hip. Stable body proportions and cloth details, consistent lighting and watercolor ink rendering.
Layout: EXACTLY eight (8) characters across EACH row and exactly four (4) rows. Every one of the 32 invisible cells is square, with equal dimensions. Read left to right, then down. No numbering or separators. Do not make a 4x4 or 6x4 grid.
Action sequence, SMALL changes between adjacent frames:
Row 1, poses 1-8: begin with the original calm full standing rear silhouette, then progressively relax the shoulders, bend the hips and knees a little.
Row 2, poses 9-16: gradually deepen the knee bend, lower the pelvis smoothly, arms shift only slightly for balance. The head lowers continuously, without jumps or camera rotation.
Row 3, poses 17-24: lower from the deep squat to the ground, smoothly fold the first and then the second leg. Robe spreads very gradually; no suddenly changing hands, sword, hair or leg orientation.
Row 4, poses 25-32: settle into the same original seated cross-legged back view. Gradually straighten the spine and rest both hands on the knees. Final pose calm and fully seated. All 32 poses are individual, coherent action drawings, not duplicated frames.
Registration: ONE fixed orthographic camera and ONE fixed drawing scale for all poses. Same body center x and a common ground contact baseline at 92 percent of each cell. The standing silhouette is about 82 percent of cell height. The seated silhouette is naturally only about 56 percent of cell height: do NOT scale each pose up to fill its square. Keep every cloth edge, foot, topknot and sword inside its own cell with a little padding. Hair should move only minimally and coherently so it does not flicker across frames.
Style: refined Chinese gongbi watercolor brush lines, subtle paper-like silk texture, muted pine greens and warm ivory, strongly traditional 国风武侠, matching the reference. No anime, chibi, pixel art, 3D or photographic rendering.
Background: genuinely transparent in and between ALL cells. No landscape, floor, stone, shadow, checkerboard pattern, text, labels, numbers, red/yellow edge artifacts, frames, lines, watermark or UI.
Most important: 32 distinct frames in an 8-by-4 grid, stable registration, fine gradual movement, consistent character.
```
