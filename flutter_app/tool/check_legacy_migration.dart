// Relative imports keep this check runnable with a standalone Dart SDK.
// ignore_for_file: avoid_relative_lib_imports

import 'dart:convert';
import 'dart:io';

import '../lib/legacy_backup.dart';
import '../lib/legacy_txt.dart';

void check(bool passed, String description) {
  if (!passed) throw StateError(description);
}

void rejects(void Function() action, String description) {
  try {
    action();
  } on FormatException {
    return;
  }
  throw StateError(description);
}

void main() {
  final sample = File.fromUri(
    Platform.script.resolve('../../samples/sample-utf8.txt'),
  );
  final encodedSample = base64Encode(sample.readAsBytesSync());
  final backup = <String, Object>{
    'app': 'book-reader',
    'schemaVersion': 1,
    'books': [
      {'id': 31, 'title': '测试藏书', 'format': 'txt', 'lastReadAt': 1760000000000},
      {'id': 32, 'title': '只有书籍信息的 PDF', 'format': 'pdf'},
      {'id': 33, 'title': '新书', 'format': 'txt'},
    ],
    'progress': [
      {'bookId': 31, 'chapterIndex': 1, 'charOffset': 8},
    ],
    'files': [
      {'bookId': 31, 'data': encodedSample},
      {'bookId': 33, 'data': base64Encode(utf8.encode('新书正文'))},
    ],
  };
  final library = LegacyBackup.parse(jsonEncode(backup));
  check(
    library.books.length == 3,
    'The original shelf must contain all books.',
  );
  check(
    !library.books[1].hasOriginal,
    'A metadata-only PDF must stay on the shelf.',
  );
  final book = library.books.first;
  check(
    library.recentReadableBook == book,
    'Resume must select the previous TXT.',
  );
  check(book.title == '测试藏书', 'Chinese titles must be preserved.');
  check(
    book.chapterIndex == 1 && book.charOffset == 8,
    'Resume anchor changed.',
  );

  final document = TextDocument.fromBook(book);
  check(document.chapters.length == 5, 'Expected a preface and four chapters.');
  check(
    document.chapters.first.title == '开始',
    'The preface must remain readable.',
  );
  final chapter = document.chapters[book.chapterIndex];
  check(
    chapter.title == '第1章 出发',
    'The legacy anchor selected a different chapter.',
  );
  final absolute = chapter.start + book.charOffset;
  check(
    document.text.startsWith('他说', absolute),
    'The legacy anchor selected different text.',
  );
  check(
    !document.text.contains('\r'),
    'Legacy CRLF must use LF-based offsets.',
  );

  final units = '甲\r\n乙'.codeUnits;
  final utf16File = base64Encode([
    0xff,
    0xfe,
    for (final unit in units) ...[unit & 0xff, unit >> 8],
  ]);
  final encoded = LegacyBackup.parse(
    jsonEncode({
      ...backup,
      'files': [
        {'bookId': 31, 'data': utf16File},
      ],
    }),
  );
  final utf16Document = TextDocument.fromBook(encoded.books.first);
  check(utf16Document.text == '甲\n乙', 'UTF-16 BOM and CRLF must be handled.');

  rejects(() => LegacyBackup.parse('{'), 'Malformed JSON must fail.');
  rejects(
    () => LegacyBackup.parse(jsonEncode({...backup, 'schemaVersion': 9})),
    'Unknown schema must fail.',
  );
  rejects(
    () => LegacyBackup.parse(
      jsonEncode({
        ...backup,
        'books': [
          {'id': 1, 'title': 'A'},
          {'id': '1', 'title': 'B'},
        ],
      }),
    ),
    'Duplicate IDs must fail.',
  );
  rejects(
    () => LegacyBackup.parse(
      jsonEncode({
        ...backup,
        'files': [
          {'bookId': 999, 'data': encodedSample},
        ],
      }),
    ),
    'An orphan file must fail.',
  );
  final damaged = LegacyBackup.parse(
    jsonEncode({
      ...backup,
      'files': [
        {'bookId': 31, 'data': '???'},
      ],
    }),
  );
  rejects(
    () => TextDocument.fromBook(damaged.books.first),
    'A damaged file must be reported when opened.',
  );
  // ignore: avoid_print
  print('芸窗旧版备份与 TXT 续读检查通过');
}
