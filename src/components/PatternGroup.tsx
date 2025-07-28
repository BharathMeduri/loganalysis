import React from 'react';
import { X, Eye, EyeOff, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface SearchPattern {
  id: string;
  pattern: string;
  isRegex: boolean;
  isEnabled: boolean;
  color: string;
}

export interface PatternGroup {
  id: string;
  name: string;
  patterns: SearchPattern[];
  isEnabled: boolean;
  logicalOperator: 'AND' | 'OR';
}

interface PatternGroupProps {
  group: PatternGroup;
  groupIndex: number;
  totalGroups: number;
  onToggleGroup: (groupId: string) => void;
  onTogglePattern: (groupId: string, patternId: string) => void;
  onRemovePattern: (groupId: string, patternId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onUpdateGroupOperator: (groupId: string, operator: 'AND' | 'OR') => void;
  onUpdateGroupBetweenOperator: (groupId: string, operator: 'AND' | 'OR') => void;
  groupBetweenOperator?: 'AND' | 'OR';
}

export function PatternGroup({
  group,
  groupIndex,
  totalGroups,
  onToggleGroup,
  onTogglePattern,
  onRemovePattern,
  onRemoveGroup,
  onUpdateGroupOperator,
  onUpdateGroupBetweenOperator,
  groupBetweenOperator
}: PatternGroupProps) {
  return (
    <div className="space-y-3">
      {/* Group-to-Group Operator */}
      {groupIndex > 0 && (
        <div className="flex justify-center">
          <Select 
            value={groupBetweenOperator || 'AND'} 
            onValueChange={(value: 'AND' | 'OR') => onUpdateGroupBetweenOperator(group.id, value)}
          >
            <SelectTrigger className="w-20 h-8 text-xs font-semibold bg-accent/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">AND</SelectItem>
              <SelectItem value="OR">OR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Group Container */}
      <div className={`p-4 rounded-lg border-2 transition-all ${
        group.isEnabled 
          ? 'border-primary/50 bg-primary/5' 
          : 'border-border/50 bg-muted/20 opacity-60'
      }`}>
        {/* Group Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleGroup(group.id)}
              className="h-6 w-6 p-0"
            >
              {group.isEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <span className="font-semibold text-sm">Group {groupIndex + 1}</span>
            <Badge variant="outline" className="text-xs">
              {group.patterns.length} pattern{group.patterns.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Within-Group Operator */}
            {group.patterns.length > 1 && (
              <Select 
                value={group.logicalOperator} 
                onValueChange={(value: 'AND' | 'OR') => onUpdateGroupOperator(group.id, value)}
              >
                <SelectTrigger className="w-16 h-6 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND</SelectItem>
                  <SelectItem value="OR">OR</SelectItem>
                </SelectContent>
              </Select>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveGroup(group.id)}
              className="h-6 w-6 p-0 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Group Patterns */}
        <div className="space-y-2">
          {group.patterns.map((pattern, patternIndex) => (
            <div key={pattern.id} className="flex items-center gap-2">
              {patternIndex > 0 && group.patterns.length > 1 && (
                <span className="text-xs font-semibold px-2 py-1 bg-muted rounded text-muted-foreground">
                  {group.logicalOperator}
                </span>
              )}
              
              <Badge
                variant="secondary"
                className={`flex items-center gap-2 px-3 py-1 ${
                  pattern.isEnabled && group.isEnabled 
                    ? `bg-${pattern.color}/20 border-${pattern.color}/40` 
                    : 'opacity-50'
                }`}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTogglePattern(group.id, pattern.id)}
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
                  onClick={() => onRemovePattern(group.id, pattern.id)}
                  className="h-4 w-4 p-0 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            </div>
          ))}
          
          {group.patterns.length === 0 && (
            <div className="text-xs text-muted-foreground italic py-2">
              No patterns in this group
            </div>
          )}
        </div>
      </div>
    </div>
  );
}