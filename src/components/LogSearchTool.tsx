
import React, { useState, useCallback, useMemo } from 'react';
import { Upload, Search, X, FileText, Download, Eye, EyeOff, Plus, Trash2, Code, Split, AlertTriangle, Play, Pause } from 'lucide-react';
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
import { useSearchController } from '@/hooks/useSearchController';
import { useContentManager } from '@/hooks/useContentManager';
import { ProcessingNotification } from '@/components/ProcessingNotification';
import { VirtualScrollResults } from '@/components/VirtualScrollResults';
import { FileSizeWarning } from '@/components/FileSizeWarning';

interface SearchPattern {
  id: string;
  pattern: string;
  isRegex: boolean;
  isEnabled: boolean;
  color: string;
  logicalOperator?: 'AND' | 'OR';
}

const PATTERN_COLORS = [
  'pattern-1', 'pattern-2', 'pattern-3', 'pattern-4', 'pattern-5'
];

export function LogSearchTool() {
  const [patterns, setPatterns] = useState<SearchPattern[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [isRegexMode, setIsRegexMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isMultiFileMode, setIsMultiFileMode] = useState(false);
  const [showFileSizeWarning, setShowFileSizeWarning] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [showProcessingNotification, setShowProcessingNotification] = useState(false);
  const { toast } = useToast();

  // Use the new hooks
  const fileProcessor = useFileProcessor();
  const searchController = useSearchController();
  const contentManager = useContentManager();

  const addPattern = useCallback(() => {
    if (!newPattern.trim()) return;
    
    const pattern: SearchPattern = {
      id: Date.now().toString(),
      pattern: newPattern.trim(),
      isRegex: isRegexMode,
      isEnabled: true,
      color: PATTERN_COLORS[patterns.length % PATTERN_COLORS.length],
      logicalOperator: patterns.length > 0 ? 'AND' : undefined
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

  const toggleLogicalOperator = useCallback((id: string) => {
    setPatterns(prev => prev.map(p => 
      p.id === id ? { 
        ...p, 
        logicalOperator: p.logicalOperator === 'OR' ? 'AND' : 'OR'
      } : p
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

  const checkFileSizes = useCallback((files: FileList) => {
    const totalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);
    const estimatedLines = Math.ceil(totalSize / 100); // Rough estimate
    const sizeMB = totalSize / (1024 * 1024);
    
    if (sizeMB > 10 || estimatedLines > 50000) {
      setPendingFiles(files);
      setShowFileSizeWarning(true);
      return true;
    }
    return false;
  }, []);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Check file sizes first
    if (checkFileSizes(files)) {
      return;
    }

    await processFiles(files);
  }, [checkFileSizes]);

  const processFiles = useCallback(async (files: FileList) => {
    try {
      setShowProcessingNotification(true);
      const result = await fileProcessor.processFiles(files);
      
      const normalizedContent = result.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      contentManager.setContent(normalizedContent);
      
      let fileCount = files.length;
      let description = "";
      
      // Handle multi-file results from tar archives
      if (result.isMultiFile && result.files) {
        fileCount = result.files.length;
        description = `Successfully extracted and processed ${fileCount} files from archive`;
      } else if (files.length > 1) {
        description = `Successfully processed ${fileCount} files`;
      } else {
        description = `Successfully loaded ${files[0].name}`;
      }
      
      toast({
        title: "Files processed successfully",
        description: `${description} (${contentManager.lineCount} lines)`
      });
    } catch (error) {
      console.error('File processing error:', error);
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process the files",
        variant: "destructive"
      });
    } finally {
      setShowProcessingNotification(false);
    }
  }, [fileProcessor, contentManager, toast]);

  const handleFileSizeWarningContinue = useCallback(() => {
    setShowFileSizeWarning(false);
    if (pendingFiles) {
      processFiles(pendingFiles);
      setPendingFiles(null);
    }
  }, [pendingFiles, processFiles]);

  const handleFileSizeWarningCancel = useCallback(() => {
    setShowFileSizeWarning(false);
    setPendingFiles(null);
  }, []);

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

  const handleManualSearch = useCallback(() => {
    const content = contentManager.getFullContent();
    const result = searchController.triggerSearch(content, patterns, { showWarning: true });
    
    if (result?.requiresConfirmation) {
      toast({
        title: "Large content detected",
        description: "Search may take longer due to content size. Click 'Force Search' to continue.",
        action: (
          <Button 
            onClick={() => searchController.forceSearch(content, patterns)}
            size="sm"
            variant="outline"
          >
            Force Search
          </Button>
        )
      });
    }
  }, [contentManager, searchController, patterns, toast]);

  const clearContent = useCallback(() => {
    contentManager.clearContent();
    searchController.clearSearch();
    toast({
      title: "Content cleared",
      description: "All content has been cleared."
    });
  }, [contentManager, searchController, toast]);

  const exportResults = useCallback(() => {
    if (searchController.results.length === 0) {
      toast({
        title: "No results to export",
        description: "Add some patterns and search content first."
      });
      return;
    }
    
    const exportData = {
      patterns: patterns.filter(p => p.isEnabled),
      results: searchController.results,
      totalMatches: searchController.results.reduce((sum, result) => sum + result.matches.length, 0),
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
  }, [searchController.results, patterns, toast]);

  const totalMatches = searchController.results.reduce((sum, result) => sum + result.matches.length, 0);

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

        {/* File Size Warning */}
        {showFileSizeWarning && pendingFiles && (
          <FileSizeWarning
            files={Array.from(pendingFiles)}
            totalSize={Array.from(pendingFiles).reduce((sum, file) => sum + file.size, 0)}
            estimatedLines={Math.ceil(Array.from(pendingFiles).reduce((sum, file) => sum + file.size, 0) / 100)}
            onContinue={handleFileSizeWarningContinue}
            onCancel={handleFileSizeWarningCancel}
          />
        )}

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
                Optimized for large files with background processing
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

            {/* Content Management */}
            {contentManager.content && (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{contentManager.lineCount.toLocaleString()} lines</span>
                    <span>{(contentManager.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                    {contentManager.isLarge && (
                      <Badge variant="outline" className="text-orange-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Large Content
                      </Badge>
                    )}
                    {contentManager.truncated && (
                      <Badge variant="outline" className="text-blue-600">
                        Truncated View
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {contentManager.truncated && (
                      <Button onClick={contentManager.loadMore} variant="outline" size="sm">
                        Load Full Content
                      </Button>
                    )}
                    <Button onClick={clearContent} variant="outline" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear Content
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Text Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Or paste log content directly:</label>
              <Textarea
                placeholder="Paste your log content here..."
                value={contentManager.content}
                onChange={(e) => contentManager.setContent(e.target.value)}
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
              <div className="space-y-3">
                <h4 className="font-medium">Active Patterns:</h4>
                <div className="space-y-2">
                  {patterns.map((pattern, index) => (
                    <div key={pattern.id} className="flex items-center gap-2">
                      {index > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleLogicalOperator(pattern.id)}
                          className="h-6 min-w-[60px] text-xs font-semibold"
                        >
                          {pattern.logicalOperator || 'AND'}
                        </Button>
                      )}
                      <Badge
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
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search Controls */}
            <div className="flex items-center gap-4 pt-4 border-t">
              <Button 
                onClick={handleManualSearch}
                disabled={!contentManager.content || patterns.length === 0}
                className="bg-gradient-primary"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Search
              </Button>
              
              {searchController.isSearching && (
                <Button 
                  onClick={searchController.cancelSearch}
                  variant="outline"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Cancel Search
                </Button>
              )}
              
              <div className="flex items-center gap-2">
                <Switch
                  checked={searchController.autoSearchEnabled}
                  onCheckedChange={searchController.enableAutoSearch}
                />
                <span className="text-sm">Auto-search</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search Progress */}
        {searchController.isSearching && (
          <Card className="shadow-card-custom border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Searching...</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={searchController.cancelSearch}
                >
                  Cancel
                </Button>
              </div>
              <Progress value={searchController.progress} className="mb-2" />
              <div className="text-xs text-muted-foreground">
                Processed {searchController.processedLines} of {searchController.totalLines} lines
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
                  {totalMatches} matches in {searchController.results.length} lines
                </Badge>
              )}
            </CardTitle>
            {searchController.results.length > 0 && (
              <Button onClick={exportResults} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Results
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <VirtualScrollResults
              results={searchController.results}
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
