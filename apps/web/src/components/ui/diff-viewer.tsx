'use client';

import * as React from 'react';
import { Copy, Check, ChevronDown, ChevronRight, FileCode, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffFile {
  filename: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
  language?: string;
}

interface DiffViewerProps {
  files: DiffFile[];
  className?: string;
  viewMode?: 'unified' | 'split';
  showLineNumbers?: boolean;
  expandAll?: boolean;
}

function parseDiffContent(content: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLineNum = 0;
  let newLineNum = 0;

  content.split('\n').forEach((line) => {
    if (line.startsWith('@@')) {
      // Parse hunk header
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      lines.push({ type: 'header', content: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLineNum++,
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
      });
    } else if (line.startsWith(' ')) {
      lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
    }
  });

  return lines;
}

function DiffFileHeader({
  file,
  expanded,
  onToggle,
}: {
  file: DiffFile;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const copyFilename = () => {
    navigator.clipboard.writeText(file.filename);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b cursor-pointer hover:bg-muted/80 transition-colors"
      onClick={onToggle}
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
      <FileCode className="h-4 w-4 text-muted-foreground" />
      <span className="font-mono text-sm flex-1 truncate">{file.filename}</span>
      <div className="flex items-center gap-2 text-xs">
        {file.additions > 0 && (
          <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
            <Plus className="h-3 w-3" />
            {file.additions}
          </span>
        )}
        {file.deletions > 0 && (
          <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
            <Minus className="h-3 w-3" />
            {file.deletions}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={(e) => {
          e.stopPropagation();
          copyFilename();
        }}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function DiffLineComponent({
  line,
  showLineNumbers,
}: {
  line: DiffLine;
  showLineNumbers: boolean;
}) {
  const bgClass = {
    add: 'bg-green-500/10 dark:bg-green-500/20',
    remove: 'bg-red-500/10 dark:bg-red-500/20',
    context: '',
    header: 'bg-blue-500/10 dark:bg-blue-500/20',
  }[line.type];

  const textClass = {
    add: 'text-green-700 dark:text-green-300',
    remove: 'text-red-700 dark:text-red-300',
    context: '',
    header: 'text-blue-700 dark:text-blue-300 font-medium',
  }[line.type];

  const prefix = {
    add: '+',
    remove: '-',
    context: ' ',
    header: '',
  }[line.type];

  return (
    <div className={cn('flex font-mono text-xs hover:bg-muted/50', bgClass)}>
      {showLineNumbers && line.type !== 'header' && (
        <>
          <span className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r">
            {line.oldLineNumber || ''}
          </span>
          <span className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r">
            {line.newLineNumber || ''}
          </span>
        </>
      )}
      {line.type === 'header' && showLineNumbers && (
        <span className="w-24 border-r" />
      )}
      <span className={cn('px-2 py-0.5 whitespace-pre', textClass)}>
        {prefix}
        {line.content}
      </span>
    </div>
  );
}

function DiffFileContent({
  file,
  showLineNumbers,
}: {
  file: DiffFile;
  showLineNumbers: boolean;
}) {
  return (
    <div className="border-b last:border-b-0">
      {file.lines.map((line, index) => (
        <DiffLineComponent
          key={index}
          line={line}
          showLineNumbers={showLineNumbers}
        />
      ))}
    </div>
  );
}

export function DiffViewer({
  files,
  className,
  viewMode: _viewMode = 'unified',
  showLineNumbers = true,
  expandAll = true,
}: DiffViewerProps) {
  const [expandedFiles, setExpandedFiles] = React.useState<Set<string>>(
    expandAll ? new Set(files.map((f) => f.filename)) : new Set()
  );

  const toggleFile = (filename: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const expandAllFiles = () => {
    setExpandedFiles(new Set(files.map((f) => f.filename)));
  };

  const collapseAllFiles = () => {
    setExpandedFiles(new Set());
  };

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      {/* Summary Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted border-b">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium">{files.length} files changed</span>
          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <Plus className="h-3 w-3" />
            {totalAdditions} additions
          </span>
          <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
            <Minus className="h-3 w-3" />
            {totalDeletions} deletions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAllFiles}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAllFiles}>
            Collapse all
          </Button>
        </div>
      </div>

      {/* Files */}
      <ScrollArea className="max-h-[600px]">
        {files.map((file) => (
          <div key={file.filename}>
            <DiffFileHeader
              file={file}
              expanded={expandedFiles.has(file.filename)}
              onToggle={() => toggleFile(file.filename)}
            />
            {expandedFiles.has(file.filename) && (
              <DiffFileContent file={file} showLineNumbers={showLineNumbers} />
            )}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

// Helper to parse raw diff string into DiffFile[]
export function parseDiff(diffString: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileChunks = diffString.split(/^diff --git/m).filter(Boolean);

  fileChunks.forEach((chunk) => {
    const lines = chunk.split('\n');
    const filenameMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    if (!filenameMatch) return;

    const filename = filenameMatch[2];
    const diffContent = lines.slice(1).join('\n');
    const parsedLines = parseDiffContent(diffContent);

    const additions = parsedLines.filter((l) => l.type === 'add').length;
    const deletions = parsedLines.filter((l) => l.type === 'remove').length;

    // Detect language from extension
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      css: 'css',
      scss: 'scss',
      html: 'html',
      json: 'json',
      md: 'markdown',
      yml: 'yaml',
      yaml: 'yaml',
    };

    files.push({
      filename,
      additions,
      deletions,
      lines: parsedLines,
      language: ext ? languageMap[ext] : undefined,
    });
  });

  return files;
}
