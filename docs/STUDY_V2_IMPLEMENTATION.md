# 宽大背影与明媚窗景（v2 历史）

此页保留 2026-11-03 的实现和验收。当前 v3 清晰度 / 比例修复以 [STUDY.md](STUDY.md) 为准。

2026-11-03，v2 重绘。按用户要求，以近在眼前的宽大背影和窗外明媚山水作为主体；当前资源与动作已替换早先的小型侧面人物 / 空房间构图。保留 v1 来源与历史验收，原有书库和阅读器继续使用本地数据。

## 实际过程

- 进入书架：正背面的头肩、长发和青衣占据近景前景，窗外为明亮青绿山水。取景贴近窗边，窗景四周只保留窄木框，画面不展示空地板或房间纵深。手机首屏场景约占视口高度 66%，宽屏也保留大背影；人物按可用高度适配以保持头顶完整。
- 静候时使用单独生成的高清背影原画（1024px 透明运行图），在开始展卷的 350ms 准备阶段淡入动作画布。首屏「选一卷书」可滚到真实藏书列表；没有书时入口直接选择导入文件。
- 点击封面、书名或继续阅读：书架操作淡出，场景覆盖视口；先准备约 0.35 秒，再用约 3 秒向两侧展开长卷、低头阅读。约 3.5 秒后开始 1.3 秒的纸面渐变，整体约 4.8 秒，镜头推进约 11%。
- 真正进入所选 TXT / PDF / EPUB 的原阅读器，沿用原有续读位置。动作本身不创建进度或计时记录。
- 转场中可点「直接阅读」跳过，或「返回书架」/ Escape 取消。取消会停止动画和迟到跳转，并恢复触发按钮的键盘焦点。快速重复选书只打开第一次选择的目标。
- 开启系统减少动态效果时直接阅读。缺失原文件的书直接进入原来的接回文件提示。素材载入失败时仍可打开书；等待资源的转场有 4 秒上限。
- 返回书架后恢复候卷姿态。笔记定位、阅读深链和打坐的去读入口继续使用原有路由。

人物使用内置 image_gen 生成的 32 个连续关键姿态，再用与打坐共用的 WebGL 双向运动补偿网格绘制中间形状。相邻原画先对齐形状再混合纹理；人物和镜头通过 requestAnimationFrame 直接更新，不每帧重渲染整个 React 页面。WebGL / 位移数据不可用时回退 Canvas 单关键姿态播放。

这仍是 AI 原画与网格插值，衣纹、手部和遮挡细节可能存在局部变化，不是完整骨骼绑定或生成视频。浏览器断言和截图不代表手机实际帧率；Android / iOS 真机观感与原生返回仍需安装后确认。

## 素材与制作

全部使用内置 image_gen，未使用 CLI / API 回退。v2 三幅原画保留，完整提示词与参考图角色见 [背影重绘记录](STUDY_V2_PROMPTS.md)；[v1 生成记录](STUDY_ART_PROMPTS.md) 作为历史来源保留。

| 用途 | 原画 / 来源记录 | 运行资源 |
|---|---|---|
| 明媚窗景 | `assets/study/study-window-v2-source.png` | `public/art/study/study-window-v2.webp` |
| 高清静候背影 | `assets/study/wuxia-back-idle-v2-source.png` | `public/art/study/wuxia-back-idle-v2.webp` |
| 32 个背影展长卷姿态 | `assets/study/wuxia-scroll-back-v2-source.png` | `public/art/study/wuxia-scroll-back-v2.webp` |
| 正反向运动网格 | `assets/study/motion-mesh-report-v2.json` | `public/art/study/wuxia-scroll-back-motion-v2.bin` |

v2 当前运行资源共约 1.85 MiB，使用 BASE_URL 支持部署子路径，随 PWA 预缓存和原生网页资源打包。原画不进入运行依赖；应用运行不需要 Python / OpenCV。

复用现有素材工具，新增 `--study` 与 `--scene study` 入口：

```powershell
node tools/prepare_focus_art.mjs --study
python tools/build_focus_motion.py --scene study --deps .tmp/focus-motion-deps --pilot 2
python tools/build_focus_motion.py --scene study --deps .tmp/focus-motion-deps
```

Sharp 从已检查的透明行间隔裁切 8 × 4 个姿态，以同一倍率注册到 384px 方格；按头部轴线及 353px 腰部裁切基线对齐。首尾有效高度约 300 / 244px，图集为 3072 × 1536。高清静候图另注册到 1024px 方格，与第一姿态共用同一外框。注册信息、高清图映射及逐帧指纹为 `assets/study/scroll-atlas-v2-layout.json`。若重新生成原画，需先检查尺寸和透明间隔，不能盲用旧裁切坐标。

运动文件为 270088 字节，33 × 33 网格、31 对正反向位移，复用打坐的 FMW1 解码与渲染器。工具在打开真实原画前检查已知平移、零位移及损坏输入；v2 两对试算均约 0.036 秒。`motion-mesh-report-v2.json` 记录来源图集 SHA 与逐对耗时，单测防止图集换新后误用旧位移。这些是素材制作耗时，不是渲染帧率。`--study-v1` / `--scene study-v1` 可重建历史版本；默认的打坐处理入口继续保留。

代码入口为 `src/components/StudyRoom.jsx`、`src/lib/studyTransition.js`、`src/study.css`；书架封面、书名与续读处理位于 `Shelf.jsx`。

## v2 本轮验收

- 86 项 Node 单测及完整 23 / 23 页浏览器回归通过，书房页为 23 项断言。覆盖高清背影、新窗景 / 32 姿态来源、选卷滚到书单、三格式真实阅读、取消和迟到跳转、连点保护、焦点恢复、跳过、书库与导航。
- 检查 320 / 390px、1280px、深色、减少动态效果和素材请求失败。场景与大背影截图为 `docs/design/*-v2.png`，最终视觉日志为 `docs/qa/study-v2-visual-final.log`。
- 网页子路径和 Android 网页资源构建通过，新资源在两个构建中的 SHA 与源文件一致，PWA 预缓存共 236 项。生产网页强制断网刷新后仍显示 1024px 高清背影和新窗景，能加载运动文件、实际展卷并进入原 TXT 阅读器。日志为 `docs/qa/study-v2-offline.log`。
- 可播放预览为 `docs/design/study-opening-preview-v2.webm`（390 × 694，约 6.4 秒）。它使用同一原画、运动网格和动作时间，记录候卷 / 长卷展开 / 阅读定姿，已验证解码与定位最终姿态；是交付预览，不是实际 UI 帧率证据。
- 前两次专项的失败日志分别保留为 `study-v2-browser-attempt1.log` / `attempt2.log`：前者错误地要求书单滚到顶端（宽屏三本书时页面余量不足），改为检查书籍完整进入可读视口；后者的体量断言只看宽度，未考虑横屏高度，改为结合可用宽高检查。最终完整套件通过，未删去功能断言。
- v1 的侧面人物、空房间来源和预览保留作历史，当前代码引用 v2 文件。原生安装 / 返回行为和实际帧率仍需真机检查。

```text
study-window-v2.webp
C19C1BB12A07BB25B478CEE121051518B2F7D190D54275E0C7BCAE0C743BA1C4
wuxia-back-idle-v2.webp
6DC0B4F689D8CA2497E60B827760BEB590E9AB9F7636939F8DDC729B56D2C802
wuxia-scroll-back-v2.webp
3C081508F9714C9E9858ACEFA8C04299A954771E0AC42866F82212945E34DB31
wuxia-scroll-back-motion-v2.bin
BD0F4F64D3DC34AAE487FF2D977CEBD71F4F3AF9DA1696B3BA25BADFC3D7244B
```

## v1 验收记录（历史）

- 86 项 Node 单测通过，包含动作时间边界、32 格真实像素非空 / 不重复以及运动文件来源 SHA 一致性。
- 书房专项 `dev-study.html` 20 项断言通过：三种真实格式、连续姿态、最终阅读姿态、重复点击、取消 / 焦点恢复、跳过和原书库导航。Profiler 检查动作没有逐帧提交整页 React；不以此认证帧率。
- 实际界面截图为 `docs/design/study-*.png`。检查了 320 / 390px、1280px、深色和减少动态效果；还阻断书房素材请求，确认仍能打开真实正文。
- 最终完整 23 / 23 页浏览器回归通过，记录为 `docs/qa/study-suite-verified.log`。旧 EPUB 集成页等待展卷后的路由再保留原有阅读器断言。
- 网页子路径、Android 网页资源构建通过；四个运行资源与源文件 SHA 相同并进入 PWA 预缓存（共 232 项）。强制断网后刷新生产网页，书房、图集与运动文件能载入，使用 `webgl-flow` 实际展卷并进入本地 TXT 正文；横屏书房也可离线取回。构建、打包校验和离线日志使用 `docs/qa/study-` 前缀。
- 可播放预览为 `docs/design/study-opening-preview.webm`（390 × 694，约 4.4 秒，991587 字节）。用同一运行渲染器、位移数据和动作时间录制，包含候卷、展卷和阅读定姿；已经验证浏览器解码及跳到最终姿态。它是交付用素材预览，不是实际 UI 帧率的证据，运行时仍使用网格绘制。
- 初次专项的焦点恢复检查没有先让程序触发的按钮获得焦点，修正为真实键盘操作前置条件后通过；保留 `study-browser-attempt1.log`。视觉试算还保留了重复内容被正确去重的夹具问题、320px 的真实横向溢出及开发服务器监听原画复制锁导致退出的日志。后两项分别修复窄屏边距、忽略原画 / QA 输出的热更新监听，最终重新验证。

本轮不修改应用 ID、签名、数据库版本或备份格式；未发布 APK / IPA。

```text
public/art/study/wuxia-scroll-sequence.webp
D0F0E35EB3132248F96AFF04DD3ADE53B25C114DE016EEE09E7804296A903C7A
public/art/study/wuxia-scroll-motion-v1.bin
BAF3E8E2043D7ABA53E53802C0AE8090BAD29D8E5E742C214401713E6F35D68C
```
