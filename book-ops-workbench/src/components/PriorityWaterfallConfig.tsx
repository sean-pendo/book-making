/**
 * Priority Waterfall Configuration Component
 * 
 * Drag-and-drop UI for configuring assignment priority order.
 * Features:
 * - P0, P1, P2... position format
 * - Expandable Stability Accounts with sub-conditions
 * - Tooltips for descriptions
 * - Disabled priorities at bottom
 * - CUSTOM mode shows ALL priorities
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { GripVertical, Lock, HelpCircle, RotateCcw, Sparkles, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  AssignmentMode,
  PriorityConfig,
  PriorityDefinition,
  SubCondition,
  SubConditionConfig,
  getAllPriorities,
  getDefaultPriorityConfig,
  getAvailablePriorities,
  getAvailableSubConditions,
  getPriorityById,
} from '@/config/priorityRegistry';
import { useMappedFields } from '@/hooks/useMappedFields';
import { detectAssignmentMode, getModeLabel, getModeDescription, ModeDetectionResult } from '@/services/modeDetectionService';

interface PriorityWaterfallConfigProps {
  buildId: string;
  currentMode: AssignmentMode;
  currentConfig: PriorityConfig[];
  onModeChange: (mode: AssignmentMode) => void;
  onConfigChange: (config: PriorityConfig[]) => void;
  onClose?: () => void;
}

interface SortablePriorityItemProps {
  priority: PriorityDefinition;
  config: PriorityConfig;
  position: number;
  onToggle: (id: string, enabled: boolean) => void;
  onSubConditionToggle?: (priorityId: string, subConditionId: string, enabled: boolean) => void;
  isLocked: boolean;
  mappedFields: { accounts: Set<string>; sales_reps: Set<string>; opportunities: Set<string> };
}

function SortablePriorityItem({ 
  priority, 
  config, 
  position,
  onToggle, 
  onSubConditionToggle,
  isLocked,
  mappedFields
}: SortablePriorityItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: priority.id, disabled: isLocked || !config.enabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasSubConditions = priority.subConditions && priority.subConditions.length > 0;
  
  // Get available sub-conditions
  const { available: availableSubs, unavailable: unavailableSubs } = hasSubConditions
    ? getAvailableSubConditions(priority, mappedFields)
    : { available: [], unavailable: [] };

  // Count enabled sub-conditions
  const enabledSubCount = config.subConditions?.filter(sc => sc.enabled).length ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-card ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      } ${!config.enabled ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Drag handle or lock icon */}
        <div className="flex-shrink-0 w-6">
          {isLocked ? (
            <Lock className="h-4 w-4 text-muted-foreground" />
          ) : !config.enabled ? (
            <div className="w-4 h-4" /> 
          ) : (
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Position badge - P0, P1, P2 format */}
        {config.enabled ? (
          <Badge 
            variant={position === 0 ? 'default' : 'outline'} 
            className={`w-8 h-6 flex items-center justify-center text-xs font-mono ${
              position === 0 ? 'bg-primary text-primary-foreground' : ''
            }`}
          >
            P{position}
          </Badge>
        ) : (
          <div className="w-8 h-6" /> 
        )}

        {/* Priority name and type badge */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-medium text-sm cursor-help">{priority.name}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p>{priority.description}</p>
            </TooltipContent>
          </Tooltip>
          <Badge variant={priority.type === 'holdover' ? 'secondary' : 'outline'} className="text-xs">
            {priority.type === 'holdover' ? 'Filter' : 'Optimize'}
          </Badge>
          {hasSubConditions && config.enabled && (
            <Badge variant="outline" className="text-xs">
              {enabledSubCount}/{priority.subConditions!.length} active
            </Badge>
          )}
        </div>

        {/* Expand button for sub-conditions */}
        {hasSubConditions && config.enabled && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Toggle switch */}
        <div className="flex-shrink-0">
          {isLocked ? (
            <Badge variant="secondary" className="text-xs">Always On</Badge>
          ) : (
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => onToggle(priority.id, checked)}
            />
          )}
        </div>
      </div>

      {/* Expandable sub-conditions */}
      {hasSubConditions && config.enabled && isExpanded && (
        <div className="px-3 pb-3 pt-0 ml-14 space-y-2 border-t">
          <div className="pt-2 text-xs text-muted-foreground mb-2">
            Sub-conditions (account stays if ANY enabled condition matches):
          </div>
          
          {/* Available sub-conditions */}
          {availableSubs.map(subCondition => {
            const subConfig = config.subConditions?.find(sc => sc.id === subCondition.id);
            const isEnabled = subConfig?.enabled ?? subCondition.defaultEnabled;
            
            return (
              <div key={subCondition.id} className="flex items-center gap-3 p-2 rounded bg-muted/50">
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => 
                    onSubConditionToggle?.(priority.id, subCondition.id, checked)
                  }
                  className="scale-75"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm cursor-help">{subCondition.name}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p>{subCondition.description}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
          
          {/* Unavailable sub-conditions */}
          {unavailableSubs.map(subCondition => (
            <div key={subCondition.id} className="flex items-center gap-3 p-2 rounded bg-muted/30 opacity-50">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-muted-foreground cursor-help">
                    {subCondition.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>{subCondition.description}</p>
                  <p className="text-xs mt-1 text-amber-500">
                    Missing: {subCondition.requiredFields.map(f => f.field).join(', ')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DisabledPriorityItemProps {
  priority: PriorityDefinition;
  onToggle: (id: string, enabled: boolean) => void;
}

function DisabledPriorityItem({ priority, onToggle }: DisabledPriorityItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card opacity-50">
      <div className="w-6" />
      <div className="w-8 h-6" />
      
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-medium text-sm text-muted-foreground cursor-help">
              {priority.name}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p>{priority.description}</p>
          </TooltipContent>
        </Tooltip>
        <Badge variant="outline" className="text-xs opacity-50">
          {priority.type === 'holdover' ? 'Filter' : 'Optimize'}
        </Badge>
      </div>

      <Switch
        checked={false}
        onCheckedChange={(checked) => onToggle(priority.id, checked)}
      />
    </div>
  );
}

interface UnavailablePriorityItemProps {
  priority: PriorityDefinition;
}

function UnavailablePriorityItem({ priority }: UnavailablePriorityItemProps) {
  // Get missing fields - for sub-condition priorities, show which sub-conditions are missing
  let missingInfo = '';
  if (priority.subConditions && priority.subConditions.length > 0) {
    const missingFields = priority.subConditions
      .flatMap(sc => sc.requiredFields.map(f => f.field));
    missingInfo = [...new Set(missingFields)].join(', ');
  } else {
    missingInfo = priority.requiredFields.map(f => f.field).join(', ');
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-muted/30 opacity-50 cursor-not-allowed">
      <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="w-8 h-6" />
      
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-medium text-sm text-muted-foreground cursor-help">
              {priority.name}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p>{priority.description}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <HelpCircle className="h-3 w-3" />
            <span>Missing data</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Missing data required: {missingInfo}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function PriorityWaterfallConfig({
  buildId,
  currentMode,
  currentConfig,
  onModeChange,
  onConfigChange,
  onClose,
}: PriorityWaterfallConfigProps) {
  const mappedFields = useMappedFields(buildId);
  const [detectedMode, setDetectedMode] = useState<ModeDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(true);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Detect mode on mount
  useEffect(() => {
    async function detect() {
      setIsDetecting(true);
      try {
        const result = await detectAssignmentMode(buildId);
        setDetectedMode(result);
      } catch (error) {
        console.error('[PriorityConfig] Mode detection failed:', error);
      } finally {
        setIsDetecting(false);
      }
    }
    detect();
  }, [buildId]);

  // Get available and unavailable priorities
  // For CUSTOM mode, show ALL priorities
  const { available, unavailable } = getAvailablePriorities(
    currentMode,
    mappedFields
  );

  // Separate enabled and disabled priorities
  const enabledPriorities = available.filter(p => {
    const config = currentConfig.find(c => c.id === p.id);
    return config?.enabled !== false;
  });
  
  const disabledPriorities = available.filter(p => {
    const config = currentConfig.find(c => c.id === p.id);
    return config?.enabled === false;
  });

  // Sort enabled priorities by position
  const sortedEnabled = [...enabledPriorities].sort((a, b) => {
    const configA = currentConfig.find(c => c.id === a.id);
    const configB = currentConfig.find(c => c.id === b.id);
    return (configA?.position ?? 999) - (configB?.position ?? 999);
  });

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedEnabled.findIndex(p => p.id === active.id);
      const newIndex = sortedEnabled.findIndex(p => p.id === over.id);

      // Check if we're trying to move a locked priority
      const activePriority = getPriorityById(active.id as string);
      if (activePriority?.isLocked) {
        return; // Don't allow moving locked priorities
      }

      // Check cannotGoAbove constraint
      if (activePriority?.cannotGoAbove) {
        const constraintIndex = sortedEnabled.findIndex(p => p.id === activePriority.cannotGoAbove);
        if (constraintIndex >= 0 && newIndex <= constraintIndex) {
          return; // Don't allow moving above the constraint
        }
      }

      // Calculate new order
      const newOrder = arrayMove(sortedEnabled, oldIndex, newIndex);

      // Update config with new positions
      const newConfig = currentConfig.map(c => {
        const newPosition = newOrder.findIndex(p => p.id === c.id);
        if (newPosition >= 0) {
          return { ...c, position: newPosition };
        }
        return c;
      });

      // Switch to CUSTOM mode when user drags
      if (currentMode !== 'CUSTOM') {
        onModeChange('CUSTOM');
      }

      onConfigChange(newConfig);
    }
  }, [sortedEnabled, currentConfig, currentMode, onModeChange, onConfigChange]);

  // Handle priority toggle
  const handleToggle = useCallback((id: string, enabled: boolean) => {
    let newConfig: PriorityConfig[];
    
    if (enabled) {
      // When enabling, add to the end of enabled priorities
      const maxPosition = Math.max(...currentConfig.filter(c => c.enabled).map(c => c.position), -1);
      newConfig = currentConfig.map(c => 
        c.id === id ? { ...c, enabled: true, position: maxPosition + 1 } : c
      );
      
      // If priority doesn't exist in config, add it
      if (!currentConfig.find(c => c.id === id)) {
        const priority = getPriorityById(id);
        newConfig.push({
          id,
          enabled: true,
          position: maxPosition + 1,
          weight: priority?.defaultWeight ?? 50,
          subConditions: priority?.subConditions?.map(sc => ({
            id: sc.id,
            enabled: sc.defaultEnabled
          }))
        });
      }
    } else {
      // When disabling, remove position and reorder remaining
      const disabledPosition = currentConfig.find(c => c.id === id)?.position ?? 999;
      newConfig = currentConfig.map(c => {
        if (c.id === id) {
          return { ...c, enabled: false, position: 999 };
        }
        // Shift positions of priorities that were after the disabled one
        if (c.enabled && c.position > disabledPosition) {
          return { ...c, position: c.position - 1 };
        }
        return c;
      });
    }

    // Switch to CUSTOM mode when user toggles
    if (currentMode !== 'CUSTOM') {
      onModeChange('CUSTOM');
    }

    onConfigChange(newConfig);
  }, [currentConfig, currentMode, onModeChange, onConfigChange]);

  // Handle sub-condition toggle
  const handleSubConditionToggle = useCallback((priorityId: string, subConditionId: string, enabled: boolean) => {
    const newConfig = currentConfig.map(c => {
      if (c.id === priorityId) {
        const subConditions = c.subConditions?.map(sc =>
          sc.id === subConditionId ? { ...sc, enabled } : sc
        ) ?? [];
        return { ...c, subConditions };
      }
      return c;
    });

    // Switch to CUSTOM mode when user toggles sub-conditions
    if (currentMode !== 'CUSTOM') {
      onModeChange('CUSTOM');
    }

    onConfigChange(newConfig);
  }, [currentConfig, currentMode, onModeChange, onConfigChange]);

  // Handle mode change from dropdown
  const handleModeSelect = useCallback((mode: string) => {
    const newMode = mode as AssignmentMode;
    onModeChange(newMode);

    // Reset to default config for the new mode
    if (newMode !== 'CUSTOM') {
      const defaultConfig = getDefaultPriorityConfig(newMode as Exclude<AssignmentMode, 'CUSTOM'>);
      onConfigChange(defaultConfig);
    }
  }, [onModeChange, onConfigChange]);

  // Handle reset to default
  const handleReset = useCallback(() => {
    const baseMode = currentMode === 'CUSTOM' 
      ? (detectedMode?.suggestedMode || 'ENT')
      : currentMode;
    
    onModeChange(baseMode as AssignmentMode);
    const defaultConfig = getDefaultPriorityConfig(baseMode as Exclude<AssignmentMode, 'CUSTOM'>);
    onConfigChange(defaultConfig);
  }, [currentMode, detectedMode, onModeChange, onConfigChange]);

  // Get config for a priority, or create a default one
  const getConfig = (priorityId: string): PriorityConfig => {
    const existing = currentConfig.find(c => c.id === priorityId);
    if (existing) return existing;
    
    const priority = getPriorityById(priorityId);
    return {
      id: priorityId,
      enabled: true,
      position: 999,
      weight: priority?.defaultWeight || 50,
      subConditions: priority?.subConditions?.map(sc => ({
        id: sc.id,
        enabled: sc.defaultEnabled
      }))
    };
  };

  const enabledCount = sortedEnabled.length;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Priority Configuration</CardTitle>
            <CardDescription>
              Configure the order and selection of assignment priorities
            </CardDescription>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Mode selector */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Assignment Mode</label>
            {detectedMode && !isDetecting && currentMode !== 'CUSTOM' && (
              <Badge variant="outline" className="text-xs gap-1">
                <Sparkles className="h-3 w-3" />
                Auto-detected
              </Badge>
            )}
            {currentMode === 'CUSTOM' && (
              <Badge variant="secondary" className="text-xs">
                Custom
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={currentMode} onValueChange={handleModeSelect}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ENT">{getModeLabel('ENT')}</SelectItem>
                <SelectItem value="COMMERCIAL">{getModeLabel('COMMERCIAL')}</SelectItem>
                <SelectItem value="EMEA">{getModeLabel('EMEA')}</SelectItem>
                <SelectItem value="CUSTOM">{getModeLabel('CUSTOM')}</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset to Default
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {getModeDescription(currentMode)}
          </p>

          {detectedMode && detectedMode.suggestedMode !== currentMode && currentMode !== 'CUSTOM' && (
            <Alert variant="default" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Auto-detection suggests <strong>{getModeLabel(detectedMode.suggestedMode)}</strong> mode.
                Reasons: {detectedMode.reasons.join(', ')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Priority list header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            Priority Order ({enabledCount} active)
          </span>
          <span className="text-xs text-muted-foreground">
            Drag to reorder • Toggle to enable/disable
          </span>
        </div>

        {/* Enabled priorities - draggable */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedEnabled.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {sortedEnabled.map((priority, index) => (
                <SortablePriorityItem
                  key={priority.id}
                  priority={priority}
                  config={getConfig(priority.id)}
                  position={index}
                  onToggle={handleToggle}
                  onSubConditionToggle={handleSubConditionToggle}
                  isLocked={priority.isLocked || false}
                  mappedFields={mappedFields}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Disabled priorities */}
        {disabledPriorities.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Disabled
              </span>
            </div>

            <div className="space-y-2">
              {disabledPriorities.map(priority => (
                <DisabledPriorityItem 
                  key={priority.id} 
                  priority={priority}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </div>
        )}

        {/* Unavailable priorities (missing data) */}
        {unavailable.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Unavailable (missing data)
              </span>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>These priorities require fields that weren't mapped during import</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="space-y-2">
              {unavailable.map(priority => (
                <UnavailablePriorityItem key={priority.id} priority={priority} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
