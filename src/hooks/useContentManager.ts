
import { useState, useCallback, useRef } from 'react';

interface ContentState {
  content: string;
  lineCount: number;
  sizeBytes: number;
  isLarge: boolean;
  truncated: boolean;
  maxLines: number;
}

const MAX_LINES_DEFAULT = 100000;
const MAX_SIZE_MB = 50;

export function useContentManager(maxLines: number = MAX_LINES_DEFAULT) {
  const [state, setState] = useState<ContentState>({
    content: '',
    lineCount: 0,
    sizeBytes: 0,
    isLarge: false,
    truncated: false,
    maxLines
  });

  const fullContentRef = useRef<string>('');

  const analyzeContent = useCallback((content: string) => {
    const lines = content.split('\n');
    const sizeBytes = new Blob([content]).size;
    const sizeMB = sizeBytes / (1024 * 1024);
    
    return {
      lineCount: lines.length,
      sizeBytes,
      sizeMB,
      isLarge: lines.length > 10000 || sizeMB > 5,
      needsTruncation: lines.length > maxLines || sizeMB > MAX_SIZE_MB
    };
  }, [maxLines]);

  const setContent = useCallback((newContent: string) => {
    const analysis = analyzeContent(newContent);
    fullContentRef.current = newContent;
    
    let displayContent = newContent;
    let truncated = false;
    
    if (analysis.needsTruncation) {
      const lines = newContent.split('\n');
      displayContent = lines.slice(0, maxLines).join('\n');
      truncated = true;
    }
    
    setState({
      content: displayContent,
      lineCount: analysis.lineCount,
      sizeBytes: analysis.sizeBytes,
      isLarge: analysis.isLarge,
      truncated,
      maxLines
    });
  }, [analyzeContent, maxLines]);

  const getFullContent = useCallback(() => {
    return fullContentRef.current;
  }, []);

  const loadMore = useCallback(() => {
    if (state.truncated) {
      setContent(fullContentRef.current);
    }
  }, [state.truncated, setContent]);

  const clearContent = useCallback(() => {
    setState({
      content: '',
      lineCount: 0,
      sizeBytes: 0,
      isLarge: false,
      truncated: false,
      maxLines
    });
    fullContentRef.current = '';
  }, [maxLines]);

  const updateMaxLines = useCallback((newMaxLines: number) => {
    if (fullContentRef.current) {
      const currentContent = fullContentRef.current;
      setState(prev => ({ ...prev, maxLines: newMaxLines }));
      setContent(currentContent);
    } else {
      setState(prev => ({ ...prev, maxLines: newMaxLines }));
    }
  }, [setContent]);

  return {
    ...state,
    setContent,
    getFullContent,
    loadMore,
    clearContent,
    updateMaxLines,
    analyzeContent
  };
}
