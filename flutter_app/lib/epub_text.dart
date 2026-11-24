import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:html/dom.dart' as html;
import 'package:html/parser.dart' as html_parser;
import 'package:xml/xml.dart';

import 'legacy_txt.dart';

TextDocument readEpubText(Uint8List bytes) {
  try {
    final files = {
      for (final file in ZipDecoder().decodeBytes(bytes).files)
        if (file.isFile) file.name: file,
    };

    XmlDocument readXml(String path) {
      final entry = files[path];
      if (entry == null) throw const FormatException('EPUB 缺少目录或正文文件。');
      return XmlDocument.parse(utf8.decode(entry.content));
    }

    final container = readXml('META-INF/container.xml');
    final opfPath = _elements(
      container,
      'rootfile',
    ).firstOrNull?.getAttribute('full-path');
    if (opfPath == null || opfPath.isEmpty) {
      throw const FormatException('EPUB 缺少书籍清单。');
    }
    final package = readXml(opfPath);
    final manifest = {
      for (final item in _elements(package, 'item'))
        item.getAttribute('id'): item.getAttribute('href'),
    };
    final base = Uri(path: '/$opfPath');
    final chapters = <({String title, String text})>[];
    for (final ref in _elements(package, 'itemref')) {
      final href = manifest[ref.getAttribute('idref')];
      if (href == null || href.isEmpty) continue;
      final uri = base.resolve(href);
      if (uri.hasAuthority || uri.hasScheme || uri.pathSegments.isEmpty) {
        continue;
      }
      final file = files[uri.pathSegments.join('/')];
      if (file == null) continue;
      final document = html_parser.parse(file.content);
      final title = document.querySelector('h1, h2, h3')?.text.trim();
      chapters.add((
        title: title == null || title.isEmpty
            ? '第 ${chapters.length + 1} 节'
            : title,
        text: _paragraphs(document.body),
      ));
    }
    return TextDocument.fromChapters(chapters);
  } on FormatException {
    rethrow;
  } catch (_) {
    throw const FormatException('无法打开这个 EPUB，请确认文件完整且未加密。');
  }
}

Iterable<XmlElement> _elements(XmlNode node, String name) => node.descendants
    .whereType<XmlElement>()
    .where((element) => element.name.local == name);

const _breaks = {
  'p',
  'div',
  'section',
  'article',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'tr',
  'dd',
  'dt',
  'figure',
  'figcaption',
};
const _omit = {'script', 'style', 'template', 'head', 'rt', 'rp'};

String _paragraphs(html.Element? body) {
  if (body == null) return '';
  final text = StringBuffer();
  void write(html.Node node) {
    if (node is html.Text) {
      text.write(node.data.replaceAll(RegExp(r'[\t\n\r\f ]+'), ' '));
      return;
    }
    if (node is! html.Element || _omit.contains(node.localName)) return;
    final name = node.localName;
    if (name == 'br') {
      text.writeln();
      return;
    }
    if (name == 'img') {
      text.write(node.attributes['alt'] ?? '');
      return;
    }
    final breakLine = _breaks.contains(name);
    if (breakLine) text.writeln();
    for (final child in node.nodes) {
      write(child);
    }
    if (breakLine) text.writeln();
  }

  write(body);
  return text
      .toString()
      .replaceAll(RegExp(r' *\n *'), '\n')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();
}
