// File Processor Web Worker - Fixed version
// Handles file processing with proper error handling and fallbacks

console.log('File processor worker initializing...');

// Import compression libraries with fallbacks
let pako, untar, JSZip;
let librariesLoaded = false;

// Try to load libraries with error handling
async function initLibraries() {
  try {
    console.log('Loading compression libraries...');
    
    // Load pako (gzip/deflate)
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');
    pako = self.pako;
    
    // Load js-untar (tar files)
    importScripts('https://cdn.jsdelivr.net/npm/js-untar@2.0.0/dist/untar.js');
    untar = self.untar;
    
    // Load JSZip (zip files)
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    JSZip = self.JSZip;
    
    librariesLoaded = true;
    console.log('All compression libraries loaded successfully');
    return true;
    
  } catch (error) {
    console.warn('Failed to load external libraries, using fallbacks:', error);
    
    // Fallback implementations
    pako = {
      inflate: function(data, options = {}) {
        console.warn('Using fallback pako - limited gzip support');
        // Basic fallback - just decode as text if possible
        try {
          return options.to === 'string' ? new TextDecoder().decode(data) : data;
        } catch (e) {
          throw new Error('Fallback pako cannot decompress this gzip file');
        }
      }
    };
    
    untar = async function(arrayBuffer) {
      console.warn('Using fallback untar - no TAR support');
      throw new Error('TAR files are not supported without external libraries');
    };
    
    JSZip = function() {
      console.warn('Using fallback JSZip - no ZIP support');
      this.loadAsync = function() {
        throw new Error('ZIP files are not supported without external libraries');
      };
    };
    
    librariesLoaded = false;
    return false;
  }
}

class FileProcessor {
  constructor() {
    this.cancelled = false;
    this.currentJobId = null;
  }

  async processFiles(files, options = {}) {
    console.log('Processing files:', files.length, 'files');
    
    // Ensure libraries are loaded
    if (!librariesLoaded) {
      await initLibraries();
    }
    
    this.cancelled = false;

    this.postProgress('reading', 0, 'Starting processing...');

    if (files.length === 1) {
      return this.processSingleFile(files[0], options);
    } else {
      return this.processMultipleFiles(files, options);
    }
  }

  async processMultipleFiles(files, options = {}) {
    const results = [];
    let combinedContent = '';
    
    for (let i = 0; i < files.length; i++) {
      if (this.cancelled) return null;
      
      const fileData = files[i];
      this.postProgress('extracting', Math.round((i / files.length) * 100), fileData.name, i + 1, files.length);
      
      try {
        const result = await this.processSingleFile(fileData, options);
        results.push({
          name: fileData.name,
          content: result.content,
          type: result.type
        });
        
        combinedContent += `\n=== ${fileData.name} ===\n${result.content}\n`;
      } catch (error) {
        console.warn(`Failed to process file ${fileData.name}:`, error);
        results.push({
          name: fileData.name,
          content: `Error processing file: ${error.message}`,
          type: 'error'
        });
      }
    }

    return {
      content: combinedContent.trim(),
      type: 'multi-file',
      isMultiFile: true,
      files: results
    };
  }

  async processSingleFile(fileData, options = {}) {
    console.log('Processing single file:', fileData.name, fileData.size, 'bytes');
    
    if (this.cancelled) return null;

    this.postProgress('reading', 10, fileData.name);

    try {
      if (this.isCompressedFile(fileData.name)) {
        return await this.decompressFile(fileData, options);
      } else {
        return await this.processRegularFile(fileData, options);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      throw new Error(`Failed to process ${fileData.name}: ${error.message}`);
    }
  }

  isCompressedFile(fileName) {
    const compressedExtensions = [
      '.zip', '.gz', '.gzip', '.tar', '.tar.gz', '.tgz'
    ];
    
    const lowerName = fileName.toLowerCase();
    return compressedExtensions.some(ext => lowerName.endsWith(ext));
  }

  detectCompressionFormat(fileName, arrayBuffer) {
    const lowerName = fileName.toLowerCase();
    
    // Check file extension first
    if (lowerName.endsWith('.zip')) return 'zip';
    if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) return 'tar.gz';
    if (lowerName.endsWith('.gz') || lowerName.endsWith('.gzip')) return 'gzip';
    if (lowerName.endsWith('.tar')) return 'tar';
    
    // Check magic bytes as fallback
    try {
      const view = new Uint8Array(arrayBuffer.slice(0, 4));
      
      // ZIP magic bytes: PK (0x504B)
      if (view[0] === 0x50 && view[1] === 0x4B) return 'zip';
      
      // GZIP magic bytes: 1f 8b
      if (view[0] === 0x1f && view[1] === 0x8b) return 'gzip';
      
      // TAR files don't have reliable magic bytes at start
      // Check for tar signature at offset 257 if buffer is large enough
      if (arrayBuffer.byteLength > 262) {
        const tarView = new Uint8Array(arrayBuffer.slice(257, 262));
        const tarSignature = String.fromCharCode(...tarView);
        if (tarSignature === 'ustar') return 'tar';
      }
    } catch (e) {
      console.warn('Failed to check magic bytes:', e);
    }
    
    return 'unknown';
  }

  async decompressFile(fileData, options = {}) {
    this.postProgress('decompressing', 20, fileData.name);
    
    const arrayBuffer = fileData.buffer;
    const format = this.detectCompressionFormat(fileData.name, arrayBuffer);
    
    console.log('Detected format:', format, 'for file:', fileData.name);
    
    try {
      switch (format) {
        case 'zip':
          return await this.decompressZip(arrayBuffer, fileData.name, options);
        case 'gzip':
          return await this.decompressGzip(arrayBuffer, fileData.name, options);
        case 'tar':
          return await this.decompressTar(arrayBuffer, fileData.name, options);
        case 'tar.gz':
          return await this.decompressTarGz(arrayBuffer, fileData.name, options);
        default:
          console.warn('Unknown compression format, treating as regular file');
          return await this.processRegularFile(fileData, options);
      }
    } catch (error) {
      console.error('Decompression failed:', error);
      // If decompression fails, try to process as regular text file
      console.log('Attempting to process as regular file...');
      return await this.processRegularFile(fileData, options);
    }
  }

  async decompressZip(arrayBuffer, fileName, options = {}) {
    try {
      this.postProgress('decompressing', 40, fileName);
      
      if (!JSZip || !librariesLoaded) {
        throw new Error('ZIP support not available - external library failed to load');
      }
      
      const zip = new JSZip();
      const zipData = await zip.loadAsync(arrayBuffer);
      
      const files = [];
      let combinedContent = '';
      
      const fileNames = Object.keys(zipData.files).filter(name => !zipData.files[name].dir);
      let processedCount = 0;
      
      for (const relativePath of fileNames) {
        if (this.cancelled) return null;
        
        const zipEntry = zipData.files[relativePath];
        this.postProgress('extracting', 60 + Math.round((processedCount / fileNames.length) * 30), relativePath);
        
        try {
          const content = await zipEntry.async('text');
          files.push({
            name: relativePath,
            content: content,
            type: 'text'
          });
          
          combinedContent += `\n=== ${relativePath} ===\n${content}\n`;
        } catch (error) {
          console.warn(`Failed to extract ${relativePath}:`, error);
        }
        processedCount++;
      }
      
      if (files.length === 0) {
        throw new Error('No readable files found in ZIP archive');
      }
      
      if (files.length === 1) {
        return {
          content: files[0].content,
          type: 'zip',
          isMultiFile: false
        };
      } else {
        return {
          content: combinedContent.trim(),
          type: 'zip',
          isMultiFile: true,
          files: files
        };
      }
    } catch (error) {
      console.error('ZIP decompression error:', error);
      throw new Error(`Failed to decompress ZIP file: ${error.message}`);
    }
  }

  async decompressGzip(arrayBuffer, fileName, options = {}) {
    try {
      this.postProgress('decompressing', 50, fileName);
      
      if (!pako || !librariesLoaded) {
        throw new Error('GZIP support not available - external library failed to load');
      }
      
      const compressed = new Uint8Array(arrayBuffer);
      const decompressed = pako.inflate(compressed, { to: 'string' });
      
      return {
        content: decompressed,
        type: 'gzip',
        isMultiFile: false
      };
    } catch (error) {
      console.error('GZIP decompression error:', error);
      throw new Error(`Failed to decompress GZIP file: ${error.message}`);
    }
  }

  async decompressTar(arrayBuffer, fileName, options = {}) {
    try {
      this.postProgress('decompressing', 50, fileName);
      
      if (!untar || !librariesLoaded) {
        throw new Error('TAR support not available - external library failed to load');
      }
      
      const files = await untar(arrayBuffer);
      
      if (!files || files.length === 0) {
        throw new Error('No files found in TAR archive');
      }
      
      let combinedContent = '';
      const extractedFiles = [];
      
      for (let i = 0; i < files.length; i++) {
        if (this.cancelled) return null;
        
        const file = files[i];
        this.postProgress('extracting', 60 + Math.round((i / files.length) * 30), file.name);
        
        if (file.type === 'file' && file.buffer) {
          const content = new TextDecoder().decode(file.buffer);
          extractedFiles.push({
            name: file.name,
            content: content,
            type: 'text'
          });
          
          combinedContent += `\n=== ${file.name} ===\n${content}\n`;
        }
      }
      
      if (extractedFiles.length === 0) {
        throw new Error('No readable files found in TAR archive');
      }
      
      if (extractedFiles.length === 1) {
        return {
          content: extractedFiles[0].content,
          type: 'tar',
          isMultiFile: false
        };
      } else {
        return {
          content: combinedContent.trim(),
          type: 'tar',
          isMultiFile: true,
          files: extractedFiles
        };
      }
    } catch (error) {
      console.error('TAR decompression error:', error);
      throw new Error(`Failed to decompress TAR file: ${error.message}`);
    }
  }

  async decompressTarGz(arrayBuffer, fileName, options = {}) {
    try {
      this.postProgress('decompressing', 40, fileName);
      
      if (!pako || !untar || !librariesLoaded) {
        throw new Error('TAR.GZ support not available - external libraries failed to load');
      }
      
      // First decompress the gzip layer
      const compressed = new Uint8Array(arrayBuffer);
      const tarData = pako.inflate(compressed);
      
      this.postProgress('extracting', 60, fileName);
      
      // Then extract the tar archive
      const files = await untar(tarData.buffer);
      
      if (!files || files.length === 0) {
        throw new Error('No files found in TAR.GZ archive');
      }
      
      let combinedContent = '';
      const extractedFiles = [];
      
      for (let i = 0; i < files.length; i++) {
        if (this.cancelled) return null;
        
        const file = files[i];
        this.postProgress('extracting', 70 + Math.round((i / files.length) * 20), file.name);
        
        if (file.type === 'file' && file.buffer) {
          const content = new TextDecoder().decode(file.buffer);
          extractedFiles.push({
            name: file.name,
            content: content,
            type: 'text'
          });
          
          combinedContent += `\n=== ${file.name} ===\n${content}\n`;
        }
      }
      
      if (extractedFiles.length === 0) {
        throw new Error('No readable files found in TAR.GZ archive');
      }
      
      if (extractedFiles.length === 1) {
        return {
          content: extractedFiles[0].content,
          type: 'tar.gz',
          isMultiFile: false
        };
      } else {
        return {
          content: combinedContent.trim(),
          type: 'tar.gz',
          isMultiFile: true,
          files: extractedFiles
        };
      }
    } catch (error) {
      console.error('TAR.GZ decompression error:', error);
      throw new Error(`Failed to decompress TAR.GZ file: ${error.message}`);
    }
  }

  async processRegularFile(fileData, options = {}) {
    try {
      this.postProgress('reading', 70, fileData.name);
      
      const content = new TextDecoder().decode(fileData.buffer);
      
      this.postProgress('reading', 90, fileData.name);
      
      return {
        content: content,
        type: 'text',
        isMultiFile: false
      };
    } catch (error) {
      console.error('Regular file processing error:', error);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  postProgress(stage, progress, currentFile, fileIndex, totalFiles) {
    if (this.cancelled) return;
    
    self.postMessage({
      type: 'PROGRESS',
      id: this.currentJobId,
      data: {
        stage,
        progress: Math.min(100, Math.max(0, progress)),
        currentFile,
        fileIndex,
        totalFiles
      }
    });
  }

  cancel() {
    console.log('Cancelling file processing...');
    this.cancelled = true;
  }
}

// Initialize libraries on worker start
initLibraries();

// Initialize processor
const processor = new FileProcessor();

// Handle messages from main thread
self.onmessage = async function(e) {
  const { type, id, data } = e.data;
  
  console.log('Worker received message:', type, id);
  processor.currentJobId = id;
  
  try {
    switch (type) {
      case 'PROCESS_FILES':
        if (processor.cancelled) {
          processor.cancelled = false; // Reset for new job
        }
        
        const result = await processor.processFiles(data.files, data.options || {});
        
        if (result && !processor.cancelled) {
          self.postMessage({
            type: 'SUCCESS',
            id: id,
            data: result
          });
        }
        break;
        
      case 'CANCEL':
        processor.cancel();
        self.postMessage({
          type: 'CANCELLED',
          id: id
        });
        break;
        
      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({
      type: 'ERROR',
      id: id,
      data: {
        message: error.message || 'Unknown processing error'
      }
    });
  }
};

console.log('File processor worker ready');