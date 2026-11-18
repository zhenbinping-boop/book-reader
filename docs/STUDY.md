# 读书场景：高清背影与长卷动画

2026-11-04，已按用户要求取消本功能，恢复此前只有独立打坐场景的版本。书架恢复欢迎 / 续读与藏书列表，点击书籍直接进入正文。

旧组件、样式、渲染模块、素材制作入口、专项测试及运行素材按原路径归档在 `assets/study/retired-2026-11-04/`，不参与当前应用构建或预缓存。原画、提示词和既有验证记录保留。下文为 v3 的历史实现记录，其中原命令 / 路径描述不代表当前生效功能。

撤回后通过 84 项活动单测、22/22 浏览器页、网页子路径与 Android 网页资源构建；直接选书进入正文与打坐流程均已复验。打坐源码 / 素材哈希保持一致，两个构建和 PWA 均不再包含读书动画资源。当前日志见 `docs/qa/study-remove-*.log`。

## v3 历史记录

2026-11-04，v3 清晰度与比例修复。人物的大背影与明媚窗景作为主体。

## 本轮解决的问题

v2 静候使用高清背影，展卷时换成源图每格约 200px 的整身动作帧；这些小帧在 384px 画布上再次放大，高分屏会明显变糊。静候与全屏又使用不同人物尺寸，发生突然放大和比例漂移。旧的视觉验收主要使用 DPR 1，未覆盖这次问题。

当前用同一份 1233 × 1209px 原比例背影贯穿全部动作，双手和长卷独立连续运动。人物图片不再按动作帧切换；全屏开始锁定静候时的尺寸，650ms 内平滑展开取景框。镜头推进约 3.5%，整体动作仍为 4.8 秒，末段 1.3 秒渐入电子书纸面。

画布按实际设备像素密度绘制：手机检查 DPR 3，宽屏检查 DPR 2；倍率上限 3，单边最多 4096px。手臂宽高来自各自原图，人物按原图宽高比适配可用空间。横屏改用独立的 1536 × 1024 窗景，避免持续放大竖图。

## 使用过程与兼容

进入书架可看到高清背影与窗外明亮山水；「选一卷书」抵达真实书单，空书库则导入文件。选择封面、书名或续读后，人物缓缓展开长卷，再进入原 TXT / PDF / EPUB 阅读器。

支持返回书架 / Escape 取消、直接阅读跳过、连续点击锁定首次选择、系统减少动态效果。取消不会产生迟到跳转或改变未打开书的进度；素材不可用时可以继续阅读。应用 ID、签名、数据库和备份格式沿用。

当前为高清图片分层与连续几何动画；这次浏览器检查不能代表 Android / iOS 真机帧率或原生返回体验。旧 v1 / v2 素材及记录保留，v2 实现见 [历史说明](STUDY_V2_IMPLEMENTATION.md)。

## 当前素材与制作入口

全部素材本地内置。高清背影复用内置 image_gen 的 v2 原画，本轮使用同一内置工具生成手臂 / 纸面分层素材和横向窗景。完整提示见 [v3 生成记录](STUDY_V3_PROMPTS.md)。

| 用途 | 原画来源 | 当前运行资源 |
|---|---|---|
| 全程高清背影 | assets/study/wuxia-back-idle-v2-source.png | public/art/study/wuxia-back-hd-v3.webp |
| 左臂 / 手持卷端 | assets/study/wuxia-scroll-parts-v3-source.png | public/art/study/wuxia-left-arm-v3.webp |
| 右臂 / 手持卷端 | 同上 | public/art/study/wuxia-right-arm-v3.webp |
| 纸面纹理 | 同上 | public/art/study/scroll-paper-v3.webp |
| 竖屏窗景 | assets/study/study-window-v2-source.png | public/art/study/study-window-portrait-v3.webp |
| 横向窗景 | assets/study/study-window-wide-v3-source.png | public/art/study/study-window-wide-v3.webp |

运行路径遵循 BASE_URL，随 PWA 和 Android 网页资源打包。运行时不需要 Python / OpenCV。

素材制作命令：

```powershell
node tools/prepare_study_layers.mjs
```

现有 prepare_focus_art 注册整身图集；新命令复用 Sharp，负责原始分辨率的独立图层，避免拉伸人物或把小帧放大。它只按透明边界裁切人物 / 手臂，保留原尺寸，记录手持卷端的轴线。纸面以原画中的空白区域作为材质，运行时通过裁剪连续揭开纸面，不逐帧横向拉伸纹理。

制作报告为 assets/study/study-layers-v3.json，包含来源 SHA、裁切范围、实际尺寸和卷端轴线。src/lib/studyRenderer.js 使用这份数据确定各层原比例；人物尺寸不依赖展开进度。重新生成素材后先检查分层布局，再制作并刷新预览。

## 代码与验证

- src/components/StudyRoom.jsx：载入、取消 / 跳过、取景框扩展、尺寸观察和 RAF。
- src/lib/studyRenderer.js：高清连续分层绘制、尺寸锁定和高分屏像素配置。
- src/lib/studyTransition.js：准备、展卷、镜头和纸面渐入轨道。
- tests/studyRenderer.test.mjs：原尺寸 / 原比例、展开过程不改变人物尺寸、高分屏像素尺寸。
- dev-study.html：实际选书、三格式阅读、焦点、取消、背影纹理及故意降清的对照检测。

89 项 Node 单测、完整 23/23 浏览器页、书房专项 26 项断言及日志接收器正反例检查通过。纹理检测比较展开前后背影中心区域，逐像素一致；故意降低分辨率的控制图无法通过相同检测。320 / 390px 的 DPR 3、1280px 的 DPR 2、深色、减少动态效果和素材失败已检查。

网页子路径与 Android 网页资源构建通过；PWA 预缓存 242 项（17602.77 KiB）。生产子路径断网刷新后取回六项高清素材，并实际展卷进入 TXT 正文。六项素材在 public、dist 和 dist-android 的 SHA256 逐项一致，且全部进入网页预缓存。一次视觉脚本把桌面场景宽度误当成整窗宽度的失败保留在 visual-attempt1 日志中；按实际场景尺寸修正断言后通过。

截图使用 docs/design/study-fixed-*.png；新版高清素材预览为 docs/design/study-opening-preview-v3.webm（780 × 1388，约 6.4 秒）。视频用于交付动作预览，不是实际 UI 帧率证据。最终回归、构建、离线及素材 SHA 校验日志位于 docs/qa/study-fix-*.log。
