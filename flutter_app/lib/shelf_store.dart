import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:math' as math;

import 'package:archive/archive.dart';
import 'package:cross_file/cross_file.dart';
import 'package:crypto/crypto.dart';

import 'legacy_backup.dart';

class ShelfBook {
  const ShelfBook({
    required this.id,
    required this.title,
    required this.author,
    required this.format,
    required this.chapterIndex,
    required this.charOffset,
    required this.pdfPage,
    required this.lastReadAt,
    this.fileName,
    this.fileHash,
    this.legacyKey,
  });

  factory ShelfBook.fromJson(Map<String, dynamic> data) => ShelfBook(
    id: data['id'] as int,
    title: data['title'] as String,
    author: data['author'] as String,
    format: BookFormat.values.byName(data['format'] as String),
    chapterIndex: data['chapterIndex'] as int,
    charOffset: data['charOffset'] as int,
    pdfPage: data['pdfPage'] as int,
    lastReadAt: data['lastReadAt'] as int,
    fileName: data['fileName'] as String?,
    fileHash: data['fileHash'] as String?,
    legacyKey: data['legacyKey'] as String?,
  );

  final int id;
  final String title;
  final String author;
  final BookFormat format;
  final int chapterIndex;
  final int charOffset;
  final int pdfPage;
  final int lastReadAt;
  final String? fileName;
  final String? fileHash;
  final String? legacyKey;

  Map<String, Object?> toJson() => {
    'id': id,
    'title': title,
    'author': author,
    'format': format.name,
    'chapterIndex': chapterIndex,
    'charOffset': charOffset,
    'pdfPage': pdfPage,
    'lastReadAt': lastReadAt,
    'fileName': fileName,
    'fileHash': fileHash,
    'legacyKey': legacyKey,
  };
}

typedef ReadingPosition = ({int chapterIndex, int charOffset, int pdfPage});

class ShelfStore {
  ShelfStore._(this._root, this._books);

  final Directory _root;
  List<ShelfBook> _books;

  static Future<ShelfStore> open(Directory root) async {
    await root.create(recursive: true);
    final index = File('${root.path}/books.json');
    if (!await index.exists()) return ShelfStore._(root, []);
    final rows = jsonDecode(await index.readAsString()) as List<dynamic>;
    return ShelfStore._(
      root,
      rows
          .map((row) => ShelfBook.fromJson(row as Map<String, dynamic>))
          .toList(),
    );
  }

  List<ShelfBook> get books => List.unmodifiable(_books);

  File? original(ShelfBook book) {
    final name = book.fileName;
    if (name == null || !_storedName.hasMatch(name)) return null;
    final file = File('${_root.path}/$name');
    return file.existsSync() ? file : null;
  }

  Future<ShelfBook> importFile(XFile input, {ShelfBook? replacing}) async {
    final temporary = await _root.createTemp('import-');
    try {
      final staged = File('${temporary.path}/book');
      await input.saveTo(staged.path);
      final format = await _readFormat(
        staged,
        _formatFor(input.name) ?? replacing?.format,
      );
      if (replacing != null && format != replacing.format) {
        throw FormatException(
          '请选择 ${replacing.format.name.toUpperCase()} 原文件。',
        );
      }
      final hash = await _hash(staged);
      if (replacing?.fileHash case final expected?) {
        await _verifyFingerprint(staged, hash, expected);
      }
      ShelfBook? linked = replacing;
      linked ??= _find(
        _books,
        (book) => book.format == format && book.fileHash == hash,
      );
      if (linked == null &&
          _books.any((b) => b.fileHash?.startsWith('fnv1a:') ?? false)) {
        final oldHash = await _legacyHash(staged);
        linked = _find(
          _books,
          (book) => book.format == format && book.fileHash == oldHash,
        );
      }
      if (linked != null && original(linked) != null) return linked;

      final name = await _storeFile(staged, hash, format);
      final dot = input.name.lastIndexOf('.');
      final book = ShelfBook(
        id: linked?.id ?? _nextId(_books),
        title:
            linked?.title ??
            (dot > 0 ? input.name.substring(0, dot) : input.name),
        author: linked?.author ?? '',
        format: format,
        chapterIndex: linked?.chapterIndex ?? 0,
        charOffset: linked?.charOffset ?? 0,
        pdfPage: linked?.pdfPage ?? 1,
        lastReadAt: linked?.lastReadAt ?? 0,
        fileName: name,
        fileHash: linked?.fileHash ?? hash,
        legacyKey: linked?.legacyKey,
      );
      await _commit(_replace(_books, book));
      return book;
    } finally {
      await temporary.delete(recursive: true);
    }
  }

  Future<void> restore(LegacyBackup backup) async {
    var merged = List<ShelfBook>.of(_books);
    final temporary = await _root.createTemp('restore-');
    try {
      for (final entry in backup.books) {
        final key = jsonEncode([
          entry.id,
          entry.format.name,
          entry.title,
          entry.author,
        ]);
        String? actualHash;
        String? name;
        if (entry.hasOriginal) {
          final staged = File('${temporary.path}/book');
          await staged.writeAsBytes(entry.readOriginal(), flush: true);
          if (await _readFormat(staged, entry.format) != entry.format) {
            throw FormatException('《${entry.title}》的原文件与备份格式不一致。');
          }
          actualHash = await _hash(staged);
          if (entry.fileHash case final expected?) {
            await _verifyFingerprint(staged, actualHash, expected);
          }
          name = await _storeFile(staged, actualHash, entry.format);
        }

        final existing = _find(
          merged,
          (book) =>
              book.format == entry.format &&
              ((actualHash != null && book.fileHash == actualHash) ||
                  (entry.fileHash != null && book.fileHash == entry.fileHash) ||
                  (name != null && book.fileName == name) ||
                  (book.legacyKey == key &&
                      (book.fileHash == null ||
                          (entry.fileHash == null &&
                              (name == null || book.fileName == null))))),
        );
        final useBackup =
            existing == null || entry.lastReadAt > existing.lastReadAt;
        final book = ShelfBook(
          id: existing?.id ?? _nextId(merged),
          title: entry.title,
          author: entry.author,
          format: entry.format,
          chapterIndex: useBackup ? entry.chapterIndex : existing.chapterIndex,
          charOffset: useBackup ? entry.charOffset : existing.charOffset,
          pdfPage: useBackup ? entry.pdfPage : existing.pdfPage,
          lastReadAt: useBackup ? entry.lastReadAt : existing.lastReadAt,
          fileName: name ?? existing?.fileName,
          fileHash: existing?.fileHash ?? entry.fileHash ?? actualHash,
          legacyKey: key,
        );
        merged = _replace(merged, book);
      }
      final backupKey = sha256.convert(utf8.encode(backup.metadata));
      await _writeAtomic('legacy-$backupKey.json', backup.metadata);
      await _commit(merged);
    } finally {
      await temporary.delete(recursive: true);
    }
  }

  Future<void> savePosition(ShelfBook book, ReadingPosition position) async {
    final updated = ShelfBook(
      id: book.id,
      title: book.title,
      author: book.author,
      format: book.format,
      chapterIndex: position.chapterIndex,
      charOffset: position.charOffset,
      pdfPage: position.pdfPage,
      lastReadAt: DateTime.now().millisecondsSinceEpoch,
      fileName: book.fileName,
      fileHash: book.fileHash,
      legacyKey: book.legacyKey,
    );
    await _commit(_replace(_books, updated));
  }

  Future<String> _storeFile(File staged, String hash, BookFormat format) async {
    final name = '${hash.substring('sha256:'.length)}.${format.name}';
    final target = File('${_root.path}/$name');
    if (!await target.exists()) await staged.rename(target.path);
    return name;
  }

  Future<void> _commit(List<ShelfBook> books) async {
    await _writeAtomic(
      'books.json',
      jsonEncode(books.map((b) => b.toJson()).toList()),
    );
    _books = books;
  }

  Future<void> _writeAtomic(String name, String data) async {
    final staged = File('${_root.path}/$name.next');
    await staged.writeAsString(data, flush: true);
    await staged.rename('${_root.path}/$name');
  }
}

final _storedName = RegExp(r'^[0-9a-f]{64}\.(txt|epub|pdf)$');

BookFormat? _formatFor(String name) {
  final dot = name.lastIndexOf('.');
  return switch (dot < 0 ? '' : name.substring(dot + 1).toLowerCase()) {
    'txt' || 'text' => BookFormat.txt,
    'epub' => BookFormat.epub,
    'pdf' => BookFormat.pdf,
    _ => null,
  };
}

Future<BookFormat> _readFormat(File file, BookFormat? hint) async {
  final source = await file.open();
  try {
    final bytes = await source.read(1024);
    final header = latin1.decode(bytes);
    if (header.contains('%PDF-')) return BookFormat.pdf;
    final zip = header.startsWith('PK\x03\x04');
    if (zip) {
      final path = file.path;
      if (await Isolate.run(() => _hasEpubContainer(path))) {
        return BookFormat.epub;
      }
    } else if (hint == BookFormat.txt && bytes.isNotEmpty) {
      return BookFormat.txt;
    }
    throw const FormatException('无法识别这本书，请选择完整的 TXT、EPUB 或 PDF 文件。');
  } finally {
    await source.close();
  }
}

bool _hasEpubContainer(String path) {
  final input = InputFileStream(path);
  try {
    return ZipDecoder()
        .decodeStream(input, throwOnError: true)
        .files
        .any((entry) => entry.isFile && entry.name == 'META-INF/container.xml');
  } catch (_) {
    return false;
  } finally {
    input.closeSync();
  }
}

Future<String> _hash(File file) async =>
    'sha256:${await sha256.bind(file.openRead()).first}';

Future<String> _legacyHash(File file) async {
  const sample = 1024 * 1024;
  final size = await file.length();
  var hash = 0x811c9dc5;
  for (final stream in [
    file.openRead(0, math.min(size, sample)),
    file.openRead(math.max(0, size - sample)),
  ]) {
    await for (final chunk in stream) {
      for (final byte in chunk) {
        hash = ((hash ^ byte) * 0x01000193) & 0xffffffff;
      }
    }
  }
  return 'fnv1a:${size.toRadixString(16)}:${hash.toRadixString(16)}';
}

Future<void> _verifyFingerprint(File file, String hash, String expected) async {
  if (expected == hash) return;
  if (expected.startsWith('fnv1a:') && await _legacyHash(file) == expected) {
    return;
  }
  throw const FormatException('这个文件与备份中的原书不匹配，请选择原来导入的同一本书。');
}

ShelfBook? _find(List<ShelfBook> books, bool Function(ShelfBook) matches) {
  for (final book in books) {
    if (matches(book)) return book;
  }
  return null;
}

int _nextId(List<ShelfBook> books) =>
    books.fold(0, (highest, book) => math.max(highest, book.id)) + 1;

List<ShelfBook> _replace(List<ShelfBook> books, ShelfBook value) => [
  for (final book in books) book.id == value.id ? value : book,
  if (books.every((book) => book.id != value.id)) value,
];
