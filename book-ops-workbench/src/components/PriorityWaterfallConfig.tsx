/**
 * Priority Waterfall Configuration Component
 * 
 * Drag-and-drop UI for configuring assignment priority order.
 * Shows available priorities as draggable items and unavailable
 * priorities at the bottom with lock icons.
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
import { GripVertical, Lock, HelpCircle, RotateCcw, Sparkles, AlertTriangle } from 'lucide-react';
import {
  AssignmentMode,
  PriorityConfig,
  PriorityDefinition,
  PRIORITY_REGISTRY,
  getDefaultPriorityConfig,
  getAvailablePriorities,
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
  onToggle: (id: string, enabled: boolean) => void;
  isLocked: boolean;
}

function SortablePriorityItem({ priority, config, onToggle, isLocked }: SortablePriorityItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: priority.id, disabled: isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      } ${!config.enabled ? 'opacity-60' : ''}`}
    >
      {/* Drag handle or lock icon */}
      <div className="flex-shrink-0 w-6">
        {isLocked ? (
          <Lock className="h-4 w-4 text-muted-foreground" />
        ) : (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Position badge */}
      <Badge variant="outline" className="w-6 h-6 flex items-center justify-center text-xs">
        {config.position + 1}
      </Badge>

      {/* Priority info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{priority.name}</span>
          <Badge variant={priority.type === 'holdover' ? 'secondary' : 'outline'} className="text-xs">
            {priority.type === 'holdover' ? 'Filter' : 'Optimize'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">{priority.description}</p>
      </div>

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
  );
}

interface UnavailablePriorityItemProps {
  priority: PriorityDefinition;
}

function UnavailablePriorityItem({ priority }: UnavailablePriorityItemProps) {
  const missingFields = priority.requiredFields.map(f => f.field).join(', ');

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-muted/30 opacity-50 cursor-not-allowed">
      <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-muted-foreground">{priority.name}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{priority.description}</p>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <HelpCircle className="h-3 w-3" />
            <span>Missing data</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Missing data required: {missingFields}</p>
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

  // Get available and unavailable priorities based on current mode
  const effectiveMode = currentMode === 'CUSTOM' 
    ? (detectedMode?.suggestedMode || 'ENT') 
    : currentMode;
    
  const { available, unavailable } = getAvailablePriorities(
    effectiveMode as Exclude<AssignmentMode, 'CUSTOM'>,
    mappedFields
  );

  // Sort available priorities by current config position
  const sortedAvailable = [...available].sort((a, b) => {
    const configA = currentConfig.find(c => c.id === a.id);
    const configB = currentConfig.find(c => c.id === b.id);
    return (configA?.position ?? 999) - (configB?.position ?? 999);
  });

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedAvailable.findIndex(p => p.id === active.id);
      const newIndex = sortedAvailable.findIndex(p => p.id === over.id);

      // Check if we're trying to move a locked priority
      const activePriority = getPriorityById(active.id as string);
      if (activePriority?.isLocked) {
        return; // Don't allow moving locked priorities
      }

      // Check cannotGoAbove constraint
      if (activePriority?.cannotGoAbove) {
        const constraintPriority = sortedAvailable.find(p => p.id === activePriority.cannotGoAbove);
        if (constraintPriority) {
          const constraintIndex = sortedAvailable.findIndex(p => p.id === activePriority.cannotGoAbove);
          // If trying to move above the constraint priority, block it
          if (newIndex <= constraintIndex) {
            return; // Don't allow moving above the constraint
          }
        }
      }

      // Calculate new order
      const newOrder = arrayMove(sortedAvailable, oldIndex, newIndex);

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
  }, [sortedAvailable, currentConfig, currentMode, onModeChange, onConfigChange]);

  // Handle priority toggle
  const handleToggle = useCallback((id: string, enabled: boolean) => {
    const newConfig = currentConfig.map(c => 
      c.id === id ? { ...c, enabled } : c
    );

    // Switch to CUSTOM mode when user toggles
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
    return currentConfig.find(c => c.id === priorityId) || {
      id: priorityId,
      enabled: true,
      position: 999,
      weight: getPriorityById(priorityId)?.defaultWeight || 50
    };
  };

  const enabledCount = currentConfig.filter(c => c.enabled).length;

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
                {currentMode === 'CUSTOM' && (
                  <SelectItem value="CUSTOM">{getModeLabel('CUSTOM')}</SelectItem>
                )}
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

        {/* Available priorities - draggable */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedAvailable.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {sortedAvailable.map(priority => (
                <SortablePriorityItem
                  key={priority.id}
                  priority={priority}
                  config={getConfig(priority.id)}
                  onToggle={handleToggle}
                  isLocked={priority.isLocked || false}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Unavailable priorities */}
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

