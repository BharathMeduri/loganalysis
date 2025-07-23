
import React, { useState, useCallback, useMemo } from 'react';
import { Upload, Search, X, FileText, Download, Eye, EyeOff, Plus, Trash2, Code, Split } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useFileProcessor } from '@/hooks/useFileProcessor';
import { useStreamingSearch } from '@/hooks/useStreamingSearch';
import { ProcessingNotification } from '@/components/ProcessingNotification';
import { VirtualScrollResults } from '@/components/VirtualScrollResults';

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
  const [isMultiFileMode, setIsMultiFileMode] = useState(false);
  const [showProcessingNotification, setShowProcessingNotification] = useState(false);
  const { toast } = useToast();

  // Use the new hooks
  const fileProcessor = useFileProcessor();
  const streamingSearch = useStreamingSearch();

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

  const highlightText = useCallback((content: string, matches: any[]) => {
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
        
        if (content) {
          combinedContent += (combinedContent ? '\n' : '') + content;
        }
        
        processedFiles++;

        if (processedFiles === fileArray.length) {
          const normalizedContent = combinedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          const lineCount = normalizedContent.split('\n').filter(line => line.trim() !== '').length;
          
          setLogContent(normalizedContent);
          
          toast({
            title: "Multiple files processed",
            description: `Successfully combined ${fileArray.length} files (${lineCount} lines)`
          });
        }
      };
      
      reader.onerror = () => {
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
    if (!files || files.length === 0) return;

    // Handle multiple files
    if (files.length > 1 || isMultiFileMode) {
      handleMultipleFiles(files);
      return;
    }
    
    const file = files[0];
    
    try {
      setShowProcessingNotification(true);
      const result = await fileProcessor.processFile(file);
      
      const normalizedContent = result.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lineCount = normalizedContent.split('\n').filter(line => line.trim() !== '').length;
      
      setLogContent(normalizedContent);
      
      toast({
        title: "File processed successfully",
        description: `Successfully loaded ${file.name} (${lineCount} lines)`
      });
    } catch (error) {
      console.error('File processing error:', error);
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process the file",
        variant: "destructive"
      });
    }
  }, [fileProcessor, isMultiFileMode, handleMultipleFiles, toast]);

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

  const clearContent = useCallback(() => {
    setLogContent('');
    streamingSearch.clearResults();
    toast({
      title: "Content cleared",
      description: "All content has been cleared."
    });
  }, [streamingSearch, toast]);

  const exportResults = useCallback(() => {
    if (streamingSearch.results.length === 0) {
      toast({
        title: "No results to export",
        description: "Add some patterns and search content first."
      });
      return;
    }
    
    const exportData = {
      patterns: patterns.filter(p => p.isEnabled),
      results: streamingSearch.results,
      totalMatches: streamingSearch.results.reduce((sum, result) => sum + result.matches.length, 0),
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
  }, [streamingSearch.results, patterns, toast]);

  // Trigger search when patterns or content change
  React.useEffect(() => {
    if (logContent && patterns.some(p => p.isEnabled)) {
      streamingSearch.searchInChunks(logContent, patterns);
    }
  }, [logContent, patterns, streamingSearch]);

  const totalMatches = streamingSearch.results.reduce((sum, result) => sum + result.matches.length, 0);

  return (
    <div className="min-h-screen bg-gradient-dark p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Log Pattern Search Tool
          </h1>
          <p className="text-muted-foreground text-lg">
            Advanced pattern matching with streaming processing for large log files
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
                No size limits - all files processed in background with streaming
              </p>
              <input
                type="file"
                accept=".log,.txt,.json,.gz,.tar.gz,.tar,.tgz,.*"
                multiple={isMultiFileMode}
                onChange={(e) => handleFileUpload(e.target.files)}
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
            {logContent && (
              <div className="flex gap-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex-1 text-sm text-muted-foreground">
                  {logContent.split('\n').filter(line => line.trim() !== '').length} lines loaded
                </div>
                <Button onClick={clearContent} variant="outline" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Content
                </Button>
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

        {/* Search Progress */}
        {streamingSearch.isSearching && (
          <Card className="shadow-card-custom border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Searching...</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={streamingSearch.cancelSearch}
                >
                  Cancel
                </Button>
              </div>
              <Progress value={streamingSearch.progress} className="mb-2" />
              <div className="text-xs text-muted-foreground">
                Processed {streamingSearch.processedLines} of {streamingSearch.totalLines} lines
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search Results */}
        <Card className="shadow-card-custom border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Search Results
              {totalMatches > 0 && (
                <Badge variant="outline" className="bg-accent/20">
                  {totalMatches} matches in {streamingSearch.results.length} lines
                </Badge>
              )}
            </CardTitle>
            {streamingSearch.results.length > 0 && (
              <Button onClick={exportResults} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Results
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <VirtualScrollResults
              results={streamingSearch.results}
              itemHeight={80}
              containerHeight={400}
              onHighlightText={highlightText}
            />
          </CardContent>
        </Card>

        {/* Processing Notification */}
        <ProcessingNotification
          isVisible={showProcessingNotification}
          progress={fileProcessor.progress}
          onCancel={fileProcessor.cancelProcessing}
          onClose={() => setShowProcessingNotification(false)}
        />
      </div>
    </div>
  );
}
