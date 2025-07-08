import React, { useState, useCallback, useMemo } from 'react';
import { Upload, Search, X, FileText, Download, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface SearchPattern {
  id: string;
  pattern: string;
  isRegex: boolean;
  isEnabled: boolean;
  color: string;
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

  const searchResults = useMemo(() => {
    if (!logContent || patterns.length === 0) return [];
    
    const lines = logContent.split('\n');
    const enabledPatterns = patterns.filter(p => p.isEnabled);
    const results: SearchResult[] = [];
    
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
    
    return results;
  }, [logContent, patterns]);

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

  const handleFileUpload = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setLogContent(content);
      toast({
        title: "File uploaded",
        description: `Successfully loaded ${file.name} (${content.split('\n').length} lines)`
      });
    };
    
    reader.readAsText(file);
  }, [toast]);

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
              <p className="text-lg font-medium mb-2">Drop log files here or click to browse</p>
              <p className="text-sm text-muted-foreground mb-4">Supports .log, .txt, and other text files</p>
              <input
                type="file"
                accept=".log,.txt,.json,.*"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                id="file-upload"
              />
              <Button asChild variant="outline">
                <label htmlFor="file-upload" className="cursor-pointer">
                  Browse Files
                </label>
              </Button>
            </div>

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