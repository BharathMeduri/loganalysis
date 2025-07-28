import { useState, useCallback } from 'react';
import { SearchPattern, PatternGroup } from '@/components/PatternGroup';

const PATTERN_COLORS = [
  'pattern-1', 'pattern-2', 'pattern-3', 'pattern-4', 'pattern-5'
];

interface GroupBetweenOperator {
  groupId: string;
  operator: 'AND' | 'OR';
}

export function usePatternGroups() {
  const [groups, setGroups] = useState<PatternGroup[]>([]);
  const [groupBetweenOperators, setGroupBetweenOperators] = useState<GroupBetweenOperator[]>([]);

  const createGroup = useCallback(() => {
    const newGroup: PatternGroup = {
      id: Date.now().toString(),
      name: `Group ${groups.length + 1}`,
      patterns: [],
      isEnabled: true,
      logicalOperator: 'AND'
    };
    
    setGroups(prev => [...prev, newGroup]);
    return newGroup.id;
  }, [groups.length]);

  const removeGroup = useCallback((groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setGroupBetweenOperators(prev => prev.filter(op => op.groupId !== groupId));
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setGroups(prev => prev.map(group => 
      group.id === groupId ? { ...group, isEnabled: !group.isEnabled } : group
    ));
  }, []);

  const updateGroupOperator = useCallback((groupId: string, operator: 'AND' | 'OR') => {
    setGroups(prev => prev.map(group => 
      group.id === groupId ? { ...group, logicalOperator: operator } : group
    ));
  }, []);

  const updateGroupBetweenOperator = useCallback((groupId: string, operator: 'AND' | 'OR') => {
    setGroupBetweenOperators(prev => {
      const existing = prev.find(op => op.groupId === groupId);
      if (existing) {
        return prev.map(op => op.groupId === groupId ? { ...op, operator } : op);
      } else {
        return [...prev, { groupId, operator }];
      }
    });
  }, []);

  const addPatternToGroup = useCallback((groupId: string, pattern: string, isRegex: boolean) => {
    setGroups(prev => prev.map(group => {
      if (group.id === groupId) {
        const newPattern: SearchPattern = {
          id: Date.now().toString(),
          pattern: pattern.trim(),
          isRegex,
          isEnabled: true,
          color: PATTERN_COLORS[group.patterns.length % PATTERN_COLORS.length]
        };
        return { ...group, patterns: [...group.patterns, newPattern] };
      }
      return group;
    }));
  }, []);

  const removePatternFromGroup = useCallback((groupId: string, patternId: string) => {
    setGroups(prev => prev.map(group => 
      group.id === groupId 
        ? { ...group, patterns: group.patterns.filter(p => p.id !== patternId) }
        : group
    ));
  }, []);

  const togglePatternInGroup = useCallback((groupId: string, patternId: string) => {
    setGroups(prev => prev.map(group => 
      group.id === groupId 
        ? {
            ...group, 
            patterns: group.patterns.map(pattern => 
              pattern.id === patternId 
                ? { ...pattern, isEnabled: !pattern.isEnabled }
                : pattern
            )
          }
        : group
    ));
  }, []);

  const getGroupBetweenOperator = useCallback((groupId: string): 'AND' | 'OR' => {
    return groupBetweenOperators.find(op => op.groupId === groupId)?.operator || 'AND';
  }, [groupBetweenOperators]);

  const getAllEnabledPatterns = useCallback((): SearchPattern[] => {
    return groups
      .filter(group => group.isEnabled)
      .flatMap(group => group.patterns.filter(pattern => pattern.isEnabled));
  }, [groups]);

  const clearAll = useCallback(() => {
    setGroups([]);
    setGroupBetweenOperators([]);
  }, []);

  return {
    groups,
    groupBetweenOperators,
    createGroup,
    removeGroup,
    toggleGroup,
    updateGroupOperator,
    updateGroupBetweenOperator,
    addPatternToGroup,
    removePatternFromGroup,
    togglePatternInGroup,
    getGroupBetweenOperator,
    getAllEnabledPatterns,
    clearAll
  };
}