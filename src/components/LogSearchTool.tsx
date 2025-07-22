import React, { useState, useCallback, useMemo } from 'react';
import { Upload, Search, X, FileText, Download, Eye, EyeOff, Plus, Trash2, Code, Split, Combine } from 'lucide-react';
import * as pako from 'pako';
import { untar } from 'js-untar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface SearchPattern {
  id: string;
  pattern: string;
  isRegex: boolean;
  isEnabled: boolean;
  color: string;
}

interface LogicalGroup {
  id: string;
  operator: 'AND' | 'OR';
  patterns: string[];
  isEnabled: boolean;
}

interface LogicalExpression {
  groups: LogicalGroup[];
  operator: 'AND' | 'OR';
}

interface SearchResult {
  lineNumber: number;
  content: string;
  matches: Array<{
    pattern: string;
    color: string;
    start: number;
    end: number;
  }>;
  matchedGroups?: string[];
}

const PATTERN_COLORS = [
  'pattern-1', 'pattern-2', 'pattern-3', 'pattern-4', 'pattern-5'
];

export function LogSearchTool() {
  const [logContent, setLogContent] = useState('');
  const [patterns, setPatterns] = useState<SearchPattern[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [isRegexMode, setIsRegexMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchMode, setSearchMode] = useState<'simple' | 'logical'>('simple');
  const [logicalGroups, setLogicalGroups] = useState<LogicalGroup[]>([]);
  const [globalOperator, setGlobalOperator] = useState<'AND' | 'OR'>('AND');
  const [uploadedChunks, setUploadedChunks] = useState<string[]>([]);
  const [isMultiFileMode, setIsMultiFileMode] = useState(false);
  const { toast } = useToast();

  const addPattern = useCallback(() => {
    if (!newPattern.trim()) return;
    
    const pattern: SearchPattern = {
      id: Date.now().toString(),
      pattern: newPattern.trim(),
      isRegex: isRegexMode,
      isEnabled: true,
      color: PATTERN_COLORS[patterns.length % PATTERN_COLORS.length]
    };
    
    setPatterns(prev => [...prev, pattern]);
    setNewPattern('');
    
    toast({
      title: "Pattern added",
      description: `${isRegexMode ? 'Regex' : 'Text'} pattern "${newPattern}" added successfully.`
    });
  }, [newPattern, isRegexMode, patterns.length, toast]);

  const removePattern = useCallback((id: string) => {
    setPatterns(prev => prev.filter(p => p.id !== id));
  }, []);

  const togglePattern = useCallback((id: string) => {
    setPatterns(prev => prev.map(p => 
      p.id === id ? { ...p, isEnabled: !p.isEnabled } : p
    ));
  }, []);

  // Logical group management
  const addLogicalGroup = useCallback(() => {
    const newGroup: LogicalGroup = {
      id: Date.now().toString(),
      operator: 'OR',
      patterns: [],
      isEnabled: true
    };
    setLogicalGroups(prev => [...prev, newGroup]);
  }, []);

  const removeLogicalGroup = useCallback((groupId: string) => {
    setLogicalGroups(prev => prev.filter(g => g.id !== groupId));
  }, []);

  const updateGroupOperator = useCallback((groupId: string, operator: 'AND' | 'OR') => {
    setLogicalGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, operator } : g
    ));
  }, []);

  const addPatternToGroup = useCallback((groupId: string, patternId: string) => {
    setLogicalGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, patterns: [...g.patterns, patternId] } : g
    ));
  }, []);

  const removePatternFromGroup = useCallback((groupId: string, patternId: string) => {
    setLogicalGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, patterns: g.patterns.filter(p => p !== patternId) } : g
    ));
  }, []);

  const toggleLogicalGroup = useCallback((groupId: string) => {
    setLogicalGroups(prev => prev.map(g => 
      g.id === groupId ? { ...g, isEnabled: !g.isEnabled } : g
    ));
  }, []);

  // Search logic for both simple and logical modes
  const searchResults = useMemo(() => {
    if (!logContent || patterns.length === 0) return [];
    
    const lines = logContent.split('\n');
    const results: SearchResult[] = [];
    
    if (searchMode === 'simple') {
      // Simple mode: show lines that match ANY enabled pattern
      const enabledPatterns = patterns.filter(p => p.isEnabled);
      
      lines.forEach((line, index) => {
        const matches: SearchResult['matches'] = [];
        
        enabledPatterns.forEach(pattern => {
          try {
            if (pattern.isRegex) {
              const regex = new RegExp(pattern.pattern, 'gi');
              let match;
              while ((match = regex.exec(line)) !== null) {
                matches.push({
                  pattern: pattern.pattern,
                  color: pattern.color,
                  start: match.index,
                  end: match.index + match[0].length
                });
              }
            } else {
              let startIndex = 0;
              while ((startIndex = line.toLowerCase().indexOf(pattern.pattern.toLowerCase(), startIndex)) !== -1) {
                matches.push({
                  pattern: pattern.pattern,
                  color: pattern.color,
                  start: startIndex,
                  end: startIndex + pattern.pattern.length
                });
                startIndex += pattern.pattern.length;
              }
            }
          } catch (error) {
            console.warn(`Invalid regex pattern: ${pattern.pattern}`);
          }
        });
        
        if (matches.length > 0) {
          matches.sort((a, b) => a.start - b.start);
          results.push({
            lineNumber: index + 1,
            content: line,
            matches
          });
        }
      });
    } else {
      // Logical mode: evaluate logical expressions
      const enabledGroups = logicalGroups.filter(g => g.isEnabled && g.patterns.length > 0);
      
      if (enabledGroups.length === 0) return [];
      
      lines.forEach((line, index) => {
        const groupResults = enabledGroups.map(group => {
          const groupPatterns = group.patterns
            .map(pid => patterns.find(p => p.id === pid))
            .filter(Boolean) as SearchPattern[];
          
          const patternMatches = groupPatterns.map(pattern => {
            const matches: SearchResult['matches'] = [];
            try {
              if (pattern.isRegex) {
                const regex = new RegExp(pattern.pattern, 'gi');
                let match;
                while ((match = regex.exec(line)) !== null) {
                  matches.push({
                    pattern: pattern.pattern,
                    color: pattern.color,
                    start: match.index,
                    end: match.index + match[0].length
                  });
                }
              } else {
                let startIndex = 0;
                while ((startIndex = line.toLowerCase().indexOf(pattern.pattern.toLowerCase(), startIndex)) !== -1) {
                  matches.push({
                    pattern: pattern.pattern,
                    color: pattern.color,
                    start: startIndex,
                    end: startIndex + pattern.pattern.length
                  });
                  startIndex += pattern.pattern.length;
                }
              }
            } catch (error) {
              console.warn(`Invalid regex pattern: ${pattern.pattern}`);
            }
            return { pattern, hasMatch: matches.length > 0, matches };
          });
          
          // Evaluate group based on its operator
          const groupMatches = group.operator === 'AND' 
            ? patternMatches.every(pm => pm.hasMatch)
            : patternMatches.some(pm => pm.hasMatch);
          
          return {
            group,
            matches: groupMatches,
            allMatches: patternMatches.flatMap(pm => pm.matches)
          };
        });
        
        // Evaluate global operator between groups
        const lineMatches = globalOperator === 'AND'
          ? groupResults.every(gr => gr.matches)
          : groupResults.some(gr => gr.matches);
        
        if (lineMatches) {
          const allMatches = groupResults.flatMap(gr => gr.allMatches);
          allMatches.sort((a, b) => a.start - b.start);
          
          results.push({
            lineNumber: index + 1,
            content: line,
            matches: allMatches,
            matchedGroups: groupResults.filter(gr => gr.matches).map(gr => gr.group.id)
          });
        }
      });
    }
    
    return results;
  }, [logContent, patterns, searchMode, logicalGroups, globalOperator]);

  const highlightText = useCallback((content: string, matches: SearchResult['matches']) => {
    if (matches.length === 0) return content;
    
    let result = '';
    let lastIndex = 0;
    
    matches.forEach(match => {
      result += content.slice(lastIndex, match.start);
      result += `<span class="bg-${match.color} text-black px-1 rounded font-semibold">${content.slice(match.start, match.end)}</span>`;
      lastIndex = match.end;
    });
    
    result += content.slice(lastIndex);
    return result;
  }, []);

  // File decompression functions
  const isCompressedFile = useCallback((fileName: string): boolean => {
    const compressedExtensions = ['.gz', '.tar.gz', '.tar', '.tgz'];
    return compressedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }, []);

  const decompressGzipFile = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const compressed = new Uint8Array(reader.result as ArrayBuffer);
          const decompressed = pako.ungzip(compressed, { to: 'string' });
          resolve(decompressed);
        } catch (error) {
          reject(new Error(`Failed to decompress gzip file: ${error}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read compressed file'));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const decompressTarFile = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          
          toast({
            title: "Extracting tar archive...",
            description: "Processing tar file..."
          });
          
          await new Promise(resolve => setTimeout(resolve, 10));
          
          const files = await untar(arrayBuffer);
          
          // Combine all text files from the tar archive
          let combinedContent = '';
          let processedFiles = 0;
          
          for (const tarFile of files) {
            if (tarFile.type === '0') { // Regular file
              const decoder = new TextDecoder();
              const content = decoder.decode(tarFile.buffer);
              combinedContent += `\n--- ${tarFile.name} ---\n${content}`;
              
              processedFiles++;
              // Yield control periodically during large extractions
              if (processedFiles % 10 === 0) {
                toast({
                  title: "Processing files...",
                  description: `Processed ${processedFiles}/${files.length} files...`
                });
                await new Promise(resolve => setTimeout(resolve, 5));
              }
            }
          }
          
          resolve(combinedContent);
        } catch (error) {
          reject(new Error(`Failed to decompress tar file: ${error}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read tar file'));
      reader.readAsArrayBuffer(file);
    });
  }, [toast]);

  const decompressTarGzFile = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const compressed = new Uint8Array(reader.result as ArrayBuffer);
          
          // Show progress toast for decompression
          toast({
            title: "Decompressing...",
            description: "Extracting gzip archive..."
          });
          
          // Use setTimeout to yield control to the main thread
          await new Promise(resolve => setTimeout(resolve, 10));
          
          const decompressed = pako.ungzip(compressed);
          
          // Show progress for tar extraction
          toast({
            title: "Extracting files...",
            description: "Processing tar archive..."
          });
          
          await new Promise(resolve => setTimeout(resolve, 10));
          
          const files = await untar(decompressed.buffer);
          
          // Combine all text files from the tar.gz archive
          let combinedContent = '';
          let processedFiles = 0;
          
          for (const tarFile of files) {
            if (tarFile.type === '0') { // Regular file
              const decoder = new TextDecoder();
              const content = decoder.decode(tarFile.buffer);
              combinedContent += `\n--- ${tarFile.name} ---\n${content}`;
              
              processedFiles++;
              // Yield control periodically during large extractions
              if (processedFiles % 10 === 0) {
                toast({
                  title: "Processing files...",
                  description: `Processed ${processedFiles}/${files.length} files...`
                });
                await new Promise(resolve => setTimeout(resolve, 5));
              }
            }
          }
          
          resolve(combinedContent);
        } catch (error) {
          reject(new Error(`Failed to decompress tar.gz file: ${error}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read compressed file'));
      reader.readAsArrayBuffer(file);
    });
  }, [toast]);

  const handleCompressedFile = useCallback(async (file: File): Promise<string> => {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
      return await decompressTarGzFile(file);
    } else if (fileName.endsWith('.gz')) {
      return await decompressGzipFile(file);
    } else if (fileName.endsWith('.tar')) {
      return await decompressTarFile(file);
    } else {
      throw new Error('Unsupported compressed file format');
    }
  }, [decompressGzipFile, decompressTarFile, decompressTarGzFile]);

  // File splitting functionality
  const splitFileIntoChunks = useCallback((file: File, chunkSizeMB: number = 10): Promise<Blob[]> => {
    return new Promise((resolve) => {
      const chunkSize = chunkSizeMB * 1024 * 1024; // Convert MB to bytes
      const chunks: Blob[] = [];
      let offset = 0;

      while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        chunks.push(chunk);
        offset += chunkSize;
      }

      resolve(chunks);
    });
  }, []);

  const handleLargeFileUpload = useCallback(async (file: File) => {
    try {
      toast({
        title: "Splitting large file",
        description: `Splitting ${file.name} into smaller chunks...`
      });

      const chunks = await splitFileIntoChunks(file, 10); // 10MB chunks
      const chunkContents: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const reader = new FileReader();
        
        const content = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string || '');
          reader.onerror = reject;
          reader.readAsText(chunk);
        });

        chunkContents.push(content);
      }

      setUploadedChunks(chunkContents);
      const combinedContent = chunkContents.join('');
      const normalizedContent = combinedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lineCount = normalizedContent.split('\n').filter(line => line.trim() !== '').length;
      
      setLogContent(normalizedContent);
      toast({
        title: "Large file processed",
        description: `Successfully processed ${file.name} in ${chunks.length} chunks (${lineCount} lines, ${(file.size / 1024 / 1024).toFixed(1)}MB)`
      });
    } catch (error) {
      console.error('Error processing large file:', error);
      toast({
        title: "Processing failed",
        description: "Failed to process the large file. Please try again.",
        variant: "destructive"
      });
    }
  }, [splitFileIntoChunks, toast]);

  const handleMultipleFiles = useCallback((files: FileList) => {
    const fileArray = Array.from(files);
    let combinedContent = '';
    let processedFiles = 0;

    toast({
      title: "Processing multiple files",
      description: `Processing ${fileArray.length} files...`
    });

    const processFile = (file: File, index: number) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const content = e.target?.result as string || '';
        console.log(`File ${index + 1} processed:`, file.name, content.length, 'chars');
        
        if (content) {
          combinedContent += (combinedContent ? '\n' : '') + content;
        }
        
        processedFiles++;

        if (processedFiles === fileArray.length) {
          const normalizedContent = combinedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          const lineCount = normalizedContent.split('\n').filter(line => line.trim() !== '').length;
          
          console.log('Combined content length:', normalizedContent.length);
          console.log('Total lines:', lineCount);
          
          setLogContent(normalizedContent);
          setUploadedChunks([normalizedContent]);
          
          toast({
            title: "Multiple files processed",
            description: `Successfully combined ${fileArray.length} files (${lineCount} lines)`
          });
        }
      };
      
      reader.onerror = (error) => {
        console.error(`Error reading file ${file.name}:`, error);
        toast({
          title: "File processing failed",
          description: `Failed to process ${file.name}`,
          variant: "destructive"
        });
        processedFiles++;
      };
      
      reader.readAsText(file);
    };

    fileArray.forEach(processFile);
  }, [toast]);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    console.log('handleFileUpload called with:', files);
    console.log('Files length:', files?.length);
    console.log('isMultiFileMode:', isMultiFileMode);
    
    if (!files || files.length === 0) {
      console.log('No files provided');
      return;
    }

    // Log each file for debugging
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`File ${i}:`, {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      });
    }

    // Handle multiple files if in multi-file mode or multiple files selected
    if (files.length > 1 || isMultiFileMode) {
      handleMultipleFiles(files);
      return;
    }
    
    const file = files[0];
    console.log('Processing single file:', file.name, file.type, file.size);
    
    // Check if file is compressed
    if (isCompressedFile(file.name)) {
      console.log('Compressed file detected:', file.name);
      toast({
        title: "Compressed file detected",
        description: `Decompressing ${file.name}...`
      });
      
      try {
        const decompressedContent = await handleCompressedFile(file);
        const normalizedContent = decompressedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lineCount = normalizedContent.split('\n').filter(line => line.trim() !== '').length;
        
        setLogContent(normalizedContent);
        toast({
          title: "Compressed file processed",
          description: `Successfully decompressed ${file.name} (${lineCount} lines)`
        });
        return;
      } catch (error) {
        console.error('Error decompressing file:', error);
        toast({
          title: "Decompression failed",
          description: `Failed to decompress ${file.name}: ${error.message}`,
          variant: "destructive"
        });
        return;
      }
    }
    
    // Check file size (limit to 50MB for single file, offer splitting for larger files)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      toast({
        title: "Large file detected",
        description: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) is large. Processing in chunks...`
      });
      handleLargeFileUpload(file);
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      console.log('File read successful');
      const content = e.target?.result as string;
      console.log('Content length:', content?.length);
      
      if (!content || content.length === 0) {
        toast({
          title: "Empty file",
          description: "The uploaded file appears to be empty or corrupted.",
          variant: "destructive"
        });
        return;
      }
      
      console.log('First 200 chars:', content?.substring(0, 200));
      console.log('Line endings found:', {
        '\n': (content.match(/\n/g) || []).length,
        '\r\n': (content.match(/\r\n/g) || []).length,
        '\r': (content.match(/\r/g) || []).length
      });
      
      // Handle different line endings and count lines properly
      const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lineCount = normalizedContent.split('\n').filter(line => line.trim() !== '').length;
      
      setLogContent(normalizedContent);
      toast({
        title: "File uploaded",
        description: `Successfully loaded ${file.name} (${lineCount} lines, ${(file.size / 1024 / 1024).toFixed(1)}MB)`
      });
    };
    
    reader.onerror = (e) => {
      console.error('File read error:', e);
      toast({
        title: "Upload failed",
        description: "Failed to read the file. The file might be corrupted or too large.",
        variant: "destructive"
      });
    };
    
    reader.onabort = () => {
      console.error('File read aborted');
      toast({
        title: "Upload cancelled",
        description: "File upload was cancelled.",
        variant: "destructive"
      });
    };
    
    reader.readAsText(file);
  }, [toast, isMultiFileMode, handleMultipleFiles, handleLargeFileUpload]);

  const clearUploadedContent = useCallback(() => {
    setLogContent('');
    setUploadedChunks([]);
    toast({
      title: "Content cleared",
      description: "All uploaded content has been cleared."
    });
  }, [toast]);

  const exportSplitFiles = useCallback(() => {
    if (uploadedChunks.length === 0) {
      toast({
        title: "No chunks to export",
        description: "No file chunks available for export."
      });
      return;
    }

    uploadedChunks.forEach((chunk, index) => {
      const blob = new Blob([chunk], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `log-chunk-${index + 1}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });

    toast({
      title: "Chunks exported",
      description: `Exported ${uploadedChunks.length} file chunks.`
    });
  }, [uploadedChunks, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const exportResults = useCallback(() => {
    if (searchResults.length === 0) {
      toast({
        title: "No results to export",
        description: "Add some patterns and search content first."
      });
      return;
    }
    
    const exportData = {
      patterns: patterns.filter(p => p.isEnabled),
      results: searchResults,
      totalMatches: searchResults.reduce((sum, result) => sum + result.matches.length, 0),
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log-search-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Results exported",
      description: "Search results have been downloaded as JSON."
    });
  }, [searchResults, patterns, toast]);

  const totalMatches = searchResults.reduce((sum, result) => sum + result.matches.length, 0);

  return (
    <div className="min-h-screen bg-gradient-dark p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Log Pattern Search Tool
          </h1>
          <p className="text-muted-foreground text-lg">
            Advanced pattern matching with regex support for log analysis
          </p>
        </div>

        {/* File Upload & Input */}
        <Card className="shadow-card-custom border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Log Input
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                isDragOver 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border hover:border-primary/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                {isMultiFileMode ? 'Drop multiple files here or click to browse' : 'Drop log files here or click to browse'}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {isMultiFileMode ? 'Select multiple files to combine them' : 'Large files will be automatically split into chunks'}
              </p>
              <input
                type="file"
                accept=".log,.txt,.json,.gz,.tar.gz,.tar,.tgz,.*"
                multiple={isMultiFileMode}
                onChange={(e) => {
                  console.log('File input onChange triggered');
                  handleFileUpload(e.target.files);
                }}
                className="hidden"
                id="file-upload"
              />
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    Browse Files
                  </label>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsMultiFileMode(!isMultiFileMode)}
                  className={isMultiFileMode ? 'bg-primary/10 border-primary' : ''}
                >
                  <Split className="h-4 w-4 mr-2" />
                  {isMultiFileMode ? 'Multi-file Mode' : 'Single File Mode'}
                </Button>
              </div>
            </div>

            {/* File Management Controls */}
            {(logContent || uploadedChunks.length > 0) && (
              <div className="flex gap-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex-1 text-sm text-muted-foreground">
                  {uploadedChunks.length > 0 && (
                    <span>Content loaded from {uploadedChunks.length} chunk(s) • </span>
                  )}
                  {logContent.split('\n').filter(line => line.trim() !== '').length} lines loaded
                </div>
                <div className="flex gap-2">
                  {uploadedChunks.length > 0 && (
                    <Button onClick={exportSplitFiles} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export Chunks
                    </Button>
                  )}
                  <Button onClick={clearUploadedContent} variant="outline" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Content
                  </Button>
                </div>
              </div>
            )}

            {/* Text Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Or paste log content directly:</label>
              <Textarea
                placeholder="Paste your log content here..."
                value={logContent}
                onChange={(e) => setLogContent(e.target.value)}
                className="min-h-32 font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Pattern Input */}
        <Card className="shadow-card-custom border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Search Patterns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Enter search pattern..."
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addPattern()}
                  className="font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={isRegexMode}
                  onCheckedChange={setIsRegexMode}
                />
                <span className="text-sm">Regex</span>
              </div>
              <Button onClick={addPattern} className="bg-gradient-primary">
                Add Pattern
              </Button>
            </div>

            {/* Active Patterns */}
            {patterns.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Active Patterns:</h4>
                <div className="flex flex-wrap gap-2">
                  {patterns.map((pattern) => (
                    <Badge
                      key={pattern.id}
                      variant="secondary"
                      className={`flex items-center gap-2 px-3 py-1 ${
                        pattern.isEnabled ? `bg-${pattern.color}/20 border-${pattern.color}/40` : 'opacity-50'
                      }`}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePattern(pattern.id)}
                        className="h-4 w-4 p-0"
                      >
                        {pattern.isEnabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </Button>
                      <span className="font-mono text-xs">
                        {pattern.isRegex ? '/' + pattern.pattern + '/' : pattern.pattern}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePattern(pattern.id)}
                        className="h-4 w-4 p-0 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Mode Toggle & Logical Operations */}
        <Card className="shadow-card-custom border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              Search Logic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={searchMode} onValueChange={(value) => setSearchMode(value as 'simple' | 'logical')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="simple">Simple Mode</TabsTrigger>
                <TabsTrigger value="logical">Logical Operations</TabsTrigger>
              </TabsList>
              
              <TabsContent value="simple" className="space-y-4">
                <div className="rounded-lg bg-muted/30 p-4">
                  <h4 className="font-medium mb-2">Simple Mode</h4>
                  <p className="text-sm text-muted-foreground">
                    Shows lines that match ANY of the enabled patterns. All patterns are combined with OR logic.
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="logical" className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Logical Groups</h4>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Global Operator:</span>
                        <Select value={globalOperator} onValueChange={(value) => setGlobalOperator(value as 'AND' | 'OR')}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AND">AND</SelectItem>
                            <SelectItem value="OR">OR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={addLogicalGroup} size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Group
                      </Button>
                    </div>
                  </div>

                  {logicalGroups.length === 0 ? (
                    <div className="rounded-lg bg-muted/30 p-6 text-center">
                      <p className="text-sm text-muted-foreground mb-2">No logical groups created yet.</p>
                      <p className="text-xs text-muted-foreground">
                        Create groups to combine patterns with AND/OR logic. Example: (Pattern1 OR Pattern2) AND Pattern3
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {logicalGroups.map((group, index) => (
                        <div key={group.id} className="border border-border rounded-lg p-4 bg-card/50">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Group {index + 1}
                              </Badge>
                              <Select 
                                value={group.operator} 
                                onValueChange={(value) => updateGroupOperator(group.id, value as 'AND' | 'OR')}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="AND">AND</SelectItem>
                                  <SelectItem value="OR">OR</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleLogicalGroup(group.id)}
                                className="h-6 w-6 p-0"
                              >
                                {group.isEnabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                              </Button>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLogicalGroup(group.id)}
                              className="h-6 w-6 p-0 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Patterns in this group:</p>
                            {group.patterns.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">No patterns added yet</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {group.patterns.map(patternId => {
                                  const pattern = patterns.find(p => p.id === patternId);
                                  if (!pattern) return null;
                                  return (
                                    <Badge
                                      key={patternId}
                                      variant="secondary"
                                      className={`text-xs bg-${pattern.color}/20 border-${pattern.color}/40`}
                                    >
                                      {pattern.pattern}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removePatternFromGroup(group.id, patternId)}
                                        className="h-3 w-3 p-0 ml-1 hover:text-destructive"
                                      >
                                        <X className="h-2 w-2" />
                                      </Button>
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                            
                            <Select onValueChange={(patternId) => addPatternToGroup(group.id, patternId)}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Add pattern to group..." />
                              </SelectTrigger>
                              <SelectContent>
                                {patterns
                                  .filter(p => !group.patterns.includes(p.id))
                                  .map(pattern => (
                                    <SelectItem key={pattern.id} value={pattern.id}>
                                      {pattern.pattern} {pattern.isRegex ? '(regex)' : '(text)'}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                      
                      {logicalGroups.length > 0 && (
                        <div className="rounded-lg bg-accent/10 p-3 border border-accent/20">
                          <p className="text-sm font-medium mb-1">Current Expression:</p>
                          <p className="text-xs font-mono text-muted-foreground">
                            {logicalGroups
                              .filter(g => g.isEnabled && g.patterns.length > 0)
                              .map((group, index) => {
                                const groupPatterns = group.patterns
                                  .map(pid => patterns.find(p => p.id === pid)?.pattern)
                                  .filter(Boolean);
                                const groupExpr = groupPatterns.length > 1 
                                  ? `(${groupPatterns.join(` ${group.operator} `)})`
                                  : groupPatterns[0] || '';
                                return index === 0 ? groupExpr : ` ${globalOperator} ${groupExpr}`;
                              })
                              .join('')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Search Results */}
        <Card className="shadow-card-custom border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Search Results
              {totalMatches > 0 && (
                <Badge variant="outline" className="bg-accent/20">
                  {totalMatches} matches in {searchResults.length} lines
                </Badge>
              )}
            </CardTitle>
            {searchResults.length > 0 && (
              <Button onClick={exportResults} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Results
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {searchResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {logContent && patterns.some(p => p.isEnabled) 
                  ? "No matches found for the current patterns."
                  : "Add log content and search patterns to see results."
                }
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className="border border-border rounded bg-secondary/30 p-3 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="text-xs min-w-12 text-center">
                        {result.lineNumber}
                      </Badge>
                      <pre
                        className="text-sm font-mono flex-1 whitespace-pre-wrap break-all"
                        dangerouslySetInnerHTML={{
                          __html: highlightText(result.content, result.matches)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}