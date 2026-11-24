import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'legacy_backup.dart';

class TextChapter {
  const TextChapter(this.title, this.start, this.end);

  final String title;
  final int start;
  final int end;
}

class TextDocument {
  TextDocument._(this.text, List<TextChapter> chapters)
    : chapters = List.unmodifiable(chapters);

  final String text;
  final List<TextChapter> chapters;

  static TextDocument fromBook(LegacyBook book) =>
      fromBytes(book.readOriginal());

  static TextDocument fromBytes(Uint8List input) {
    final text = _decodeText(input).replaceAll(RegExp(r'\r\n?'), '\n');
    if (text.trim().isEmpty) throw const FormatException('这本书没有可以显示的正文。');
    return TextDocument._(text, _splitChapters(text));
  }

  factory TextDocument.fromChapters(
    Iterable<({String title, String text})> source,
  ) {
    final text = StringBuffer();
    final chapters = <TextChapter>[];
    for (final chapter in source) {
      final start = text.length;
      text.write(chapter.text);
      chapters.add(TextChapter(chapter.title, start, text.length));
    }
    final result = text.toString();
    if (chapters.isEmpty || result.trim().isEmpty) {
      throw const FormatException('这个 EPUB 里找不到可显示的正文。');
    }
    return TextDocument._(result, chapters);
  }
}

String _decodeText(Uint8List input) {
  if (input.length >= 2) {
    if (input[0] == 0xff && input[1] == 0xfe) {
      return _decodeUtf16(input, offset: 2, endian: Endian.little);
    }
    if (input[0] == 0xfe && input[1] == 0xff) {
      return _decodeUtf16(input, offset: 2, endian: Endian.big);
    }
  }
  final probe = math.min(input.length, 4096);
  if (probe > 16) {
    var evenNul = 0;
    var oddNul = 0;
    for (var i = 0; i < probe; i++) {
      if (input[i] != 0) continue;
      if (i.isEven) {
        evenNul++;
      } else {
        oddNul++;
      }
    }
    if (oddNul / probe > 0.3) {
      return _decodeUtf16(input, offset: 0, endian: Endian.little);
    }
    if (evenNul / probe > 0.3) {
      return _decodeUtf16(input, offset: 0, endian: Endian.big);
    }
  }
  try {
    return utf8.decode(input);
  } on FormatException {
    throw const FormatException('此原型可读取 UTF-8 和 UTF-16 的 TXT。');
  }
}

String _decodeUtf16(
  Uint8List input, {
  required int offset,
  required Endian endian,
}) {
  final bytes = ByteData.sublistView(input);
  final units = <int>[];
  var i = offset;
  while (i + 1 < bytes.lengthInBytes) {
    final unit = bytes.getUint16(i, endian);
    i += 2;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (i + 1 < bytes.lengthInBytes) {
        final trail = bytes.getUint16(i, endian);
        if (trail >= 0xdc00 && trail <= 0xdfff) {
          units.add(unit);
          units.add(trail);
          i += 2;
          continue;
        }
      }
      units.add(0xfffd);
    } else {
      units.add(unit >= 0xdc00 && unit <= 0xdfff ? 0xfffd : unit);
    }
  }
  if (i < bytes.lengthInBytes) units.add(0xfffd);
  return String.fromCharCodes(units);
}

final _chapterTitle = RegExp(
  r'^(?:第\s*[0-9０-９〇零一二三四五六七八九十百千两]{1,8}\s*[章节節回卷篇部集]'
  r'|(?:Chapter|CHAPTER|Part|PART|Section|SECTION)\s+[0-9IVXLCivxlc]{1,6}'
  r'|卷\s*[0-9一二三四五六七八九十百]{1,4}|[0-9]{1,4}\s*[.、·]\s*\S)',
);
final _sentenceEnd = RegExp(r'[。！？!?…；;]$');
final _internalPunctuation = RegExp(r'[，,：:]');

bool _isTitle(String line) =>
    line.isNotEmpty &&
    line.length <= 30 &&
    !_sentenceEnd.hasMatch(line) &&
    _chapterTitle.hasMatch(line) &&
    _internalPunctuation.allMatches(line).length <= 3;

List<TextChapter> _splitChapters(String text) {
  // Keep UTF-16 offsets and chapter boundaries aligned with src/lib/txtText.js.
  final headings = <({String title, int start})>[];
  var offset = 0;
  for (final line in text.split('\n')) {
    final title = line.trim();
    if (_isTitle(title)) headings.add((title: title, start: offset));
    offset += line.length + 1;
  }
  if (headings.length < 2) return _splitByLength(text);
  return [
    if (headings.first.start > 0) TextChapter('开始', 0, headings.first.start),
    for (var i = 0; i < headings.length; i++)
      TextChapter(
        headings[i].title,
        headings[i].start,
        i + 1 < headings.length ? headings[i + 1].start : text.length,
      ),
  ];
}

List<TextChapter> _splitByLength(String text) {
  const size = 3000;
  final chapters = <TextChapter>[];
  var start = 0;
  while (start < text.length) {
    var end = math.min(text.length, start + size);
    if (end < text.length) {
      final lineBreak = text.lastIndexOf('\n\n', end);
      if (lineBreak > start + size / 2) end = lineBreak + 1;
    }
    chapters.add(TextChapter('第 ${chapters.length + 1} 节', start, end));
    start = end;
  }
  return chapters;
}
