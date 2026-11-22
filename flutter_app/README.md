# 芸窗 Flutter 阅读原型

手机端的第一批实现，使用独立安装标识。打开旧版「芸窗」或「阅读器」导出的 JSON，可以预览真实书架，打开包含原文件的 UTF-8 或 UTF-16 TXT，接着备份中的章节与位置读。备份预览在内存中运行。持久化书库、PDF／EPUB 阅读和称号与打坐按[实现计划](../docs/FLUTTER_IMPLEMENTATION_PLAN.md)开发。

## 运行和检查

在本目录使用 Flutter 3.50.1。安装 Android SDK 后可启动 Android 原型。iOS 使用装有 Xcode 的 macOS。

```sh
flutter pub get
flutter analyze
flutter test
dart --disable-dart-dev tool/check_legacy_migration.dart
flutter run
```

- `flutter test` 检查从备份进入书架的界面路径，以及缺少原文件时的提示。
- `tool/check_legacy_migration.dart` 可用独立 Dart SDK 运行。它验证仓库的 UTF-8 样本文本、UTF-16 与换行规范化、旧章内偏移，以及损坏原文件、重复书籍 ID、无对应书籍的文件和未知备份版本。通过时打印检查结果，失败时以非零状态退出。调整解码、分章或备份读取时同时跑此检查。

## 实机验证步骤

在旧版导入一本 TXT，读到书中位置后，导出勾选「包含原文件」的备份。把备份文件存到设备可访问的位置，在芸窗原型中打开并点击「继续阅读」。对照旧版检查章节和章内位置。原型每次启动后重新选择备份。

2026 年 11 月 22 日，Flutter 静态分析、书架界面测试和旧版备份解码检查通过。同一份 UTF-8 样本的分章及续读文字与旧 JavaScript 实现一致。原生文件选择和实际滚动位置仍需 Android 与 iOS 真机验证。

## GitHub 测试包

`main` 和 `codex/flutter-android-preview` 分支的 Flutter Android preview 工作流构建独立安装的调试 APK。构建成功后，从运行详情的 Artifacts 下载 `yunchuang-flutter-preview-android`，解压后安装 APK。产物附带 SHA-256 校验值。
