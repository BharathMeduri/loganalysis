
import { useState, useCallback, useRef } from 'react';

export interface ProcessingProgress {
  stage: 'reading' | 'decompressing' | 'extracting' | 'complete';
  progress: number;
}

export interface ProcessingResult {
  content: string;
  type: 'text' | 'gzip' | 'tar';
}

export interface ProcessingState {
  isProcessing: boolean;
  progress: ProcessingProgress | null;
  error: string | null;
  result: ProcessingResult | null;
}

export function useFileProcessor() {
  const [state, setState] = useState<ProcessingState>({
    isProcessing: false,
    progress: null,
    error: null,
    result: null
  });

  const workerRef = useRef<Worker | null>(null);
  const currentJobId = useRef<string | null>(null);

  const initWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker('/fileProcessor.worker.js');
      
      workerRef.current.onmessage = (e) => {
        const { type, id, data } = e.data;
        
        // Only handle messages for current job
        if (id !== currentJobId.current) return;
        
        switch (type) {
          case 'PROGRESS':
            setState(prev => ({ ...prev, progress: data }));
            break;
            
          case 'SUCCESS':
            setState(prev => ({
              ...prev,
              isProcessing: false,
              result: data,
              progress: { stage: 'complete', progress: 100 }
            }));
            currentJobId.current = null;
            break;
            
          case 'ERROR':
            setState(prev => ({
              ...prev,
              isProcessing: false,
              error: data.message,
              progress: null
            }));
            currentJobId.current = null;
            break;
            
          case 'CANCELLED':
            setState(prev => ({
              ...prev,
              isProcessing: false,
              progress: null
            }));
            currentJobId.current = null;
            break;
        }
      };
    }
  }, []);

  const processFile = useCallback(async (file: File): Promise<ProcessingResult> => {
    initWorker();
    
    return new Promise((resolve, reject) => {
      const jobId = Math.random().toString(36).substr(2, 9);
      currentJobId.current = jobId;
      
      setState({
        isProcessing: true,
        progress: { stage: 'reading', progress: 0 },
        error: null,
        result: null
      });

      const handleMessage = (e: MessageEvent) => {
        const { type, id, data } = e.data;
        
        if (id !== jobId) return;
        
        if (type === 'SUCCESS') {
          workerRef.current?.removeEventListener('message', handleMessage);
          resolve(data);
        } else if (type === 'ERROR') {
          workerRef.current?.removeEventListener('message', handleMessage);
          reject(new Error(data.message));
        }
      };

      workerRef.current?.addEventListener('message', handleMessage);
      workerRef.current?.postMessage({
        type: 'PROCESS_FILE',
        id: jobId,
        data: { file }
      });
    });
  }, [initWorker]);

  const cancelProcessing = useCallback(() => {
    if (currentJobId.current && workerRef.current) {
      workerRef.current.postMessage({
        type: 'CANCEL',
        id: currentJobId.current
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      progress: null,
      error: null,
      result: null
    });
    currentJobId.current = null;
  }, []);

  return {
    ...state,
    processFile,
    cancelProcessing,
    reset
  };
}
