
// Enhanced Web Worker for background file processing with multi-file support
// Comprehensive decompression support for multiple archive formats

// Import required libraries
importScripts('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');
importScripts('https://cdn.jsdelivr.net/npm/js-untar@2.0.0/dist/untar.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

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
    const compressedExtensions = ['.gz', '.tar.gz', '.tar', '.tgz', '.zip', '.7z', '.rar', '.bz2'];
    return compressedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  detectCompressionFormat(fileName, arrayBuffer) {
    const name = fileName.toLowerCase();
    
    // Check by extension first
    if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) return 'tar.gz';
    if (name.endsWith('.tar')) return 'tar';
    if (name.endsWith('.gz')) return 'gzip';
    if (name.endsWith('.zip')) return 'zip';
    if (name.endsWith('.7z')) return '7z';
    if (name.endsWith('.rar')) return 'rar';
    if (name.endsWith('.bz2')) return 'bz2';
    
    // Check by file signature/magic bytes
    const bytes = new Uint8Array(arrayBuffer.slice(0, 10));
    
    // ZIP signature: PK (0x504B)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) return 'zip';
    
    // GZIP signature: 1f 8b
    if (bytes[0] === 0x1F && bytes[1] === 0x8B) return 'gzip';
    
    // TAR files often start with filename, check for TAR characteristics
    // TAR files have specific structure, but hard to detect by header alone
    
    // 7z signature: 37 7A BC AF 27 1C
    if (bytes[0] === 0x37 && bytes[1] === 0x7A && bytes[2] === 0xBC && bytes[3] === 0xAF) return '7z';
    
    // RAR signature: 52 61 72 21
    if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21) return 'rar';
    
    return 'unknown';
  }

  async decompressFile(file, options) {
    const { onProgress } = options;
    
    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const format = this.detectCompressionFormat(file.name, arrayBuffer);
      
      if (onProgress) {
        onProgress({ 
          stage: 'decompressing', 
          progress: 10,
          currentFile: file.name
        });
      }
      
      switch (format) {
        case 'zip':
          return await this.decompressZip(arrayBuffer, file.name, onProgress);
        case 'gzip':
          return await this.decompressGzip(arrayBuffer, file.name, onProgress);
        case 'tar':
          return await this.decompressTar(arrayBuffer, file.name, onProgress);
        case 'tar.gz':
          return await this.decompressTarGz(arrayBuffer, file.name, onProgress);
        case '7z':
        case 'rar':
        case 'bz2':
          throw new Error(`${format.toUpperCase()} files are not supported yet. Please use ZIP, TAR, or GZIP formats.`);
        default:
          throw new Error(`Unknown or unsupported compression format for ${file.name}`);
      }
    } catch (error) {
      throw new Error(`Decompression failed: ${error.message}`);
    }
  }

  async readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  async decompressZip(arrayBuffer, fileName, onProgress) {
    try {
      const zip = new JSZip();
      await zip.loadAsync(arrayBuffer);
      
      const files = [];
      let processedFiles = 0;
      const totalFiles = Object.keys(zip.files).length;
      
      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (this.shouldCancel) {
          throw new Error('Processing cancelled');
        }
        
        if (!zipEntry.dir) {
          const content = await zipEntry.async('text');
          files.push({
            name: relativePath,
            content: content,
            type: 'text'
          });
        }
        
        processedFiles++;
        if (onProgress) {
          onProgress({
            stage: 'extracting',
            progress: 20 + (processedFiles / totalFiles) * 70,
            currentFile: relativePath,
            fileIndex: processedFiles,
            totalFiles: totalFiles
          });
        }
      }
      
      if (files.length === 0) {
        throw new Error('No readable files found in ZIP archive');
      }
      
      if (files.length === 1) {
        return { content: files[0].content, type: 'zip' };
      }
      
      const combinedContent = files.map(f => f.content).join('\n');
      return { 
        content: combinedContent, 
        type: 'zip',
        isMultiFile: true,
        files: files
      };
    } catch (error) {
      throw new Error(`ZIP decompression failed: ${error.message}`);
    }
  }

  async decompressGzip(arrayBuffer, fileName, onProgress) {
    try {
      if (onProgress) {
        onProgress({ stage: 'decompressing', progress: 30 });
      }
      
      const compressed = new Uint8Array(arrayBuffer);
      const decompressed = pako.inflate(compressed, { to: 'string' });
      
      if (onProgress) {
        onProgress({ stage: 'extracting', progress: 80 });
      }
      
      return { content: decompressed, type: 'gzip' };
    } catch (error) {
      throw new Error(`GZIP decompression failed: ${error.message}`);
    }
  }

  async decompressTar(arrayBuffer, fileName, onProgress) {
    try {
      if (onProgress) {
        onProgress({ stage: 'decompressing', progress: 30 });
      }
      
      const files = await untar(arrayBuffer);
      const extractedFiles = [];
      
      for (let i = 0; i < files.length; i++) {
        if (this.shouldCancel) {
          throw new Error('Processing cancelled');
        }
        
        const file = files[i];
        if (file.type === 'file') {
          const content = new TextDecoder().decode(file.buffer);
          extractedFiles.push({
            name: file.name,
            content: content,
            type: 'text'
          });
        }
        
        if (onProgress) {
          onProgress({
            stage: 'extracting',
            progress: 30 + ((i + 1) / files.length) * 60,
            currentFile: file.name,
            fileIndex: i + 1,
            totalFiles: files.length
          });
        }
      }
      
      if (extractedFiles.length === 0) {
        throw new Error('No readable files found in TAR archive');
      }
      
      if (extractedFiles.length === 1) {
        return { content: extractedFiles[0].content, type: 'tar' };
      }
      
      const combinedContent = extractedFiles.map(f => f.content).join('\n');
      return { 
        content: combinedContent, 
        type: 'tar',
        isMultiFile: true,
        files: extractedFiles
      };
    } catch (error) {
      throw new Error(`TAR decompression failed: ${error.message}`);
    }
  }

  async decompressTarGz(arrayBuffer, fileName, onProgress) {
    try {
      // First decompress GZIP
      if (onProgress) {
        onProgress({ stage: 'decompressing', progress: 20 });
      }
      
      const compressed = new Uint8Array(arrayBuffer);
      const tarBuffer = pako.inflate(compressed);
      
      if (onProgress) {
        onProgress({ stage: 'decompressing', progress: 50 });
      }
      
      // Then extract TAR
      const files = await untar(tarBuffer.buffer);
      const extractedFiles = [];
      
      for (let i = 0; i < files.length; i++) {
        if (this.shouldCancel) {
          throw new Error('Processing cancelled');
        }
        
        const file = files[i];
        if (file.type === 'file') {
          const content = new TextDecoder().decode(file.buffer);
          extractedFiles.push({
            name: file.name,
            content: content,
            type: 'text'
          });
        }
        
        if (onProgress) {
          onProgress({
            stage: 'extracting',
            progress: 50 + ((i + 1) / files.length) * 40,
            currentFile: file.name,
            fileIndex: i + 1,
            totalFiles: files.length
          });
        }
      }
      
      if (extractedFiles.length === 0) {
        throw new Error('No readable files found in TAR.GZ archive');
      }
      
      if (extractedFiles.length === 1) {
        return { content: extractedFiles[0].content, type: 'tar.gz' };
      }
      
      const combinedContent = extractedFiles.map(f => f.content).join('\n');
      return { 
        content: combinedContent, 
        type: 'tar.gz',
        isMultiFile: true,
        files: extractedFiles
      };
    } catch (error) {
      throw new Error(`TAR.GZ decompression failed: ${error.message}`);
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
