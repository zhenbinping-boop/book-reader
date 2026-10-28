# 芸窗阅读美术与回读窗参考

2026-10-28 使用内置 imagegen 生成一张回读窗手机界面参考、两张阅读背景和四款线装书封。图中文字仅为设计示意；软件中的正文、书名与按钮均为真实文本。透明印章和既有四款书封维持原有来源。

## 产物

- 界面参考：`docs/design/peek-window-concept.png`。
- 阅读背景：`public/art/reader-mountain.webp`、`public/art/reader-bamboo.webp`。
- 新书封：`public/art/cover-indigo.webp`、`cover-jade.webp`、`cover-ochre.webp`、`cover-cinnabar.webp`。

图片保存在项目中，供离线阅读使用；书封与背景由原生成图等比缩小并转换为 WebP。选择背景只影响设备偏好；封面样式属于图书资料并随备份保存。

## 生成提示词

### 回读窗界面参考

Use case: ui-mockup. Create a single polished mobile screen design reference for a Chinese ebook reader called 芸窗, matching the attached screenshot's existing quiet Chinese scholar's studio aesthetic: warm xuan paper, ink black Song-style type, deep jade green controls, restrained cinnabar seal and very subtle landscape illustration. This is a real mobile reader interface, not promotional poster or phone device frame. Portrait screenshot proportions 390:844. Show the reader with a legible book page as the background and, over the lower half, a generous warm-paper bottom sheet titled '回读窗'. It provides a quick preview of an earlier passage without changing the reader's current position. Include one clear close X; a small location label such as '第三章 · 回看'; scrollable Chinese example paragraph text; subtle previous/next arrows to view adjacent pages or chapters; a modest solid jade action button '读这里' that intentionally navigates to the previewed location; and a subtle secondary '关闭' action. The current background page remains visible above the sheet, calm and readable. Controls and typography must be large enough for a mobile phone, with wide thumb targets, careful spacing and safe area at bottom. Use no glassmorphism, no bright neon, no gradients, no fake input fields, no excessive ornament, no extra promotional content. Render visually faithful to the reference app; the screenshot must have usable hierarchy, aligned elements and realistic functional layout. Chinese text should be clearly legible if possible; UI will later be built as actual editable text.

### 远山背景

Portrait seamless-feeling reading background for a Chinese mobile ebook reader, 2:3 canvas. Almost blank warm xuan paper, very gentle ivory rice-paper fiber. A very faint classical ink-wash mountain landscape occupies only the bottom 18% with soft mist fading into untouched paper; the central 75% must remain almost uniform light cream for dark text readability. Extremely low contrast decoration, calm Song dynasty literati style, premium traditional Chinese painting, no typography, no calligraphy, no frame, no page, no UI, no watermark. Subtle and readable under thousands of characters of black text.

### 竹影背景

Portrait background for a Chinese mobile ebook reader, 2:3 canvas. Pale warm rice paper with restrained texture and ample blank negative space for dark body text. A few very faint ink-brush bamboo leaves are confined to the top right and lower corners, occupy less than 15% of the image, fade gently into unmarked ivory paper; central 75% is almost uniform ivory. Quiet traditional Chinese literati aesthetic, low-contrast brushwork, no calligraphy, no text, no frame, no book mockup, no UI, no watermark.

### 黛青山岚书封

One portrait 2:3 book cover artwork, full bleed edge to edge, for an elegant Chinese ebook reader. Traditional thread-bound book visual, deep muted indigo blue textured cloth and xuan paper, subtle ink-brush mountain and mist motif, aged yet refined Song dynasty library feel. Reserve a generous light ivory vertical title slip on the upper middle-right that stays COMPLETELY BLANK so real book title can be overlaid by software. Two understated thread binding stitches along the left edge. No typography, no Chinese characters, no lettering, no watermark, no phone, no shelves, no shadows outside the cover. Single flat cover image.

### 竹影青缃书封

One portrait 2:3 book cover artwork, full bleed, for Chinese ebook reader. Traditional thread-bound book, muted jade-green woven silk cloth, very restrained gold line border and a delicate bamboo motif low on the cover; elegant classical study, antique yet clean. Reserve a generous ivory vertical title slip upper middle-right that stays COMPLETELY BLANK for a real title to be added by software. Small discrete binding stitches along the left edge. No words, no letters, no watermark, no external mockup, single flat cover.

### 古笺梅香书封

One portrait 2:3 book cover artwork, full bleed, a traditional Chinese thread-bound book in warm ochre and tea-brown rice paper with a restrained ink-plum-branch motif in the lower third. Tactile paper texture, subtle old woodblock impression, quiet scholar's studio mood. An ivory vertical title slip on upper middle-right must be COMPLETELY BLANK for software to place the real book title. Binding stitches on left edge. No letters, no text, no watermark, no objects outside the cover, no device mockup.

### 朱砂云山书封

One portrait 2:3 book cover artwork, full bleed, a refined Chinese thread-bound book using dark warm cinnabar red and muted beige parchment, a delicate abstract cloud or mountains motif only at bottom, heritage library aesthetics. Keep a generous ivory vertical title slip upper middle-right COMPLETELY BLANK so software can overlay real text. Traditional stitching down the left edge. Rich understated flat print texture, no written characters, no lettering, no watermark, no surrounding objects, no device mockup.
