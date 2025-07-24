
import { useState, useCallback, useRef } from 'react';
import { useStreamingSearch } from './useStreamingSearch';

interface SearchPattern {
  id: string;
  pattern: string;
  isRegex: boolean;
  isEnabled: boolean;
  color: string;
  logicalOperator?: 'AND' | 'OR';
}

interface SearchControllerState {
  isSearchEnabled: boolean;
  autoSearchEnabled: boolean;
  searchRequested: boolean;
  lastSearchTime: number;
}

export function useSearchController() {
  const [state, setState] = useState<SearchControllerState>({
    isSearchEnabled: true,
    autoSearchEnabled: false,
    searchRequested: false,
    lastSearchTime: 0
  });

  const streamingSearch = useStreamingSearch();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const shouldWarnLargeContent = useCallback((content: string): boolean => {
    const lines = content.split('\n').length;
    const sizeMB = new Blob([content]).size / (1024 * 1024);
    return lines > 50000 || sizeMB > 10;
  }, []);

  const triggerSearch = useCallback((
    content: string,
    patterns: SearchPattern[],
    options: { force?: boolean; showWarning?: boolean } = {}
  ) => {
    if (!state.isSearchEnabled && !options.force) return;

    const enabledPatterns = patterns.filter(p => p.isEnabled);
    if (enabledPatterns.length === 0) {
      streamingSearch.clearResults();
      return;
    }

    if (!content.trim()) {
      streamingSearch.clearResults();
      return;
    }

    // Check for large content warning
    if (options.showWarning && shouldWarnLargeContent(content)) {
      return { requiresConfirmation: true };
    }

    // Clear existing debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce search
    debounceTimer.current = setTimeout(() => {
      streamingSearch.searchInChunks(content, enabledPatterns);
      setState(prev => ({ 
        ...prev, 
        searchRequested: true,
        lastSearchTime: Date.now()
      }));
    }, 300);

    return { requiresConfirmation: false };
  }, [state.isSearchEnabled, streamingSearch, shouldWarnLargeContent]);

  const forceSearch = useCallback((content: string, patterns: SearchPattern[]) => {
    triggerSearch(content, patterns, { force: true });
  }, [triggerSearch]);

  const enableAutoSearch = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, autoSearchEnabled: enabled }));
  }, []);

  const enableSearch = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, isSearchEnabled: enabled }));
    if (!enabled) {
      streamingSearch.cancelSearch();
    }
  }, [streamingSearch]);

  const clearSearch = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    streamingSearch.clearResults();
    setState(prev => ({ ...prev, searchRequested: false }));
  }, [streamingSearch]);

  return {
    ...state,
    ...streamingSearch,
    triggerSearch,
    forceSearch,
    enableAutoSearch,
    enableSearch,
    clearSearch,
    shouldWarnLargeContent
  };
}
