
import { useState, useCallback, useMemo, useRef } from 'react';

interface SearchPattern {
  id: string;
  pattern: string;
  isRegex: boolean;
  isEnabled: boolean;
  color: string;
  logicalOperator?: 'AND' | 'OR';
}

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

interface StreamingSearchState {
  isSearching: boolean;
  results: SearchResult[];
  processedLines: number;
  totalLines: number;
  progress: number;
}

export function useStreamingSearch() {
  const [state, setState] = useState<StreamingSearchState>({
    isSearching: false,
    results: [],
    processedLines: 0,
    totalLines: 0,
    progress: 0
  });

  const searchCancelRef = useRef<AbortController | null>(null);

  const searchInChunks = useCallback(async (
    content: string,
    patterns: SearchPattern[],
    chunkSize: number = 1000
  ) => {
    // Cancel any existing search
    if (searchCancelRef.current) {
      searchCancelRef.current.abort();
    }

    const controller = new AbortController();
    searchCancelRef.current = controller;

    const lines = content.split('\n');
    const enabledPatterns = patterns.filter(p => p.isEnabled);
    
    if (enabledPatterns.length === 0) {
      setState(prev => ({ ...prev, results: [] }));
      return;
    }

    setState(prev => ({
      ...prev,
      isSearching: true,
      results: [],
      processedLines: 0,
      totalLines: lines.length,
      progress: 0
    }));

    const results: SearchResult[] = [];
    let processedLines = 0;

    try {
      for (let i = 0; i < lines.length; i += chunkSize) {
        if (controller.signal.aborted) {
          throw new Error('Search cancelled');
        }

        const chunk = lines.slice(i, Math.min(i + chunkSize, lines.length));
        
        // Process chunk
        chunk.forEach((line, chunkIndex) => {
          const lineIndex = i + chunkIndex;
          const matches: SearchResult['matches'] = [];
          const patternMatches = new Map<string, boolean>();

          // First pass: find all pattern matches
          enabledPatterns.forEach(pattern => {
            try {
              let hasMatch = false;
              if (pattern.isRegex) {
                const regex = new RegExp(pattern.pattern, 'gi');
                let match;
                while ((match = regex.exec(line)) !== null) {
                  matches.push({
                    pattern: pattern.pattern,
                    color: pattern.color,
                    start: match.index,
                    end: match.index + match[0].length
                  });
                  hasMatch = true;
                }
              } else {
                let startIndex = 0;
                while ((startIndex = line.toLowerCase().indexOf(pattern.pattern.toLowerCase(), startIndex)) !== -1) {
                  matches.push({
                    pattern: pattern.pattern,
                    color: pattern.color,
                    start: startIndex,
                    end: startIndex + pattern.pattern.length
                  });
                  startIndex += pattern.pattern.length;
                  hasMatch = true;
                }
              }
              patternMatches.set(pattern.id, hasMatch);
            } catch (error) {
              console.warn(`Invalid regex pattern: ${pattern.pattern}`);
              patternMatches.set(pattern.id, false);
            }
          });

          // Second pass: apply logical operations
          const shouldIncludeLine = applyLogicalOperations(enabledPatterns, patternMatches);

          if (shouldIncludeLine && matches.length > 0) {
            matches.sort((a, b) => a.start - b.start);
            results.push({
              lineNumber: lineIndex + 1,
              content: line,
              matches
            });
          }
        });

        processedLines += chunk.length;
        const progress = (processedLines / lines.length) * 100;

        setState(prev => ({
          ...prev,
          results: [...results],
          processedLines,
          progress
        }));

        // Yield control to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      setState(prev => ({
        ...prev,
        isSearching: false,
        progress: 100
      }));

    } catch (error) {
      if (error.message !== 'Search cancelled') {
        console.error('Search error:', error);
      }
      setState(prev => ({
        ...prev,
        isSearching: false
      }));
    }
  }, []);

  const applyLogicalOperations = useCallback((
    patterns: SearchPattern[],
    patternMatches: Map<string, boolean>
  ): boolean => {
    if (patterns.length === 0) return false;
    if (patterns.length === 1) return patternMatches.get(patterns[0].id) || false;

    // Simple logic: all patterns are connected in sequence
    // First pattern is always included, subsequent patterns use their operator
    let result = patternMatches.get(patterns[0].id) || false;
    
    for (let i = 1; i < patterns.length; i++) {
      const pattern = patterns[i];
      const hasMatch = patternMatches.get(pattern.id) || false;
      
      if (pattern.logicalOperator === 'OR') {
        result = result || hasMatch;
      } else {
        // Default AND
        result = result && hasMatch;
      }
    }
    
    return result;
  }, []);

  const cancelSearch = useCallback(() => {
    if (searchCancelRef.current) {
      searchCancelRef.current.abort();
      searchCancelRef.current = null;
    }
  }, []);

  const clearResults = useCallback(() => {
    cancelSearch();
    setState({
      isSearching: false,
      results: [],
      processedLines: 0,
      totalLines: 0,
      progress: 0
    });
  }, [cancelSearch]);

  return {
    ...state,
    searchInChunks,
    cancelSearch,
    clearResults
  };
}
