
// Enhanced Web Worker for background file processing with multi-file support
importScripts('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');
importScripts('https://unpkg.com/js-untar@2.0.0/dist/untar.js');

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
    const { onProgress } = options;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const compressed = new Uint8Array(arrayBuffer);
      
      if (onProgress) {
        onProgress({ stage: 'decompressing', progress: 0 });
      }
      
      if (file.name.toLowerCase().endsWith('.tar.gz') || file.name.toLowerCase().endsWith('.tgz')) {
        // Handle tar.gz files with chunked decompression
        const tarData = await this.chunkedGunzip(compressed, onProgress);
        const files = await this.extractTarFiles(tarData, onProgress);
        
        // Return multi-file result for tar archives
        return {
          content: files.map(f => `\n\n=== ${f.name} ===\n${f.content}`).join(''),
          type: 'tar',
          isMultiFile: true,
          files: files
        };
      } else if (file.name.toLowerCase().endsWith('.gz')) {
        // Handle regular .gz files
        const decompressed = await this.chunkedGunzip(compressed, onProgress);
        const content = await this.streamDecode(decompressed, onProgress);
        return { content, type: 'gzip' };
      } else if (file.name.toLowerCase().endsWith('.tar')) {
        // Handle uncompressed tar files
        const files = await this.extractTarFiles(compressed, onProgress);
        return {
          content: files.map(f => `\n\n=== ${f.name} ===\n${f.content}`).join(''),
          type: 'tar',
          isMultiFile: true,
          files: files
        };
      }
      
      throw new Error('Unsupported compressed file format');
    } catch (error) {
      throw new Error(`Decompression failed: ${error.message}`);
    }
  }

  async streamDecode(data, onProgress) {
    const decoder = new TextDecoder();
    const chunkSize = 64 * 1024; // 64KB chunks
    let result = '';
    
    for (let i = 0; i < data.length; i += chunkSize) {
      if (this.shouldCancel) {
        throw new Error('Processing cancelled');
      }
      
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      result += decoder.decode(chunk, { stream: true });
      
      if (onProgress) {
        onProgress({ 
          stage: 'decompressing', 
          progress: (i / data.length) * 100 
        });
      }
      
      // Yield control to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Finalize decode
    result += decoder.decode();
    return result;
  }

  async chunkedGunzip(compressed, onProgress) {
    return new Promise((resolve, reject) => {
      try {
        const inflate = new pako.Inflate();
        const chunkSize = 64 * 1024; // 64KB chunks
        let progress = 0;
        
        const processChunk = (start) => {
          if (this.shouldCancel) {
            reject(new Error('Operation cancelled'));
            return;
          }
          
          const end = Math.min(start + chunkSize, compressed.length);
          const chunk = compressed.slice(start, end);
          
          inflate.push(chunk, end === compressed.length);
          
          progress = (end / compressed.length) * 50;
          if (onProgress) {
            onProgress({
              stage: 'decompressing',
              progress: Math.round(progress)
            });
          }
          
          if (end < compressed.length) {
            setTimeout(() => processChunk(end), 10);
          } else {
            if (inflate.err) {
              reject(new Error(inflate.msg));
            } else {
              resolve(inflate.result);
            }
          }
        };
        
        processChunk(0);
      } catch (error) {
        reject(error);
      }
    });
  }

  async extractTarFiles(tarData, onProgress) {
    try {
      if (onProgress) {
        onProgress({ stage: 'extracting', progress: 0 });
      }
      
      const files = await untar(tarData.buffer);
      const extractedFiles = [];
      
      for (let i = 0; i < files.length; i++) {
        if (this.shouldCancel) {
          throw new Error('Operation cancelled');
        }
        
        const file = files[i];
        
        // Skip directories
        if (file.type !== '0' && file.type !== '') {
          continue;
        }
        
        // Convert file content to text
        const content = new TextDecoder().decode(file.buffer);
        extractedFiles.push({
          name: file.name,
          content: content,
          size: file.size
        });
        
        if (onProgress) {
          onProgress({
            stage: 'extracting',
            progress: Math.round(((i + 1) / files.length) * 100)
          });
        }
        
        // Yield control to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      return extractedFiles;
    } catch (error) {
      throw new Error(`Tar extraction failed: ${error.message}`);
    }
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
