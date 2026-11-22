import 'dart:convert';
import 'dart:typed_data';

enum BookFormat { pdf, txt, epub }

class LegacyBook {
  const LegacyBook._({
    required this.id,
    required this.title,
    required this.author,
    required this.format,
    required this.chapterIndex,
    required this.charOffset,
    required this.lastReadAt,
    required this._fileData,
  });

  final int id;
  final String title;
  final String author;
  final BookFormat format;
  final int chapterIndex;
  final int charOffset;
  final int lastReadAt;
  final String? _fileData;

  bool get hasOriginal => _fileData != null;

  Uint8List readOriginal() {
    final fileData = _fileData;
    if (fileData == null) {
      throw const FormatException('备份缺少这本书的原文件。');
    }
    try {
      return base64Decode(fileData);
    } on FormatException {
      throw const FormatException('备份中的原文件已损坏。');
    }
  }
}

class LegacyBackup {
  LegacyBackup._(List<LegacyBook> books) : books = List.unmodifiable(books);

  final List<LegacyBook> books;

  LegacyBook? get recentReadableBook {
    LegacyBook? recent;
    for (final book in books) {
      if (book.format != BookFormat.txt || !book.hasOriginal) continue;
      if (book.lastReadAt == 0 &&
          book.chapterIndex == 0 &&
          book.charOffset == 0) {
        continue;
      }
      if (recent == null || book.lastReadAt > recent.lastReadAt) recent = book;
    }
    return recent;
  }

  static LegacyBackup parse(String source) {
    final Object? decoded;
    try {
      decoded = jsonDecode(source);
    } on FormatException {
      throw const FormatException('无法读取备份 JSON。');
    }
    if (decoded is! Map<String, dynamic> || decoded['app'] != 'book-reader') {
      throw const FormatException('请选择芸窗或旧版阅读器导出的备份。');
    }
    final schema = _integer(decoded['schemaVersion']);
    if (decoded.containsKey('schemaVersion') &&
        (schema == null || schema < 0 || schema > 1)) {
      throw const FormatException('这份备份的版本需要更新的阅读器。');
    }
    final bookRows = _indexedRows(decoded, 'books', 'id', requireField: true);
    final progressRows = _indexedRows(decoded, 'progress', 'bookId');
    final fileRows = _indexedRows(decoded, 'files', 'bookId');
    if (fileRows.keys.any((id) => !bookRows.containsKey(id))) {
      throw const FormatException('备份里有原文件找不到对应的书籍。');
    }
    return LegacyBackup._([
      for (final entry in bookRows.entries)
        _readBook(
          entry.key,
          entry.value,
          progressRows[entry.key],
          fileRows[entry.key],
        ),
    ]);
  }

  static LegacyBook _readBook(
    int id,
    Map<String, dynamic> row,
    Map<String, dynamic>? progress,
    Map<String, dynamic>? file,
  ) {
    final title = row['title'];
    if (title != null && title is! String) {
      throw const FormatException('备份里的书名格式有误。');
    }
    final format = switch (row['format']) {
      'txt' => BookFormat.txt,
      'epub' => BookFormat.epub,
      null || '' || 'pdf' => BookFormat.pdf,
      _ => throw const FormatException('备份里含有无法识别的书籍格式。'),
    };
    final fileData = file?['data'];
    if (file != null && fileData is! String) {
      throw const FormatException('备份里的原文件数据格式有误。');
    }
    return LegacyBook._(
      id: id,
      title: title is String && title.trim().isNotEmpty ? title : '未命名图书',
      author: row['author'] is String ? row['author'] as String : '',
      format: format,
      chapterIndex: _nonNegative(progress?['chapterIndex']),
      charOffset: _nonNegative(progress?['charOffset']),
      lastReadAt: _nonNegative(row['lastReadAt']),
      fileData: fileData as String?,
    );
  }
}

Map<int, Map<String, dynamic>> _indexedRows(
  Map<String, dynamic> data,
  String field,
  String key, {
  bool requireField = false,
}) {
  if (!requireField && !data.containsKey(field)) return {};
  final rows = data[field];
  if (rows is! List) throw FormatException('备份的 $field 字段格式有误。');

  final result = <int, Map<String, dynamic>>{};
  for (final row in rows) {
    if (row is! Map<String, dynamic>) {
      throw FormatException('备份的 $field 字段格式有误。');
    }
    final id = _integer(row[key]);
    if (id == null ||
        id <= 0 ||
        id > 9007199254740991 ||
        result.containsKey(id)) {
      throw FormatException('备份的 $field 书籍编号无效或重复。');
    }
    result[id] = row;
  }
  return result;
}

int? _integer(Object? value) => switch (value) {
  int number => number,
  double number when number.isFinite && number == number.truncateToDouble() =>
    number.toInt(),
  String number => int.tryParse(number.trim()),
  _ => null,
};

int _nonNegative(Object? value) {
  final number = _integer(value);
  return number != null && number >= 0 ? number : 0;
}
