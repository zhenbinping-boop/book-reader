import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yunchuang_preview/epub_text.dart';
import 'package:yunchuang_preview/legacy_backup.dart';
import 'package:yunchuang_preview/shelf_store.dart';

void main() {
  late Directory directory;
  late ShelfStore library;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('yunchuang-shelf-');
    library = await ShelfStore.open(directory);
  });

  tearDown(() => directory.delete(recursive: true));

  test('恢复不含原文件的 EPUB 后可以补回正文，重开书架仍可阅读', () async {
    final epub = File('../samples/sample.epub');
    final bytes = await epub.readAsBytes();
    final backup = LegacyBackup.parse(
      jsonEncode({
        'app': 'book-reader',
        'schemaVersion': 1,
        'books': [
          {
            'id': 7,
            'format': 'epub',
            'title': '原书名',
            'fileHash': 'sha256:${sha256.convert(bytes)}',
            'lastReadAt': 1760000000000,
          },
        ],
        'progress': [
          {'bookId': 7, 'chapterIndex': 1, 'charOffset': 8},
        ],
        'highlights': [
          {'bookId': 7, 'note': '旧笔记'},
        ],
      }),
    );
    await library.restore(backup);
    final missing = library.books.single;
    expect(library.original(missing), isNull);
    await expectLater(
      library.importFile(
        XFile('../samples/sample-ncx.epub'),
        replacing: missing,
      ),
      throwsFormatException,
    );
    expect(library.original(missing), isNull);

    final restored = await library.importFile(
      XFile.fromData(
        bytes,
        path: 'renamed.bin',
        mimeType: 'application/octet-stream',
      ),
      replacing: missing,
    );
    expect(restored.id, missing.id);
    expect(restored.title, '原书名');
    expect(restored.chapterIndex, 1);
    expect(restored.charOffset, 8);

    final reopened = await ShelfStore.open(directory);
    final chapterText = readEpubText(
      await reopened.original(reopened.books.single)!.readAsBytes(),
    );
    // The sample declares six spine entries. The ghost chapter has no file.
    expect(chapterText.chapters, hasLength(5));
    expect(chapterText.chapters.first.title, '第一章 晨读');
    expect(chapterText.text, contains('约定的暗号'));
    expect(
      directory
          .listSync()
          .whereType<File>()
          .where((file) => file.path.contains('legacy-'))
          .single
          .readAsStringSync(),
      contains('旧笔记'),
    );

    await reopened.savePosition(reopened.books.single, (
      chapterIndex: 2,
      charOffset: 9,
      pdfPage: 1,
    ));
    await reopened.restore(backup);
    expect(reopened.books.single.chapterIndex, 2);
    expect(reopened.original(reopened.books.single), isNotNull);
  });

  test('新书架可以直接导入 TXT、EPUB、PDF，重复文件复用原条目', () async {
    for (final filename in [
      'sample-utf8.txt',
      'sample-ncx.epub',
      'sample.pdf',
    ]) {
      final file = XFile('../samples/$filename');
      final first = await library.importFile(file);
      final repeated = await library.importFile(file);
      expect(repeated.id, first.id);
    }
    final restored = await ShelfStore.open(directory);
    expect(
      restored.books.map((b) => b.format).toSet(),
      BookFormat.values.toSet(),
    );
    for (final book in restored.books) {
      expect(restored.original(book), isNotNull);
    }
  });
}
