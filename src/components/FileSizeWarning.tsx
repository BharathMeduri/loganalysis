
import React from 'react';
import { AlertTriangle, FileText, Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FileSizeWarningProps {
  files: File[];
  totalSize: number;
  estimatedLines: number;
  onContinue: () => void;
  onCancel: () => void;
}

export function FileSizeWarning({
  files,
  totalSize,
  estimatedLines,
  onContinue,
  onCancel
}: FileSizeWarningProps) {
  const sizeMB = totalSize / (1024 * 1024);
  const isVeryLarge = sizeMB > 100 || estimatedLines > 100000;

  return (
    <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
          <AlertTriangle className="h-5 w-5" />
          Large File Warning
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>{files.length} file{files.length > 1 ? 's' : ''}</span>
          </div>
          <Badge variant="outline" className="text-orange-700 dark:text-orange-300">
            {sizeMB.toFixed(1)} MB
          </Badge>
          <Badge variant="outline" className="text-orange-700 dark:text-orange-300">
            ~{estimatedLines.toLocaleString()} lines
          </Badge>
        </div>

        <div className="text-sm text-orange-700 dark:text-orange-300 space-y-2">
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Processing may take {isVeryLarge ? '30-60 seconds' : '10-30 seconds'}
          </p>
          <p className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Search operations will be performed in the background
          </p>
        </div>

        {isVeryLarge && (
          <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
            <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
              Very large content detected. Consider:
            </p>
            <ul className="text-sm text-orange-700 dark:text-orange-300 mt-1 space-y-1">
              <li>• Splitting files into smaller chunks</li>
              <li>• Using more specific search patterns</li>
              <li>• Processing during off-peak hours</li>
            </ul>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={onContinue} className="bg-orange-600 hover:bg-orange-700">
            Continue Processing
          </Button>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
