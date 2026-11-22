import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:yunchuang_preview/legacy_backup.dart';
import 'package:yunchuang_preview/main.dart';

void main() {
  testWidgets('旧版备份显示续读与缺文件状态', (tester) async {
    final backup = LegacyBackup.parse(
      jsonEncode({
        'app': 'book-reader',
        'schemaVersion': 1,
        'books': [
          {'id': 1, 'format': 'txt', 'title': '山中小记', 'lastReadAt': 1000},
          {'id': 2, 'format': 'pdf', 'title': '山水图册'},
        ],
        'files': [
          {'bookId': 1, 'data': base64Encode(utf8.encode('山中有风。'))},
        ],
      }),
    );

    await tester.pumpWidget(YunchuangApp(pickBackup: () async => backup));
    await tester.tap(find.text('打开旧版备份'));
    await tester.pumpAndSettle();

    expect(find.text('山中小记'), findsOneWidget);
    expect(find.text('继续阅读《山中小记》'), findsOneWidget);
    expect(find.text('山水图册'), findsOneWidget);
    expect(find.text('PDF · 缺少原文件'), findsOneWidget);
  });
}
