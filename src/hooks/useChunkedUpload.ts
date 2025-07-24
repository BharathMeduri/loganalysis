import { useState, useCallback, useRef } from 'react';

interface ChunkUploadProgress {
  totalChunks: number;
  processedChunks: number;
  currentChunk: number;
  progress: number;
  stage: 'chunking' | 'processing' | 'complete';
}

interface ChunkedUploadState {
  isUploading: boolean;
  progress: ChunkUploadProgress | null;
  error: string | null;
}

export function useChunkedUpload() {
  const [state, setState] = useState<ChunkedUploadState>({
    isUploading: false,
    progress: null,
    error: null
  });

  const abortController = useRef<AbortController | null>(null);

  const uploadLargeFile = useCallback(async (
    file: File,
    chunkSize: number = 10 * 1024 * 1024, // 10MB chunks
    onChunkProcessed?: (chunk: string, chunkIndex: number) => void
  ): Promise<string> => {
    const totalChunks = Math.ceil(file.size / chunkSize);
    let processedContent = '';
    
    abortController.current = new AbortController();
    
    setState({
      isUploading: true,
      progress: {
        totalChunks,
        processedChunks: 0,
        currentChunk: 0,
        progress: 0,
        stage: 'chunking'
      },
      error: null
    });

    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (abortController.current.signal.aborted) {
          throw new Error('Upload cancelled');
        }

        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        setState(prev => ({
          ...prev,
          progress: prev.progress ? {
            ...prev.progress,
            currentChunk: chunkIndex + 1,
            progress: Math.round(((chunkIndex + 1) / totalChunks) * 100),
            stage: 'processing'
          } : null
        }));

        // Read chunk as text
        const chunkText = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('Failed to read chunk'));
          reader.readAsText(chunk);
        });

        processedContent += chunkText;
        
        if (onChunkProcessed) {
          onChunkProcessed(chunkText, chunkIndex);
        }

        setState(prev => ({
          ...prev,
          progress: prev.progress ? {
            ...prev.progress,
            processedChunks: chunkIndex + 1
          } : null
        }));

        // Yield control to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      setState(prev => ({
        ...prev,
        progress: prev.progress ? {
          ...prev.progress,
          stage: 'complete'
        } : null,
        isUploading: false
      }));

      return processedContent;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isUploading: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      }));
      throw error;
    }
  }, []);

  const cancelUpload = useCallback(() => {
    abortController.current?.abort();
    setState(prev => ({
      ...prev,
      isUploading: false,
      progress: null
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isUploading: false,
      progress: null,
      error: null
    });
  }, []);

  return {
    ...state,
    uploadLargeFile,
    cancelUpload,
    reset
  };
}