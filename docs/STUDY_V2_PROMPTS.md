# 背影与明媚窗景：重绘提示词

2026-11-03，内置 image_gen，保留 v1 原画与提示记录。人物身份参考原打坐图集；本轮新生成明媚窗景、正背面近景 32 姿态，以及高清静候背影。项目原画路径分别为 `assets/study/study-window-v2-source.png`、`assets/study/wuxia-scroll-back-v2-source.png`、`assets/study/wuxia-back-idle-v2-source.png`。

## 高清静候背影

```text
Use case: identity-preserve.
Asset type: HIGH DETAIL transparent master illustration for the waiting pose of the same close-back wuxia reader.
Image 1 is the exact POSE / SILHOUETTE / PROP layout reference. Image 2 is a lighting / color reference only.
Create a much higher-detail redraw of ONLY the cutout in image 1. Preserve the same straight BACK VIEW, same head axis, long dark half-tied hair with red tie, broad jade-grey robe shoulders, ivory sleeves, brown belt, sheathed sword glimpse at lower left, and a small brown writing-desk top peeking out beyond the shoulders. Preserve the closed-scroll waiting pose; no raised hands or open scroll.
The back faces the viewer squarely; no face or side profile. Head, shoulder width and waist silhouette must match image 1 closely so this high-detail image can crossfade into that exact first animation key. Crop at waist; no legs, floor, cushion or chair. Whole head and broad shoulders visible with clear transparent margin around them.
Refine fine hair strands, subtle gongbi brush lines, layered painted teal cloth, muted mountain-pattern robe and restrained fabric shading. Original Chinese 国风 mineral watercolor on xuan-paper visual texture INSIDE the subject only. Bright soft window daylight, luminous natural highlights on shoulders, crisp but painterly; keep the same man's identity and outfit. NOT photorealism, anime, 3D, glossy game rendering or a different costume.
Genuinely transparent background with clean alpha edges. No red/yellow edge noise, no fringe, no black/grey backdrop, no painted checkerboard, no text, letters, interface or watermark. Square high-resolution illustration, fill most of the square with this close upper-body back.
```


## 明媚窗景

```text
Use case: stylized-concept.
Asset type: portrait WINDOW VIEW background layer for a close over-the-back wuxia reading scene in 芸窗.
Input image 1 is STYLE reference only. Make a NEW much closer composition at the study window, with bright outdoor scenery as the main subject.
Framing: tall portrait 9:16, camera immediately behind a seated reader at the window; the animated reader will be composited large over the LOWER HALF. An enormous open wooden Chinese window occupies 90% of the picture. Only slim wooden jambs at the extreme left/right edges, a thin lintel at the very top, and a very narrow sill at the bottom. The outdoors fills virtually all the central image. There is NO view of an empty room, floor, walls, shelves, ceiling, room depth, furniture, desk or chair.
Outside: a bright clear late-spring morning, luminous blue-green Chinese mountains, jade pines, a sunlit flowing river and a small waterfall, fresh foliage with sunlight, airy white clouds and soft blue sky, layered distance. Optimistic 明媚风景, inviting and serene. The brightest open valley lies just above mid-frame, to be seen over the reader's large head and shoulders.
Art style: the same refined Chinese 国风 gongbi and mineral-green watercolor on ivory xuan-paper texture as the reference. Crisp delicate painted details, luminous daylight, restrained warm wood framing, richer fresh greens and sky blue, not dark or sepia.
No person in this background layer; the foreground animation supplies the person. No floor, empty room, text, lettering, interface, watermark, anime, 3D or photorealism. Full bleed.
```

## 近景背影展开长卷

```text
Use case: stylized-concept.
Asset type: 32-keyframe transparent character animation atlas for a CLOSE OVER-THE-BACK reading scene, replacing a distant small side-view character.
Reference image 1: identity reference for the SAME Chinese wuxia from 芸窗 meditation. Keep long dark half-tied hair, red tie, jade-grey 青衣 robe, ivory wide sleeves, brown belt and a hint of the sheathed sword at the left waist. Reference image 2: new bright window painting, lighting and brushwork reference only. Neither input is an edit target.
Output EXACTLY 8 columns × 4 rows, 32 sequential sprites left-to-right row-by-row, on REAL alpha transparency, wide 2:1 canvas. Equal cells, clear transparent gutters, no overlap, no labels or numbers, no scenery.
CAMERA AND FRAMING ARE THE MAIN REQUIREMENT: a large CLOSE rear view of the seated man, HEAD + BROAD SHOULDERS + BACK down to the waist, like standing immediately behind him looking slightly down over his shoulders. His back faces the viewer almost squarely; NO visible face, NO side profile. His head/hair centered, back and flowing sleeves broad in the foreground. Crop below the waist, no legs, cushions, chair or floor. Each sprite is a CLOSE upper-body cutout filling its cell, not a full-body small person.
In front of him, seen from this slightly raised behind-the-shoulder camera, is just the upper surface / near edge of a writing desk. His forearms and both hands extend forward to a Chinese handscroll. The camera is high enough that the long parchment, both wooden rollers and hand movement are visible above / around the shoulders, with physically natural occlusion of the center by his back. His shoulders and hair remain the primary visual mass. No desk legs.
SCROLL ACTION: use a visibly LONG cream paper handscroll, not a short book or modern codex. At the fully open pose it stretches from near the LEFT EDGE to near the RIGHT EDGE of the entire cell, hands naturally holding the two rollers wide apart. Broad pale paper surface, gently curled edges, no readable writing.
Frames 1-4: he sits straight waiting, closed rolled scroll on the desk ahead; back broad, head upright.
Frames 5-9: hands gently take the two rollers, small natural preparation, body remains fixed.
Frames 10-26: both hands slowly move apart, progressively UNROLLING a long horizontal sheet in SMALL even increments across the wide desk; clearly increasing the visible parchment span every few frames.
Frames 27-30: full long scroll laid open, hands at opposite ends, head slowly bows toward it.
Frames 31-32: stable quiet READING pose, full long scroll still open and visible around his shoulders.
All 32 frames share IDENTICAL camera, head axis, scale, desk plane and waist baseline. No character turning, no growing or shrinking, no returning to the closed pose at row boundaries. Keep the same robe / hair / shoulders throughout.
Style: refined original Chinese 国风 gongbi and light mineral watercolor matching both references, warm natural daylight across shoulders, rich but restrained teal / ivory cloth detail. Delicate painterly cutout edges with genuine transparent background, no grey or black background, no checkerboard painting, no extra colored halos, no text, interface, watermark, anime, 3D or photorealism.
```
