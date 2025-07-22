// Web Worker for decompression operations
import { ungzip } from 'pako';

self.onmessage = async function(e) {
  const { type, data, fileType } = e.data;
  
  try {
    if (type === 'decompress') {
      if (fileType === 'gzip') {
        // Handle gzip decompression
        const decompressed = ungzip(data, { to: 'string' });
        self.postMessage({ 
          type: 'success', 
          data: decompressed 
        });
      } else if (fileType === 'tar.gz') {
        // Handle tar.gz decompression
        self.postMessage({ 
          type: 'progress', 
          message: 'Decompressing gzip...' 
        });
        
        const decompressed = ungzip(data);
        
        self.postMessage({ 
          type: 'progress', 
          message: 'Processing tar archive...' 
        });
        
        // Import untar dynamically
        const { untar } = await import('/node_modules/js-untar/build/dist/untar.js');
        const files = await untar(decompressed.buffer);
        
        let combinedContent = '';
        let processedFiles = 0;
        
        for (const tarFile of files) {
          if (tarFile.type === '0') { // Regular file
            const decoder = new TextDecoder();
            const content = decoder.decode(tarFile.buffer);
            combinedContent += `\n--- ${tarFile.name} ---\n${content}`;
            
            processedFiles++;
            if (processedFiles % 5 === 0) {
              self.postMessage({ 
                type: 'progress', 
                message: `Processed ${processedFiles}/${files.length} files...` 
              });
            }
          }
        }
        
        self.postMessage({ 
          type: 'success', 
          data: combinedContent 
        });
      }
    }
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error.message 
    });
  }
};