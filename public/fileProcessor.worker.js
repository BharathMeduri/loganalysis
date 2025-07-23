
// Web Worker for background file processing
importScripts('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');

class FileProcessor {
  constructor() {
    this.isProcessing = false;
  }

  async processFile(file, options = {}) {
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
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async () => {
        try {
          const compressed = new Uint8Array(reader.result);
          
          if (onProgress) {
            onProgress({ stage: 'decompressing', progress: 0 });
          }
          
          // Decompress in chunks to avoid blocking
          const decompressed = await this.decompressInChunks(compressed, onProgress);
          
          if (file.name.toLowerCase().includes('.tar')) {
            // Handle tar files
            const content = await this.extractTarContents(decompressed, onProgress);
            resolve({ content, type: 'tar' });
          } else {
            // Handle gzip files
            const decoder = new TextDecoder();
            const content = decoder.decode(decompressed);
            resolve({ content, type: 'gzip' });
          }
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  async decompressInChunks(compressed, onProgress) {
    // Use pako for decompression
    try {
      const decompressed = pako.ungzip(compressed);
      if (onProgress) {
        onProgress({ stage: 'decompressing', progress: 100 });
      }
      return decompressed;
    } catch (error) {
      throw new Error(`Decompression failed: ${error.message}`);
    }
  }

  async extractTarContents(tarData, onProgress) {
    // Simple tar extraction - this is a basic implementation
    // In production, you'd use a proper tar library
    const decoder = new TextDecoder();
    let content = '';
    
    try {
      // For now, just decode the tar data as text
      // This is simplified - real tar parsing would be more complex
      content = decoder.decode(tarData);
      
      if (onProgress) {
        onProgress({ stage: 'extracting', progress: 100 });
      }
      
      return content;
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
}

const processor = new FileProcessor();

// Handle messages from main thread
self.onmessage = async (e) => {
  const { type, data, id } = e.data;
  
  try {
    switch (type) {
      case 'PROCESS_FILE':
        const result = await processor.processFile(data.file, {
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
        processor.isProcessing = false;
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
