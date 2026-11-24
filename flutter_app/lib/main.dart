import 'dart:async';
import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart';

import 'epub_text.dart';
import 'legacy_backup.dart';
import 'legacy_txt.dart';
import 'shelf_store.dart';

void main() => runApp(const YunchuangApp());

Future<LegacyBackup?> _pickLegacyBackup() async {
  const jsonFiles = XTypeGroup(
    label: '芸窗备份',
    extensions: ['json'],
    mimeTypes: ['application/json'],
    uniformTypeIdentifiers: ['public.json'],
  );
  final file = await openFile(acceptedTypeGroups: const [jsonFiles]);
  if (file == null) return null;
  return compute(LegacyBackup.parse, await file.readAsString());
}

Future<ShelfStore> _openLocalShelf() async {
  final app = await getApplicationSupportDirectory();
  return ShelfStore.open(Directory('${app.path}/library'));
}

// A file host may report an EPUB as application/octet-stream. Check the
// extension and contents after selection instead of hiding it in the picker.
Future<XFile?> _pickAnyBook() => openFile();

class YunchuangApp extends StatelessWidget {
  const YunchuangApp({
    super.key,
    this.pickBackup = _pickLegacyBackup,
    this.pickBook = _pickAnyBook,
    this.openShelf = _openLocalShelf,
  });

  final Future<LegacyBackup?> Function() pickBackup;
  final Future<XFile?> Function() pickBook;
  final Future<ShelfStore> Function() openShelf;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '芸窗',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff943d32),
          surface: const Color(0xfffaf6ed),
        ),
      ),
      home: _Shelf(
        pickBackup: pickBackup,
        pickBook: pickBook,
        openShelf: openShelf,
      ),
    );
  }
}

class _Shelf extends StatefulWidget {
  const _Shelf({
    required this.pickBackup,
    required this.pickBook,
    required this.openShelf,
  });

  final Future<LegacyBackup?> Function() pickBackup;
  final Future<XFile?> Function() pickBook;
  final Future<ShelfStore> Function() openShelf;

  @override
  State<_Shelf> createState() => _ShelfState();
}

class _ShelfState extends State<_Shelf> {
  late Future<ShelfStore> _library;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _library = widget.openShelf();
  }

  Future<void> _perform(
    Future<void> Function() operation,
    String failure,
  ) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await operation();
    } on FormatException catch (error) {
      _notice(error.message);
    } on Exception {
      _notice(failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openBackup(ShelfStore shelf) => _perform(() async {
    final backup = await widget.pickBackup();
    if (backup == null) return;
    await shelf.restore(backup);
    final missing = shelf.books
        .where((book) => shelf.original(book) == null)
        .length;
    _notice(missing == 0 ? '备份已恢复。' : '备份已恢复。缺少正文的书可点「补原文件」。');
  }, '无法恢复这份备份。请确认文件完整并检查存储空间。');

  Future<void> _importBook(ShelfStore shelf, {ShelfBook? replacing}) =>
      _perform(() async {
        final input = await widget.pickBook();
        if (input == null) return;
        final book = await shelf.importFile(input, replacing: replacing);
        _notice(
          replacing == null ? '《${book.title}》已在书架。' : '《${book.title}》原文件已补回。',
        );
      }, '无法保存这本书。请确认文件可读取并检查存储空间。');

  Future<void> _openBook(
    ShelfStore shelf,
    ShelfBook book,
  ) => _perform(() async {
    final file = shelf.original(book);
    if (file == null) throw const FormatException('这本书缺少正文，请先补原文件。');
    final Widget reader;
    if (book.format == BookFormat.pdf) {
      final document = await PdfDocument.openFile(file.path);
      if (document.pagesCount < 1) {
        await document.close();
        throw const FormatException('这个 PDF 没有可阅读的页面。');
      }
      if (!mounted) {
        await document.close();
        return;
      }
      reader = _PdfReader(book: book, document: document);
    } else {
      final bytes = await file.readAsBytes();
      final document = await compute(
        book.format == BookFormat.txt ? TextDocument.fromBytes : readEpubText,
        bytes,
      );
      reader = _Reader(book: book, document: document);
    }
    if (!mounted) return;
    final position = await Navigator.of(context)
        .push<ReadingPosition>(MaterialPageRoute(builder: (context) => reader));
    if (position != null) await shelf.savePosition(book, position);
  }, '暂时无法打开这本书，请确认文件完整。');

  void _notice(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<ShelfStore>(
    future: _library,
    builder: (context, snapshot) {
      final shelf = snapshot.data;
      if (shelf != null) return _bookshelf(context, shelf);
      return Scaffold(
        appBar: AppBar(title: const Text('芸窗')),
        body: Center(
          child: snapshot.hasError
              ? TextButton(
                  onPressed: () =>
                      setState(() => _library = widget.openShelf()),
                  child: const Text('书架暂时无法读取，点击重试'),
                )
              : const CircularProgressIndicator(),
        ),
      );
    },
  );

  Widget _bookshelf(BuildContext context, ShelfStore shelf) {
    final books = shelf.books;
    final available = {
      for (final book in books) book.id: shelf.original(book) != null,
    };
    ShelfBook? recent;
    for (final book in books) {
      if (available[book.id] != true || book.lastReadAt <= 0) continue;
      if (recent == null || book.lastReadAt > recent.lastReadAt) recent = book;
    }
    final resume = recent;
    final typography = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('芸窗'),
        actions: [
          PopupMenuButton<String>(
            tooltip: '书架菜单',
            enabled: !_busy,
            onSelected: (_) => _openBackup(shelf),
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'restore', child: Text('恢复旧版备份')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          itemCount: books.length + 1,
          itemBuilder: (context, index) {
            if (index == 0) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_busy) const LinearProgressIndicator(),
                  Text('书架', style: typography.headlineMedium),
                  const SizedBox(height: 12),
                  if (resume != null) ...[
                    FilledButton.icon(
                      onPressed: _busy ? null : () => _openBook(shelf, resume),
                      icon: const Icon(Icons.menu_book_outlined),
                      label: Text('继续阅读《${resume.title}》'),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (books.isEmpty) const Text('书架还没有图书。支持 TXT、EPUB 和 PDF。'),
                  if (books.isEmpty) const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _importBook(shelf),
                    icon: const Icon(Icons.add),
                    label: const Text('导入图书'),
                  ),
                  const SizedBox(height: 16),
                ],
              );
            }
            final book = books[index - 1];
            final hasOriginal = available[book.id] == true;
            return ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.book_outlined),
              title: Text(book.title),
              subtitle: Text(
                [
                  if (book.author.isNotEmpty) book.author,
                  book.format.name.toUpperCase(),
                  if (!hasOriginal) '缺少原文件',
                ].join(' · '),
              ),
              trailing: hasOriginal
                  ? const Icon(Icons.chevron_right)
                  : TextButton(
                      onPressed: _busy
                          ? null
                          : () => _importBook(shelf, replacing: book),
                      child: const Text('补原文件'),
                    ),
              onTap: _busy
                  ? null
                  : hasOriginal
                  ? () => _openBook(shelf, book)
                  : () => _importBook(shelf, replacing: book),
            );
          },
        ),
      ),
    );
  }
}

class _Reader extends StatefulWidget {
  const _Reader({required this.book, required this.document});

  final ShelfBook book;
  final TextDocument document;

  @override
  State<_Reader> createState() => _ReaderState();
}

class _ReaderState extends State<_Reader> {
  final _scroll = ScrollController(keepScrollOffset: false);
  late int _chapterIndex;
  int? _pendingOffset;
  double _width = 0;
  double _landingY = 0;
  int _landingOffset = 0;

  String get _text {
    final chapter = widget.document.chapters[_chapterIndex];
    return widget.document.text.substring(chapter.start, chapter.end);
  }

  TextStyle get _style =>
      Theme.of(context).textTheme.bodyLarge!
          .copyWith(fontSize: 19, height: 1.85);

  @override
  void initState() {
    super.initState();
    _chapterIndex = widget.book.chapterIndex
        .clamp(0, widget.document.chapters.length - 1)
        .toInt();
    _pendingOffset = widget.book.charOffset;
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _goToChapter(int index) {
    setState(() {
      _chapterIndex = index;
      _pendingOffset = 0;
    });
  }

  void _restoreOffset(String text, TextStyle style, double width) {
    _width = width;
    final offset = _pendingOffset;
    if (offset == null) return;
    _pendingOffset = null;

    final painter = _layoutText(text, style, width);
    _landingOffset = offset.clamp(0, text.length);
    final top = painter
        .getOffsetForCaret(TextPosition(offset: _landingOffset), Rect.zero)
        .dy;
    painter.dispose();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _landingY = top.clamp(0, _scroll.position.maxScrollExtent).toDouble();
      _scroll.jumpTo(_landingY);
    });
  }

  TextPainter _layoutText(String text, TextStyle style, double width) =>
      TextPainter(
        text: TextSpan(text: text, style: style),
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
        locale: Localizations.localeOf(context),
      )..layout(minWidth: width, maxWidth: width);

  void _close() {
    var offset = _pendingOffset ?? _landingOffset;
    if (_pendingOffset == null &&
        _width > 0 &&
        _scroll.hasClients &&
        (_scroll.offset - _landingY).abs() > 1) {
      final painter = _layoutText(_text, _style, _width);
      offset = painter
          .getPositionForOffset(Offset(0, _scroll.offset + 1))
          .offset;
      painter.dispose();
    }
    Navigator.of(context).pop<ReadingPosition>((
      chapterIndex: _chapterIndex,
      charOffset: offset,
      pdfPage: 1,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final document = widget.document;
    final chapter = document.chapters[_chapterIndex];
    final text = _text;
    final style = _style;

    return PopScope<ReadingPosition>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: BackButton(onPressed: _close),
          title: Text(widget.book.title),
          actions: [
            PopupMenuButton<int>(
              tooltip: '目录',
              icon: const Icon(Icons.toc),
              onSelected: _goToChapter,
              itemBuilder: (context) => [
                for (var i = 0; i < document.chapters.length; i++)
                  PopupMenuItem(
                    value: i,
                    child: Text(document.chapters[i].title),
                  ),
              ],
            ),
          ],
        ),
        body: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: LayoutBuilder(
              builder: (context, constraints) {
                _restoreOffset(text, style, constraints.maxWidth);
                return SingleChildScrollView(
                  controller: _scroll,
                  child: SelectionArea(
                    child: SizedBox(
                      width: constraints.maxWidth,
                      child: Text(text, style: style),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                TextButton(
                  onPressed: _chapterIndex == 0
                      ? null
                      : () => _goToChapter(_chapterIndex - 1),
                  child: const Text('上一章'),
                ),
                Expanded(
                  child: Text(
                    chapter.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                ),
                TextButton(
                  onPressed: _chapterIndex == document.chapters.length - 1
                      ? null
                      : () => _goToChapter(_chapterIndex + 1),
                  child: const Text('下一章'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PdfReader extends StatefulWidget {
  const _PdfReader({required this.book, required this.document});

  final ShelfBook book;
  final PdfDocument document;

  @override
  State<_PdfReader> createState() => _PdfReaderState();
}

class _PdfReaderState extends State<_PdfReader> {
  late final PdfControllerPinch _controller;
  late int _page;

  @override
  void initState() {
    super.initState();
    _page = widget.book.pdfPage.clamp(1, widget.document.pagesCount);
    _controller = PdfControllerPinch(
      document: Future.value(widget.document),
      initialPage: _page,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    unawaited(widget.document.close());
    super.dispose();
  }

  void _close() {
    Navigator.of(context)
        .pop<ReadingPosition>((chapterIndex: 0, charOffset: 0, pdfPage: _page));
  }

  @override
  Widget build(BuildContext context) => PopScope<ReadingPosition>(
    canPop: false,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) _close();
    },
    child: Scaffold(
      appBar: AppBar(
        leading: BackButton(onPressed: _close),
        title: Text(widget.book.title),
      ),
      body: PdfViewPinch(
        controller: _controller,
        onPageChanged: (page) => _page = page,
      ),
    ),
  );
}
