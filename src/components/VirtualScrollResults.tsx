
import React, { useMemo, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface SearchResult {
  lineNumber: number;
  content: string;
  matches: Array<{
    pattern: string;
    color: string;
    start: number;
    end: number;
  }>;
}

interface VirtualScrollResultsProps {
  results: SearchResult[];
  itemHeight: number;
  containerHeight: number;
  onHighlightText: (content: string, matches: SearchResult['matches']) => string;
}

export function VirtualScrollResults({
  results,
  itemHeight = 80,
  containerHeight = 400,
  onHighlightText
}: VirtualScrollResultsProps) {
  const [scrollTop, setScrollTop] = React.useState(0);
  
  const visibleRange = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(
      start + Math.ceil(containerHeight / itemHeight) + 1,
      results.length
    );
    return { start, end };
  }, [scrollTop, itemHeight, containerHeight, results.length]);

  const visibleItems = useMemo(() => {
    return results.slice(visibleRange.start, visibleRange.end).map((result, index) => ({
      ...result,
      virtualIndex: visibleRange.start + index
    }));
  }, [results, visibleRange]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = results.length * itemHeight;

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No matches found for the current patterns.
      </div>
    );
  }

  return (
    <div className="relative">
      <ScrollArea 
        className="h-full"
        style={{ height: containerHeight }}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            style={{
              transform: `translateY(${visibleRange.start * itemHeight}px)`,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0
            }}
          >
            {visibleItems.map((result) => (
              <div
                key={result.virtualIndex}
                className="border border-border rounded bg-secondary/30 p-3 hover:bg-secondary/50 transition-colors mb-2"
                style={{ height: itemHeight - 8 }} // Account for margin
              >
                <div className="flex items-start gap-3 h-full">
                  <Badge variant="outline" className="text-xs min-w-12 text-center flex-shrink-0">
                    {result.lineNumber}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <pre
                      className="text-sm font-mono whitespace-pre-wrap break-all overflow-hidden"
                      style={{
                        maxHeight: itemHeight - 24,
                        lineHeight: '1.4'
                      }}
                      dangerouslySetInnerHTML={{
                        __html: onHighlightText(result.content, result.matches)
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
