
import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, FileText, Archive, Loader2 } from 'lucide-react';
import { ProcessingProgress } from '@/hooks/useFileProcessor';

interface ProcessingNotificationProps {
  isVisible: boolean;
  progress: ProcessingProgress | null;
  onCancel: () => void;
  onClose: () => void;
}

const stageMessages = {
  reading: 'Reading file...',
  decompressing: 'Decompressing archive...',
  extracting: 'Extracting files...',
  complete: 'Processing complete!'
};

const stageIcons = {
  reading: FileText,
  decompressing: Archive,
  extracting: Archive,
  complete: FileText
};

export function ProcessingNotification({
  isVisible,
  progress,
  onCancel,
  onClose
}: ProcessingNotificationProps) {
  if (!isVisible || !progress) return null;

  const Icon = stageIcons[progress.stage];
  const isComplete = progress.stage === 'complete';

  return (
    <div className="fixed top-4 right-4 z-50 w-96">
      <Card className="shadow-lg border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isComplete ? (
                <Icon className="h-5 w-5 text-green-500" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              <span className="font-medium text-sm">
                {stageMessages[progress.stage]}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={isComplete ? onClose : onCancel}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-2">
            <Progress 
              value={progress.progress} 
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.stage.charAt(0).toUpperCase() + progress.stage.slice(1)}</span>
              <span>{progress.progress.toFixed(0)}%</span>
            </div>
          </div>

          {isComplete && (
            <div className="mt-3 pt-3 border-t border-border">
              <Button
                onClick={onClose}
                className="w-full bg-green-500 hover:bg-green-600"
                size="sm"
              >
                Continue to Search
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
