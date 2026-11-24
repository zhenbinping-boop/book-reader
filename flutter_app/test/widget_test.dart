import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:yunchuang_preview/legacy_backup.dart';
import 'package:yunchuang_preview/main.dart';
import 'package:yunchuang_preview/shelf_store.dart';

void main() {
  late Directory directory;
  late ShelfStore library;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('yunchuang-widget-');
    library = await ShelfStore.open(directory);
  });

  tearDown(() => directory.delete(recursive: true));

  testWidgets('首次打开进入书架，恢复备份在菜单内', (tester) async {
    await tester.pumpWidget(YunchuangApp(openShelf: () async => library));
    await tester.pumpAndSettle();

    expect(find.text('书架'), findsOneWidget);
    expect(find.text('导入图书'), findsOneWidget);
    expect(find.text('恢复旧版备份'), findsNothing);
    await tester.tap(find.byTooltip('书架菜单'));
    await tester.pumpAndSettle();
    expect(find.text('恢复旧版备份'), findsOneWidget);
  });

  testWidgets('缺正文的书目从书架直接打开图书文件选择', (tester) async {
    await tester.runAsync(
      () => library.restore(
        LegacyBackup.parse(
          '{"app":"book-reader","books":[{"id":1,"title":"待补的书","format":"epub"}]}',
        ),
      ),
    );
    var bookPicks = 0;
    await tester.pumpWidget(
      YunchuangApp(
        openShelf: () async => library,
        pickBook: () async {
          bookPicks++;
          return null;
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('EPUB · 缺少原文件'), findsOneWidget);
    await tester.tap(find.text('补原文件'));
    await tester.pumpAndSettle();
    expect(bookPicks, 1);
  });
}
