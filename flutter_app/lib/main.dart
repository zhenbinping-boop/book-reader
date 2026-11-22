import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';

import 'legacy_backup.dart';
import 'legacy_txt.dart';

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

class YunchuangApp extends StatelessWidget {
  const YunchuangApp({super.key, this.pickBackup = _pickLegacyBackup});

  final Future<LegacyBackup?> Function() pickBackup;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '芸窗',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xff943d32),
          surface: const Color(0xfffaf6ed),
        ),
      ),
      home: _Shelf(pickBackup: pickBackup),
    );
  }
}

class _Shelf extends StatefulWidget {
  const _Shelf({required this.pickBackup});

  final Future<LegacyBackup?> Function() pickBackup;

  @override
  State<_Shelf> createState() => _ShelfState();
}

class _ShelfState extends State<_Shelf> {
  LegacyBackup? _backup;
  bool _busy = false;

  Future<void> _openBackup() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final backup = await widget.pickBackup();
      if (backup == null || !mounted) return;
      setState(() => _backup = backup);
    } on FormatException catch (error) {
      _showError(error.message);
    } on Exception {
      _showError('无法打开这份备份。请确认文件仍可读取。');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openBook(LegacyBook book) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final document = await compute(TextDocument.fromBook, book);
      if (!mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (context) => _Reader(book: book, document: document),
        ),
      );
    } on FormatException catch (error) {
      _showError(error.message);
    } on Exception {
      _showError('暂时无法打开这本书。');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final backup = _backup;
    final books = backup?.books ?? const <LegacyBook>[];
    final recent = backup?.recentReadableBook;
    final typography = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('芸窗'),
        actions: [
          if (backup != null)
            IconButton(
              onPressed: _busy ? null : _openBackup,
              icon: const Icon(Icons.folder_open_outlined),
              tooltip: '打开另一份备份',
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
                  if (backup == null) ...[
                    const Text('打开旧版完整备份，可预览书架并续读 TXT。'),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _busy ? null : _openBackup,
                      icon: const Icon(Icons.folder_open_outlined),
                      label: const Text('打开旧版备份'),
                    ),
                  ] else ...[
                    Text('备份预览 · ${books.length} 本书'),
                    if (recent != null) ...[
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _busy ? null : () => _openBook(recent),
                        icon: const Icon(Icons.menu_book_outlined),
                        label: Text('继续阅读《${recent.title}》'),
                      ),
                    ],
                  ],
                  const SizedBox(height: 16),
                ],
              );
            }
            final book = books[index - 1];
            final canRead = book.hasOriginal && book.format == BookFormat.txt;
            final status = switch ((book.hasOriginal, canRead)) {
              (false, _) => '缺少原文件',
              (true, true) => '可以阅读',
              _ => '已找到原文件，阅读暂未接入',
            };
            return ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.book_outlined),
              title: Text(book.title),
              subtitle: Text(
                [
                  if (book.author.isNotEmpty) book.author,
                  book.format.name.toUpperCase(),
                  status,
                ].join(' · '),
              ),
              trailing: canRead ? const Icon(Icons.chevron_right) : null,
              onTap: canRead && !_busy ? () => _openBook(book) : null,
            );
          },
        ),
      ),
    );
  }
}

class _Reader extends StatefulWidget {
  const _Reader({required this.book, required this.document});

  final LegacyBook book;
  final TextDocument document;

  @override
  State<_Reader> createState() => _ReaderState();
}

class _ReaderState extends State<_Reader> {
  final _scroll = ScrollController(keepScrollOffset: false);
  late int _chapterIndex;
  int? _pendingOffset;

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
    final offset = _pendingOffset;
    if (offset == null) return;
    _pendingOffset = null;

    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
      locale: Localizations.localeOf(context),
    )..layout(minWidth: width, maxWidth: width);
    final position = TextPosition(offset: offset.clamp(0, text.length).toInt());
    final top = painter.getOffsetForCaret(position, Rect.zero).dy;
    painter.dispose();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.jumpTo(top.clamp(0, _scroll.position.maxScrollExtent).toDouble());
    });
  }

  @override
  Widget build(BuildContext context) {
    final document = widget.document;
    final chapter = document.chapters[_chapterIndex];
    final text = document.text.substring(chapter.start, chapter.end);
    final style = Theme.of(context).textTheme.bodyLarge!
        .copyWith(fontSize: 19, height: 1.85);

    return Scaffold(
      appBar: AppBar(
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
    );
  }
}
