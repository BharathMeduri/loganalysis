
// Enhanced Web Worker for background file processing with multi-file support
// Note: Using local implementations instead of external CDN imports for reliability

class FileProcessor {
  constructor() {
    this.isProcessing = false;
    this.shouldCancel = false;
  }

  async processFiles(files, options = {}) {
    this.shouldCancel = false;
    
    if (files.length === 1) {
      return await this.processSingleFile(files[0], options);
    }
    
    return await this.processMultipleFiles(files, options);
  }

  async processMultipleFiles(files, options) {
    const { onProgress } = options;
    let combinedContent = '';
    const results = [];
    
    try {
      this.isProcessing = true;
      
      for (let i = 0; i < files.length; i++) {
        if (this.shouldCancel) {
          throw new Error('Processing cancelled');
        }
        
        const file = files[i];
        const fileProgress = (i / files.length) * 100;
        
        if (onProgress) {
          onProgress({ 
            stage: 'reading', 
            progress: fileProgress,
            currentFile: file.name,
            fileIndex: i + 1,
            totalFiles: files.length
          });
        }
        
        const result = await this.processSingleFile(file, {
          onProgress: (progress) => {
            if (onProgress) {
              onProgress({
                ...progress,
                currentFile: file.name,
                fileIndex: i + 1,
                totalFiles: files.length,
                progress: fileProgress + (progress.progress / files.length)
              });
            }
          }
        });
        
        results.push({ name: file.name, ...result });
        combinedContent += (combinedContent ? '\n' : '') + result.content;
      }
      
      return { 
        content: combinedContent, 
        type: 'multi-file',
        files: results
      };
    } catch (error) {
      throw new Error(`Multi-file processing failed: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  async processSingleFile(file, options = {}) {
    const { onProgress } = options;
    
    // Check file size and warn for large files
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 100) {
      if (onProgress) {
        onProgress({ 
          stage: 'reading', 
          progress: 0,
          warning: `Large file detected (${fileSizeMB.toFixed(1)}MB). Processing may take longer.`
        });
      }
    }
    
    try {
      this.isProcessing = true;
      
      // Handle compressed files
      if (this.isCompressedFile(file.name)) {
        return await this.decompressFile(file, options);
      }
      
      // Handle regular files with streaming
      return await this.processRegularFile(file, options);
    } catch (error) {
      throw new Error(`Processing failed: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  isCompressedFile(fileName) {
    const compressedExtensions = ['.gz', '.tar.gz', '.tar', '.tgz'];
    return compressedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  async decompressFile(file, options) {
    // For now, treat compressed files as unsupported and throw a clear error
    throw new Error(`Compressed files (${file.name}) are not supported yet. Please extract the files manually and upload the uncompressed version.`);
  }


  async processRegularFile(file, options) {
    const { onProgress } = options;
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          
          if (onProgress) {
            onProgress({ stage: 'reading', progress: 100 });
          }
          
          resolve({ content, type: 'text' });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  cancel() {
    this.shouldCancel = true;
  }
}

const processor = new FileProcessor();

// Handle messages from main thread
self.onmessage = async (e) => {
  const { type, data, id } = e.data;
  
  try {
    switch (type) {
      case 'PROCESS_FILES':
        const result = await processor.processFiles(data.files, {
          onProgress: (progress) => {
            self.postMessage({
              type: 'PROGRESS',
              id,
              data: progress
            });
          }
        });
        
        self.postMessage({
          type: 'SUCCESS',
          id,
          data: result
        });
        break;
        
      case 'CANCEL':
        processor.cancel();
        self.postMessage({
          type: 'CANCELLED',
          id
        });
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      data: { message: error.message }
    });
  }
};
