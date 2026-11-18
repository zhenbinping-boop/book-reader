# 芸窗 · 我的书斋

2026-11-18 · 手机界面设计与实现

打开芸窗默认显示「我的书架」。首屏顶部是书架标题、搜索和导入按钮。标题下放一张约 100px 高的「我的书斋」卡片，包含书斋缩略图、当前功名、累计专注时间和「进入书斋」。整张卡片都可点击。卡片下方是「继续阅读」和藏书列表，保留底部五个导航入口。没有读过书时，续读区显示「导入图书」。首次使用时，书斋从童生和一间可访问的初始书斋开始。

| 界面 | 看到什么 | 可做什么 |
| --- | --- | --- |
| 书架 | 书斋入口、最近在读、藏书 | 点整张书斋卡进入；点「继续阅读」直达正文 |
| 我的书斋 | 木窗、山色和书案为主体；挂签展示选中的功名印；下方分别显示累计阅读和累计专注 | 点「布置」挑选案头灯、窗景或挂轴；点功名印或「功名印谱」看收藏；点「专注行迹」回看记录 |
| 布置 | 当前场景上弹出底部选单，逐件显示已拥有或还差多少专注时间 | 预览已获得物件，点「摆上」后替换对应位置；返回可继续看书斋 |
| 功名印谱 | 两列展示八枚印、对应名号和门槛。已获得、当前展出、未获得有独立文字状态 | 点印章看材质、解锁日期和累计时数；已获得的可「设为展示」 |

书斋可从书架一步打开，返回后恢复书架的位置。功名使用既有阅读经验门槛，首批家具按已保存的专注行迹解锁，包括累计 1 小时的案头灯、10 小时的松窗月色、50 小时的自题挂轴。布置前可预览，保存到本机。专注行迹中可以按月查看记录。示例图展示已布置的秀才书斋，独立原画是初始日景。

## 交付图与素材

- `library-and-private-study.png`，1448 × 1086，两屏高保真设计稿。示例书目、功名和时数用于说明布局。
- `study-daylight.png`，1122 × 1402，独立的日间书斋原画。留出案面与挂轴位置，UI、功名印和解锁物件可分层叠放。
- `study-moonlight.png`，1122 × 1402，与日景同取景的松窗月色。
- `study-objects-atlas.png`，1536 × 1024，案头灯与空白挂轴透明图集。
- `rank-seals-atlas.png`，1774 × 887，四列两行的透明原图。
- `seal-tongsheng.png` 至 `seal-zhuangyuan.png`，从原图分割得到的八枚独立 PNG，尺寸随印章轮廓变化，保留透明通道和原始像素。

印章从童生到状元按顺序使用竹印、青石方印、古铜拱印、圆形青玉印、双框朱砂印、梅瓣白玉印、墨玉拱印和描金朱砂印。原图与设计稿由内置 ImageGen 生成。运行时从 `public/art/study/` 读取 13 项 WebP，包含日月两景、书架缩略图、两件独立物品和八枚透明印章。印谱、布置、月度行迹入口见 `src/components/PrivateStudy.jsx`。

## ImageGen 提示词

### 两屏设计稿

```text
Use case: ui-mockup
Asset type: high-fidelity two-screen mobile UI design board for the Chinese reading and focus app 芸窗.
Primary request: On the LEFT, the first screen the returning reader sees is their normal library, with the private study entry visible and the continue-reading action equally obvious. On the RIGHT show the result of tapping that entry, "我的书斋". The art of the study and the cinnabar rank seal should both be genuinely illustrated here.
Composition: one 4:3 landscape image, EXACTLY two equal-width, tall 9:19.5 phone screenshot crops, side by side, with generous margins on a quiet warm neutral background. No device hardware, no title outside screens, no extra phones, no connecting arrows. Readable clean simplified Chinese typography, restrained UI at realistic phone scale.
Left screen: header "我的书架" and tiny "芸窗" red seal, search and plus icons. Below header a compact approximately 100px-high clickable horizontal private study card. Its left quarter shows a small richly painted wood-window-and-lamp scene thumbnail. On right clean labels "我的书斋", "秀才 · 累计专注 10 小时", a chevron and marked text "进入书斋". Card is short enough that the next card is fully visible above the fold: one navy blue clothbound edition of "浮生六记", text "上次读到 · 闺房记乐" and jade green button "继续阅读". Further down two small book covers. Navigation bottom with icons and the exact Chinese labels "书架", "寻书", "打坐", "笔记", "设置"; first selected. No illustrations of a character, no welcome/splash transition.
Right screen: simple top bar back chevron and "我的书斋". Then the first main feature: a luminous image of a refined, inhabitable small Chinese scholar's study. Study viewer sits before a modest wooden writing desk beside a large rectangular carved lattice window, with bright delightfully rendered layered pine hills and pale blue sky, stacked stitched books, one glowing paper lamp and a few tools neatly arranged. Frame interior to feel person-sized and cozy, no character. One carefully rendered jade-green square impressed seal with clear text "秀才" on a small paper tag near top of image. Legible, lightly tinted small bottom-right image button "布置". Below image one slim line with "累计阅读 10 小时" and "累计专注 10 小时", separate values; then only two full-width entry rows "功名印谱" and "专注行迹" and chevrons. Distinct quiet screen with breathing room. No additional bottom nav on this back-stack page.
Style: realistic shippable native app design. "宣纸、青绿、墨色、朱砂" visual language. Richly painted Song-inspired green blue shanshui and realistic walnut wood/paper textures only in thumbnail and illustration. UI semibold Song Chinese serif headings, simple clean text and clear readable contrast. Keep the set light, warm, and usable. No generic modern graduation cap/trophy, gold fantasy decoration, neon, watermark, gibberish, rendered charts, promo copy or labels other than specified.
```

### 竖屏初始书斋

输入参考图为两屏设计稿，仅参考右侧书斋插画的构图和风格。

```text
Use case: illustration-story
Asset type: portrait standalone in-app primary illustration for 芸窗, a Chinese reading / focus app, the private scholar study at its initial unlock stage.
Input image 1: style and composition reference. Match ONLY the painted window and desk interior in the RIGHT-HAND phone preview; generate a clean full-bleed standalone room illustration without any screen, phone, UI, badges, hang tags or writing.
Scene: warmly painted personal Chinese scholar's study of modest scale, a roomy welcoming angle from sitting in a wooden chair at a desk. The desk fills the lower third, and a large carved wooden lattice open window fills much of the upper right with clear sunny air, luminous distant blue-green ridges, pines and a pale blue sky. Walnut bookshelf and a few deep indigo thread-bound books left, open book on the tabletop, discreet brush rest; arrangement is thoughtfully inhabited, with a little visual room on the desk and left-side wall for unlockable objects.
Composition: portrait 4:5 for mobile hero, angled perspective, recognizable window and desk also within the central roughly square crop. Graceful wood details, soft sidelight on the desk, a bright outdoor area balancing the interior lighting. Make it serene and comfortable, not theatrical or excessively elaborate. High quality hand-painted realism, subtle fine mineral pigment and paper texture with Song-inspired Qinglü mountains outside. Color story natural wood, warm cream, ink blue, misty jade and airy blue. No person, no text or legible characters anywhere, no hanging calligraphy, no lamp, no rank seal, no buttons, no frame, no watermark. This base plate must feel visually complete on its own.
```

### 八枚功名印图集

启用透明背景。

```text
Use case: stylized-concept
Asset type: one transparent sprite atlas with the full eight collectible Chinese rank seals for the Chinese app 芸窗, coherently designed as a family; each tile will be extracted to serve as independent small icons in the UI.
Primary request: render EXACTLY eight distinct individual cultural artifacts, isolated on actual transparency, arranged in four equally spaced columns and two equally spaced rows. ONLY the seal faces, head-on orthographic viewing, no handles or pedestals, no backplate, no separate captions, no paper, no floor or ground shadow. All eight standard icon scales, decorative textures confined within each continuous silhouette. Each tile occupies a distinct equal 1/4-by-1/2 cell, centered with plenty of clear transparent exterior padding and gutters so cells can be cropped independently. Landscape wide aspect ratio roughly 2:1.
Verbatim glyphs per cell from top left to right: "童生", "秀才", "举人", "贡士"; from bottom left to right: "进士", "探花", "榜眼", "状元". Each seal must contain ONLY its own exact TWO simplified Chinese characters, reading vertically top then bottom. Use legible upright Chinese Song or regular-script inspired carving. Do NOT approximate with illegible seal script, do not add text or symbols outside each seal.
Distinct identities by silhouette/material. 童生: slender rectangular split bamboo, dark green incised grooves with softly worn edges. 秀才: green-gray scholar stone square with gently rounded corners and engraved double green frame. 举人: antique warm bronze top-arched silhouette with patina, dark incised glyphs. 贡士: pale celadon jade circular seal, dark green engraved glyphs. 进士: square cinnabar impressed seal, double broken-line frame, ivory raised glyphs. 探花: ivory-white jade with plum-blossom petal outline, plum-purple engraved glyphs. 榜眼: black jade peaked arch with fine silver-gray etched double border and pale crisp glyphs. 状元: dark warm cinnabar ink with restrained fine antiqued gilt border, strong larger square, near-ivory carved glyphs, understated highest rank. Make each feel like a physical work of craft, no western shields, crowns, medals, ribbons, sparkles, neon or gold glow.
Design: classy Song-dynasty ink-and-paper aesthetic, faithful hand-carved surfaces, barely irregular edges, front-on brushed details legible at 40 pixels, carefully separate all eight art sprites. True alpha transparency, never draw a grid or a checkerboard.
```

### 松窗月色

```text
Use case: lighting-weather
Asset type: optional night backdrop for the 芸窗 private study, using provided daytime generated image as edit target. Create its night variant "松窗月色" from the exact same portrait camera. Preserve original aspect ratio, exact camera, proportions and positional alignment of furniture, desk, chair, shelves, wall, carved wooden window, window sill, vase, books, incense burner, inkstone, all foreground geometry and still life. Do not add any lamp, screens, writing or hanging artwork. Change ONLY the lighting and view time of day: clear blue-violet moonlit sky at right through the lattice, a small elegant pale full moon in the upper clear sky, world now deep cool blue-green, distant layered pine mountains still visible, subtle moonlight entering the room. Keep furniture legible and warmer oak hues in shadow rather than a black overall mask. Restrained, luminous, quiet Song-inspired hand-painted realism matching reference. Expected scene readable when viewed on a mobile screen. No UI, no icon, no seal, no overlay copy, no people.
```

### 案头灯与自题挂轴

启用透明背景。

```text
Use case: stylized-concept
Asset type: one transparent two-item illustration atlas for independent decorative objects in 芸窗's Chinese scholar study, matching the provided daytime art as a STYLE reference.
Image 1 angle and style reference: same painted realism, wood tones, silks and paper, warm pigments, subtle texture. Create EXACTLY two isolated, nonoverlapping objects each in its own half, true transparent exterior. Landscape composition with the objects side by side and generous padding. LEFT half: one elegant modest Chinese scholar's wooden table lamp, dark carved oak rectangular pedestal with gold cream translucent silk oval lantern and warm softly lit surface, seen at 3/4 desk-height view to match the furniture in reference. Shape is concise and appropriate for overlaying an existing tabletop. Keep warm glow strictly inside shade so transparency remains clean, no painted cast shadow, no cords. RIGHT half: one refined very tall and narrow Chinese vertical hanging scroll, front view, unmarked blank warm rice paper rectangular surface with muted olive-gold silk border, horizontal walnut roller at upper and lower edges, small braided hanging cord above, nothing drawn on the blank paper so user text can be laid there. Both items completely in view, physically realistic as cherished objects, no trophy, no UI, no text, no extra object, no square backgrounds, no checkered pattern, preserve actual alpha.
```
