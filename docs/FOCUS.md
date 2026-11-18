# 芸窗 · 打坐国风番茄钟

更新：2026-11-03。当前在 32 个关键姿态之间加入双向运动补偿网格插值；早先交接中的其他独立功能仍为候选。

**当前为沉浸场景版。** 用户明确要求：未打坐时武侠站立远眺，竖屏山水覆盖全屏，UI 悬浮；开始后 UI 渐隐、画面推进、人物缓缓坐下，专注时计时器应小而安静。此前的图片卡片配大计时器已被此版替代。

## 沉浸过程

| 状态 | 实际行为 |
|---|---|
| 远眺 / 未开始 | 背身青衣武侠站在石台上看远山。山水铺满视口，标题、时长、开始与导航悬浮；复杂设定收进弹层。 |
| 点击入座 | 约 0.9 秒内淡出界面和导航；镜头在 5.2 秒内从 1 倍推进至 1.17 倍。人物先准备约 0.8 秒，再用约 2 秒连续屈膝、下蹲、折腿，至第 31 个盘坐关键姿态；镜头继续缓缓推进。 |
| 专注中 | 维持背身盘坐，风景为主。屏幕边缘仅留 14px 数字的小计时提示，没有大号倒计时或进度条。 |
| 临时操作 | 轻点山水或小计时提示唤出暂停 / 收功 / 读书入口；可再次收起。没有键盘焦点时，操作约 5 秒后自动退场。暂停也可收起操作观景。 |
| 收功 | 保存实际时间后先准备约 0.2 秒，再用约 2 秒反向起身；镜头共约 4 秒拉回，再恢复悬浮界面与导航。 |
| 重新打开 / 从阅读返回 | 直接接回现有盘坐与计时，不反复播放入座，也不启动新的会话。 |

当前使用 **32 个二维关键姿态 + 双向运动补偿网格插值**。离线计算相邻原画的正反向位移；运行时 WebGL 先把两张原画变形到中间姿态，再合成颜色，降低整个人物透明叠化的双影。入座动作集中到约 2 秒，避免把少量关键姿态拉长到整个推镜过程。人物、镜头和地面阴影通过进度订阅直接更新，React 只更新阶段和正常计时等语义状态，不每帧重渲染整页。

这仍使用既有 AI 原画，不是完整骨骼绑定或生成视频；遮挡变化、衣纹细节与光流估计仍可能带来局部形变。WebGL 或位移数据不可用、WebGL 上下文丢失时回退为 Canvas 单关键姿态播放，计时独立运行。减少动态效果时直接切到站立 / 盘坐姿态，关闭推镜、动作过渡、雾气与呼吸动画。浏览器截图与断言不能保证所有手机的实际帧率，仍需真机检查。

## 使用

底部导航「打坐」（`#/focus`）进入「松下听风」。可直接选择时长开始；「专注设定」中选择自由专注 / 读书打坐、自定时长、事项与休息长度。事项可不填；读书模式选择本地可读图书，入座后轻点山水唤出「去读」，进入原有阅读器，计时入口保留。

- 预设 25 / 45 / 60 分钟，自定为 1–180 分钟整数。
- 暂停期间不累计，继续后接回剩余时间。切页面、后台或锁屏不自动暂停。
- 开始、暂停、继续、收功都事务写入 IndexedDB；重新打开应用按落盘时间接回。
- 提前收功保存实际时间，到时完成只保存目标时长。恢复很晚也不会把额外离线时间算入专注。
- 每程只保存一次，多个页面同时恢复不能重复计数。保存失败保留活动会话并提示重试。
- 可手动开始 5 / 10 / 15 分钟休息，不自动开始下一轮；休息不计入专注行迹。
- 行迹展示最近 30 程，全部历史和今日汇总来自本地记录，无排行榜、连胜或惩罚。
- 默认静音，可打开前台到时轻铃；人物支持入座 / 起身序列，盘坐时仅保留轻微呼吸变化，遵循系统减少动态效果。
- Android 返回键优先关闭收功确认；从打坐页返回书架时保留活动计时。

**能力边界：**轻铃使用 Web Audio，依赖前台页面和浏览器音频策略；未接入 Android / iOS 系统通知、锁屏铃声、后台音频或通知权限。后台恢复算法的浏览器验收不能替代真机锁屏、进程回收及电池策略验收。不修改系统时钟时，按真实时间段计时；跨设备的时钟修改不属于当前支持场景。

## 数据与兼容

数据库保留原名 `book-reader` 和 v1–v4，新增 v5：

- `focusState`：活动会话、偏好及最近收功提示。每次操作立即落盘；不在每秒刷新时重复写库。
- `focusSessions`：稳定会话 ID、开始/结束时间、目标和实际毫秒数、事项、完成方式、书名/文件指纹快照。

完成记录与清除活动状态在同一事务内提交，写入失败整体回滚。阅读进度沿用原来的保存方式，与专注统计分开，不把阅读时长相加。

整库备份增加可选 `focusSessions` 字段，保持 schemaVersion=1 与原有书籍字段。旧备份仍可恢复；导入行迹先校验、再按会话 ID 加法合并。活动计时不随备份迁移。旧版本应用无法恢复新增行迹，迁移打坐记录应使用支持打坐的新版本。

原应用 ID、固定签名和书库身份均保留。本轮未更改发布版本；是否发布 APK 以实际发布记录为准。

## 美术资产

沉浸版新增素材通过内置 **image_gen** 生成，旧版原画保留作来源记录，当前画面使用以下资源：

| 用途 | 原画 | 运行资源 |
|---|---|---|
| 竖屏远山石台 | `assets/focus/pine-vista-portrait-source.png` | `public/art/focus/pine-vista-portrait.webp`（941 × 1672） |
| 背身站立至盘坐 32 帧 | `assets/focus/wuxia-sit-sequence-32-source.png` | `public/art/focus/wuxia-sit-sequence-32.webp`（3072 × 1536，8 × 4 透明图集） |
| 相邻姿态正反向位移 | 上述运行图集；记录见 `assets/focus/motion-mesh-report.json` | `public/art/focus/wuxia-motion-v1.bin`（270088 字节，约 264 KiB） |

`node tools/prepare_focus_art.mjs` 默认制作 32 帧图集，`--legacy-16` 可重建保留的旧 16 帧版。使用已有 Sharp，根据透明行间隔裁切、统一倍率注册到 384px 方格，地面基线为 353px。为减轻衣摆展开引起的横向漂移，依据头部 / 上背轴线对齐；不按每帧包围框中心漂移，不逐帧放大到同样高度。完整坐标、统一倍率和各帧指纹保存在 `assets/focus/pose-atlas-32-layout.json`。站立有效高度 323px，盘坐 236px。新动作 WebP 约 703 KiB；旧 16 帧来源与素材保留。

沉浸版完整生成提示见 [FOCUS_IMMERSIVE_PROMPTS.md](FOCUS_IMMERSIVE_PROMPTS.md)。动作与镜头逻辑见 `src/lib/focusTransition.js`、`src/hooks/useFocusTransition.js`；网格绘制和加载见 `src/lib/focusMesh.js`、`src/components/FocusActor.jsx`。图集与位移文件均进入 PWA 预缓存和 Android 网页资源，路径遵循 BASE_URL。姿态视觉必须在真实浏览器中检查，单看计时单测或图集格子数不能作为动作验收。

### 重建运动网格（2026-11-03）

`tools/build_focus_motion.py` 为已有注册图集计算 OpenCV DIS 双向位移，适用于关键姿态间仍有跳动的情况。它只写几何数据和来源报告，不修改人物原画；若要重新生成 / 裁切原画，先使用 `prepare_focus_art.mjs`，再重建网格。运行应用不依赖 Python 或 OpenCV。

可将可选制作依赖安装到隔离目录，再先测两对姿态，最后生成全部 31 对：

```powershell
python -m pip install --target .tmp/focus-motion-deps opencv-python-headless numpy
python tools/build_focus_motion.py --deps .tmp/focus-motion-deps --pilot 2
python tools/build_focus_motion.py --deps .tmp/focus-motion-deps
```

产物使用 384px 方格中的像素位移，33 × 33 网格，正反方向分别储存；int16 以 1/32px 量化，分量上限 ±48px，353px 地面下方固定。文件头为 FMW1，小端尺寸 / 格子数 / 姿态数 / 量化系数。来源图集 SHA-256 和逐对耗时保存在 `assets/focus/motion-mesh-report.json`；Node 测试会检查来源 SHA，防止更换图集后误用旧位移。

每次命令先运行固定控制，再打开真实原画：已知 (4, -3)px 平移误差必须 ≤0.35px，同图位移最大值 ≤0.001px，错误通道 / 尺寸和注入 NaN 必须拒绝。失败会抛错并返回非零，不能将部分运行视为成功。初次两对试算约 0.039 / 0.037 秒，完整 31 对约 1.2 秒（不含启动、固定控制和依赖安装）；这些是本机素材制作耗时，不是运行时帧率。

`dev-focus-mesh.html` 使用独立绘制的色块验证半程位置、透明度、无原位 / 终位双影、端点、竖向坐标、零位移、上下文丢失回退，并确认反向错误位移无法通过半程检测。控制通过后仍需观看真实人物动作，不能由合成色块证明人体动作自然。

### 早先卡片版来源记录

使用内置 **image_gen**，未使用 API / CLI 回退。两张原画均由本轮生成，人物为原创通用武侠概念，尚未命名，不等于最终 IP 定稿。人物以山林原画为风格参考，透明底单独生成。

| 用途 | 原画 | 运行资源 |
|---|---|---|
| 松下山林石台 | `assets/focus/pine-retreat-source.png` | `public/art/focus/pine-retreat.webp`（1280 × 853） |
| 青衣打坐人物 | `assets/focus/wuxia-meditator-source.png` | `public/art/focus/wuxia-meditator.webp`（768 × 768，保留透明） |

通过项目已有 Sharp 仅等比例缩小并转 WebP，运行资源合计约 487 KiB。字体、计时、文案与按钮都为真实 HTML，不烘焙到图中。场景与人物预缓存并随原生资源打包；BASE_URL 支持部署子路径。

### 山林原画完整提示

```text
Use case: stylized-concept
Asset type: production illustration background for 芸窗, an offline Chinese guofeng mobile focus timer.
Primary request: a serene Chinese wuxia meditation setting, without a person, drawn as elegant traditional Chinese shanshui watercolor and fine gongbi illustration on warm ivory xuan paper. Strongly Chinese 国风, restrained ink wash with muted 青绿 mineral greens, ink grey pine, warm stone, faint cinnabar accents. Refined original illustration, not anime, not photorealistic, not 3D.
Scene: an ancient pine growing from the upper left above a quiet mountain terrace, layered misty Chinese peaks in the distance, a small still mountain stream and low rocks, a few bamboo leaves toward the right. No buildings are necessary. A broad flat warm grey meditation stone is centered in the foreground in the lower quarter; its upper surface is visible and empty so a seated character can be composited onto it. Grounding shadow on the stone should be very subtle.
Composition/framing: landscape 3:2 frame. Keep the central lower stone fully in frame and welcoming; quiet mist and pale paper in upper middle, elegant pine branch silhouette in upper left. Rich art detail at the sides, calm center. The foreground stone is around 75-88 percent down the image. It will be cropped to a horizontal mobile card so keep key content within the middle 80 percent.
Lighting/mood: soft mountain morning light, tranquil, breathable, a private place to sit quietly.
Text: none. No lettering, logos, calligraphy, border, interface, timer, watermark, person, human, silhouettes, statues, floating magical effects. Full bleed illustration.
```

### 人物原画完整提示

```text
Use case: stylized-concept
Asset type: transparent foreground character illustration for a Chinese guofeng wuxia meditation focus app.
Input image: the referenced landscape is a STYLE and LIGHTING reference only. Create a separate seated character cutout, do not reproduce its scenery.
Primary request: an original young adult Chinese wandering swordsman quietly meditating cross-legged, full seated body visible, calm eyes closed, both natural hands resting on knees, composed and approachable. Traditional Chinese wuxia hanfu layers in desaturated pine teal with ivory inner robe, a muted charcoal belt, long dark hair in a simple high half-up topknot. A sheathed traditional jian rests diagonally beside the left knee, completely in the silhouette and not drawn. No armor, no religious symbols. Quiet young martial artist, not a monk. A small cinnabar hair tie is the only bright detail. Original generic character, no named franchise.
Style/medium: refined traditional Chinese gongbi brush lines and soft shanshui watercolor on subtly textured cloth. Painterly, gentle, mature proportions; strongly 国风 wuxia, matching the reference image. Not anime, chibi, game 3D, neon fantasy, or photorealism.
Composition: nearly frontal slight three-quarter view, symmetrical stable seated silhouette. Entire topknot, fingers, crossed legs, robe and sheathed sword fit fully within the canvas, with about 10 percent padding all around. Lower hem is seated on a flat surface; no stone, no plinth, no landscape, no frame. Character fills 80 percent of a square canvas. Soft morning light from upper left.
Constraints: truly transparent background, crisp clean alpha edges around the complete character, no baked white or checkerboard background, no ground shadow beyond the body silhouette, no text, watermark, labels or UI. Careful natural anatomy, exactly two arms and two hands.
```

## 验证入口

- `node --test tests/*.test.mjs`：原有单测及新增计时边界单测。
- `python tools/run_acceptance.py --page dev-focus.html`：真实 App、IndexedDB、阅读路由、暂停/重开、并发完成、写入失败、备份去重和坏记录拒绝。
- `python tools/run_acceptance.py --page dev-focus-motion.html`：真实动画时间线、连续姿态、实际镜头缩放、UI 渐隐、隐藏控件不可聚焦、小计时、暂停观景、从其他页返回不重播及反向收功。
- `python tools/run_acceptance.py`：整套阅读器回归（包括打坐与动作页，共 21 页）。
- `node tools/patch_inappbrowser.mjs`、`node tools/copy_pdf_assets.mjs`，再执行 `node node_modules/vite/bin/vite.js build --base=/book-reader/` 验证子路径和 PWA；`build --mode android` 验证原生离线资源构建。

32 帧版界面见 `docs/design/focus-immersive-390-32.png`、`focus-immersive-active-32.png`、`focus-immersive-controls-32.png`、`focus-immersive-320-32.png` 和 `focus-immersive-1280-32.png`。`focus-immersive-enter-32.gif` 为真实页面的采样实录（46 个屏幕截图帧，保留采样间隔，结尾额外停留）；截图数量与人物姿态数是不同概念，此预览不作为浏览器或真机目标帧率的结论。无 `-32` 的沉浸截图与旧 `focus-mobile.png` 作为历史记录保留。

真机验收待完成：Android / iPhone 覆盖安装保留原书库；打坐中锁屏/切 App/重新打开；暂停后锁屏；进入阅读并恢复阅读位置；设备静音及音频策略；备份迁移与无障碍字体放大。

### 早先卡片版验证结果（沉浸版结果见下节）

- 75 / 75 项 Node 单元测试通过。
- 整套 20 / 20 个浏览器验收页通过；后续保存失败与收起提示改动的打坐专项 24 项断言再次通过。
- 320 × 740、390 × 844、1280 × 900 及 390px 深色模式实测无横向溢出；两种手机尺寸默认开始按钮均在导航上方完整可见；减少动态效果时人物动画为 none。
- `/book-reader/` 子路径生产构建、PWA 预缓存生成、Android 模式离线资源构建通过。两张运行美术均进入 PWA 缓存和 Android 资源目录。
- 独立 Chrome profile 中加载生产子路径，等待 Service Worker 接管后强制网络离线，刷新仍能加载人物与场景；离线开始打坐并再次刷新后计时仍可接回。截图 `docs/design/focus-offline.png`。
- `git diff --check` 通过。本轮为本地实现，没有版本递增、GitHub 推送、APK 发布或真机安装记录。

### 原画 SHA-256

```text
assets/focus/pine-retreat-source.png
CA21E2A4ADBF2B9DBFAC0F9970503B5E2851265A07E9F46AD27B069E31CA6EFF
assets/focus/wuxia-meditator-source.png
B697D2A29872A791715C7A7EA2BC45F082E6A1335BE91B63DC9105153350C192
public/art/focus/pine-retreat.webp
2242776666C10D56032BA497788D897BCB1559E64D773A542517F089A9731785
public/art/focus/wuxia-meditator.webp
75FDEE3E21543BEEF0C9725B9886C1D5562D0DA12FB5D0CD080E47117EE02C24
```

## 2026-11-02 沉浸版验收记录（16 帧历史基线）

- 79 / 79 项 Node 单元测试通过：包含计时与新增镜头 / 动作轨道边界。
- 21 / 21 个完整浏览器验收页通过；打坐数据页 25 项、真实动作页 12 项断言通过。原始终轮日志见 `docs/qa/focus-immersive-suite-verified.log`。
- 真正截取入座中的多个时间点：人物从第 0 帧到中间屈膝帧，再到第 15 帧；镜头从 1 倍逐渐推进至 1.17 倍，UI / 导航透明度降为 0。暂停、收起、返回不重播、反向收功均实测。
- 320 × 740、390 × 844、1280 × 900 全视口覆盖、无横向溢出；深色模式与减少动态效果已检查。小计时数字为 14px。
- 子路径网页构建、PWA 预缓存和 Android 网页资源构建通过，新增两张美术均已内置。
- 强制网络离线后刷新生产网页，山水与动作图集均可载入；离线开始并再次刷新，恢复盘坐姿态和活动计时。见 `docs/qa/focus-immersive-offline.log`。
- `python tools/test_browser_smoke.py` 的 96 条突发回执和结束标记后故意迟到的 BAD 两个控制场景通过；CI 已加入此检查。
- 前两轮分别为 18/21、19/21，不能当作通过。包含一次 PDF 高亮重开未显示、EPUB / token 页缺少结束回执，以及打坐测试错误地把保留但隐藏的开始区域当作就绪。PDF / EPUB 单独复查通过；打坐测试改为等待实际待机状态。日志接收器改为并发接收、扩大队列，并在终止前等待 0.4 秒安静窗口，保留迟到的失败。没有通过忽略失败或修改 PDF / EPUB 代码取得通过。原始失败日志保存在 `docs/qa/focus-immersive-suite-attempt1.log` 与 `focus-immersive-suite-attempt2.log`。

### 沉浸版美术 SHA-256

```text
assets/focus/pine-vista-portrait-source.png
146C99A8AB3183E9E4BC34A334DA5CD7ECE34616DE7322655C3DCB0B9565C414
assets/focus/wuxia-sit-sequence-source.png
698D229AA87984437F9857707736C55B2C107FF62AC75E5AE52295CA43CB5F07
public/art/focus/pine-vista-portrait.webp
7294E08C6AF03ADECDD0D4DF86FB8BF529055828A503DC145F9C4E804F7FFD71
public/art/focus/wuxia-sit-sequence.webp
33690FB4B0F5AC727C0CC39AC38D22F74308F15327100294955FB6E758590BDA
```

## 2026-11-03：32 帧升级验收

- 重新生成 32 个姿态；Node 检查真实运行 WebP 的 8 × 4 格子，32 格均非空且像素指纹各异。覆盖行尾 / 下一行与最终第 31 帧的寻址，避免只改播放常量。
- 81 项 Node 单测、12 项动作断言、25 项数据与阅读 / 备份断言通过。入座、起身、暂停观景、返回不重播均在真实浏览器复测。
- 320 / 390px 手机和 1280px 宽屏检查通过，图景覆盖视口，无横向溢出；减少动态效果仍直接切姿态。
- 网页子路径生产构建、PWA 缓存、Android 网页资源构建均包含新 32 帧素材。断网重新加载生产网页后可恢复第 31 帧盘坐和原计时。
- 本轮相关专项重新执行，上轮全套 21 页的完整记录保留；本轮没有重复整套 21 页，也没有发布安装包。日志为 `docs/qa/focus32-*.log`。

```text
assets/focus/wuxia-sit-sequence-32-source.png
05A1CCF5694F0D472F9277B749EBF78F7E27AF61D806DBB9024E84D5110948F1
public/art/focus/wuxia-sit-sequence-32.webp
0932BF6CDD5BBC0E07B5AD6496609C994AA0E03949BA3FC59331C0918013880D
```

## 2026-11-03：连续运动网格插值验收（当前）

- 84 / 84 项 Node 单测通过，包含运动二进制解码 / 损坏数据拒绝、独立平移几何 / UV 检查、网格边界和来源图集 SHA 一致性。
- 完整 22 / 22 页浏览器回归通过：新增 GPU 网格页 9 项控制、真实动作页 14 项断言、打坐数据 / 阅读 / 备份页 25 项断言。React Profiler 验证入座期间页面提交次数小于 30，未随每帧进度重渲染整页；这项断言不代表实际渲染帧率。
- 实际场景在 320 / 390px 及 1280px 视口使用 `webgl-flow`，检查了中间姿态、入座 / 收功、镜头推进、浮层退出、14px 计时、全屏覆盖和减少动态效果。截图见 `docs/design/*-mesh.png`；实录采样 46 张界面帧只用于查看过程，不能用其采样数量认证帧率。
- 网页子路径和 Android 网页资源构建通过，两个构建中的位移二进制 SHA 与源文件一致，Workbox 预缓存包含 `.bin`。生产网页强制断网后刷新，实际加载 270088 字节位移数据并启用 `webgl-flow`；离线开始再刷新，保留同一会话 ID、开始时间、计时锚点、目标时长及盘坐状态。截图为 `docs/design/focus-immersive-offline-mesh.png`。
- 日志接收器突发回执和故意迟到失败控制通过。最终完整回归日志为 `docs/qa/focus-mesh-suite-verified.log`，其余单测、制作、视觉、构建、离线和打包校验日志使用同一 `focus-mesh-` 前缀。
- 首次 Node 单测因模块导入缺少 `.js` 扩展名失败，修正后通过；原始失败日志为 `focus-mesh-unit-attempt1.log`。第一轮全套 22 页通过，但 Windows GBK 输出对部分符号产生 `UnicodeEncodeError`；保留 `focus-mesh-suite-encoding-attempt.log`，使用 UTF-8 完整重跑后无此异常。没有删除失败断言或缩小套件范围。
- 本轮未发布 APK / IPA；上述浏览器和资源构建结果不能替代 Android / iOS 真机动作观感、帧率和锁屏行为验收。

```text
public/art/focus/wuxia-motion-v1.bin
0FC07C681B7CC405022AFE6A24A64FCD23CBA07ED0D822522149A30B510700AA
```

## 高清姿态（v0.3.0-alpha.6）

立姿和盘坐原画由内置 ImageGen 重绘，参考原 32 帧图集的首尾帧。提示词要求保持背身青衣、朱色发带、左侧佩剑和原有轮廓，采用工笔设色，输出双姿态透明底画稿。两张 WebP 按原首尾帧落脚点对齐到 1024 × 1024 透明画幅，位于 `public/art/focus/wuxia-stand-hd.webp` 和 `public/art/focus/wuxia-sit-hd.webp`。

入座和收功仍由原 32 帧运动网格驱动，首尾各两帧衔接高清图。画布按显示宽度、设备像素比和镜头推进计算背板，单边最多 1152px。WebGL 不可用时 Canvas 仍可显示高清首尾姿态。
