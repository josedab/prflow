'use client';

import * as React from 'react';
import AnsiToHtml from 'ansi-to-html';
import {
  Terminal,
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface LogLine {
  id: string;
  timestamp?: Date;
  level?: 'info' | 'warn' | 'error' | 'debug';
  content: string;
}

interface LogViewerProps {
  logs: LogLine[] | string;
  title?: string;
  className?: string;
  showTimestamps?: boolean;
  showSearch?: boolean;
  showLineNumbers?: boolean;
  maxHeight?: string;
  autoScroll?: boolean;
  onClear?: () => void;
}

const ansiConverter = new AnsiToHtml({
  fg: '#d4d4d4',
  bg: 'transparent',
  newline: false,
  escapeXML: true,
  stream: false,
  colors: {
    0: '#1e1e1e',
    1: '#f44747',
    2: '#6a9955',
    3: '#d7ba7d',
    4: '#569cd6',
    5: '#c586c0',
    6: '#4ec9b0',
    7: '#d4d4d4',
    8: '#808080',
    9: '#f44747',
    10: '#6a9955',
    11: '#d7ba7d',
    12: '#569cd6',
    13: '#c586c0',
    14: '#4ec9b0',
    15: '#ffffff',
  },
});

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function parseLogString(content: string): LogLine[] {
  return content.split('\n').map((line, index) => ({
    id: `line-${index}`,
    content: line,
  }));
}

function LogLineComponent({
  line,
  showTimestamp,
  showLineNumber,
  lineNumber,
  searchTerm,
  isHighlighted,
}: {
  line: LogLine;
  showTimestamp: boolean;
  showLineNumber: boolean;
  lineNumber: number;
  searchTerm: string;
  isHighlighted: boolean;
}) {
  const levelColors = {
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    debug: 'text-gray-400',
  };

  // Convert ANSI codes to HTML
  const htmlContent = React.useMemo(() => {
    let content = ansiConverter.toHtml(line.content);
    
    // Highlight search term
    if (searchTerm) {
      const regex = new RegExp(`(${searchTerm})`, 'gi');
      content = content.replace(
        regex,
        '<mark class="bg-yellow-500/50 text-yellow-100 rounded px-0.5">$1</mark>'
      );
    }
    
    return content;
  }, [line.content, searchTerm]);

  return (
    <div
      className={cn(
        'flex font-mono text-xs hover:bg-muted/30 group',
        isHighlighted && 'bg-yellow-500/20'
      )}
    >
      {showLineNumber && (
        <span className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none shrink-0 border-r border-border/50">
          {lineNumber}
        </span>
      )}
      {showTimestamp && line.timestamp && (
        <span className="w-24 px-2 py-0.5 text-muted-foreground select-none shrink-0">
          {formatTimestamp(line.timestamp)}
        </span>
      )}
      {line.level && (
        <span
          className={cn(
            'w-14 px-2 py-0.5 uppercase text-[10px] font-bold shrink-0',
            levelColors[line.level]
          )}
        >
          {line.level}
        </span>
      )}
      <span
        className="px-2 py-0.5 whitespace-pre-wrap break-all flex-1"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
}

export function LogViewer({
  logs,
  title = 'Logs',
  className,
  showTimestamps = false,
  showSearch = true,
  showLineNumbers = true,
  maxHeight = '400px',
  autoScroll = true,
  onClear,
}: LogViewerProps) {
  const [search, setSearch] = React.useState('');
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [currentMatch, setCurrentMatch] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Normalize logs to LogLine[]
  const logLines = React.useMemo(() => {
    if (typeof logs === 'string') {
      return parseLogString(logs);
    }
    return logs;
  }, [logs]);

  // Filter logs based on search
  const filteredLogs = React.useMemo(() => {
    if (!search) return logLines;
    return logLines.filter((line) =>
      line.content.toLowerCase().includes(search.toLowerCase())
    );
  }, [logLines, search]);

  // Find all matches for search navigation
  const matchIndices = React.useMemo(() => {
    if (!search) return [];
    return logLines
      .map((line, index) =>
        line.content.toLowerCase().includes(search.toLowerCase()) ? index : -1
      )
      .filter((index) => index !== -1);
  }, [logLines, search]);

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (autoScroll && !isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logLines, autoScroll, isPaused]);

  const copyLogs = () => {
    const content = logLines.map((l) => l.content).join('\n');
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadLogs = () => {
    const content = logLines.map((l) => l.content).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const nextMatch = () => {
    if (matchIndices.length === 0) return;
    setCurrentMatch((prev) => (prev + 1) % matchIndices.length);
  };

  const prevMatch = () => {
    if (matchIndices.length === 0) return;
    setCurrentMatch((prev) =>
      prev === 0 ? matchIndices.length - 1 : prev - 1
    );
  };

  const toggleFullscreen = () => {
    if (!isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'border rounded-lg overflow-hidden bg-[#1e1e1e] text-[#d4d4d4]',
        isFullscreen && 'fixed inset-0 z-50 rounded-none',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">
            ({logLines.length} lines)
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Search */}
          {showSearch && (
            <div className="flex items-center gap-1 mr-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentMatch(0);
                  }}
                  placeholder="Search..."
                  className="h-7 w-40 pl-7 text-xs bg-[#3c3c3c] border-[#3c3c3c]"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              {search && matchIndices.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {currentMatch + 1}/{matchIndices.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={prevMatch}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={nextMatch}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Controls */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
          >
            {isPaused ? (
              <Play className="h-3 w-3" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={copyLogs}
            title="Copy logs"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={downloadLogs}
            title="Download logs"
          >
            <Download className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </Button>
          {onClear && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClear}
              title="Clear logs"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Log Content */}
      <ScrollArea
        ref={scrollRef}
        className="overflow-auto"
        style={{ maxHeight: isFullscreen ? 'calc(100vh - 48px)' : maxHeight }}
      >
        <div className="min-w-max">
          {(search ? filteredLogs : logLines).map((line, index) => (
            <LogLineComponent
              key={line.id}
              line={line}
              showTimestamp={showTimestamps}
              showLineNumber={showLineNumbers}
              lineNumber={index + 1}
              searchTerm={search}
              isHighlighted={
                search !== '' && matchIndices[currentMatch] === index
              }
            />
          ))}
          {logLines.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Terminal className="h-8 w-8 mr-2 opacity-50" />
              <span>No logs yet</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
