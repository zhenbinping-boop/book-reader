# 芸窗 Flutter 阅读原型

Flutter 手机端原型使用独立安装标识。启动进入书架，点「导入图书」可选 TXT、EPUB 或 PDF。「恢复旧版备份」在书架菜单中。若备份缺少某本书的正文，点击该书的「补原文件」。有旧版文件指纹的记录会核对原文件，补回后沿用书名和续读信息。

书架与原文件保存在应用本地。当前支持 UTF-8／UTF-16 TXT、EPUB 正文文字和 PDF 页面浏览。EPUB 的插图与原书版式、笔记和高亮界面、称号与打坐按[实现计划](../docs/FLUTTER_IMPLEMENTATION_PLAN.md)继续开发。

## 运行和检查

在本目录使用 Flutter 3.50.1。安装 Android SDK 后可启动 Android 原型。iOS 使用装有 Xcode 的 macOS。

```sh
flutter pub get
flutter analyze
flutter test
dart --disable-dart-dev tool/check_legacy_migration.dart
flutter run
```

- `flutter test` 检查首次启动的书架和备份入口，以及 EPUB 补原文件、错误文件拒载、重复导入和重开书架。
- `tool/check_legacy_migration.dart` 可用独立 Dart SDK 运行。它验证仓库的 UTF-8 样本文本、UTF-16 与换行规范化、旧章内偏移，以及损坏原文件、重复书籍 ID、无对应书籍的文件和未知备份版本。通过时打印检查结果，失败时以非零状态退出。调整解码、分章或备份读取时同时跑此检查。

## 实机验证步骤

首次启动后，在书架导入 PDF、EPUB 和 TXT。另从旧版导出一份仅含书目和阅读记录的 JSON，把它和原书文件放到设备上。通过书架菜单恢复备份，再点缺文件条目的「补原文件」。选中原文件后打开正文，退出应用并重开，检查书籍和位置。

原生文件选择和实际滚动位置需要 Android 与 iOS 真机验证。

## GitHub 测试包

`main` 和 `codex/flutter-android-preview` 分支的 Flutter Android preview 工作流构建独立安装的调试 APK。构建成功后，从运行详情的 Artifacts 下载 `yunchuang-flutter-preview-android`，解压后安装 APK。产物附带 SHA-256 校验值。
