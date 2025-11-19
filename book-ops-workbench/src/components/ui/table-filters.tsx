import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, X, Filter } from 'lucide-react';

export interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'text' | 'number' | 'date' | 'range';
  options?: { value: string; label: string }[];
  placeholder?: string;
  min?: number;
  max?: number;
}

export interface FilterValues {
  [key: string]: string | number | [number, number] | null;
}

interface TableFiltersProps {
  title?: string;
  filters: FilterConfig[];
  values: FilterValues;
  onChange: (key: string, value: any) => void;
  onClear: () => void;
  activeCount: number;
}

export const TableFilters = ({ 
  title = "Filters", 
  filters, 
  values, 
  onChange, 
  onClear, 
  activeCount 
}: TableFiltersProps) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const renderFilter = (filter: FilterConfig) => {
    const currentValue = values[filter.key];

    switch (filter.type) {
      case 'select':
        return (
          <div key={filter.key} className="space-y-2">
            <label className="text-sm font-medium">{filter.label}</label>
            <Select
              value={currentValue as string || 'all'}
              onValueChange={(value) => onChange(filter.key, value === 'all' ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={filter.placeholder || `Select ${filter.label}`} />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border z-50">
                <SelectItem value="all">All</SelectItem>
                {filter.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'text':
        return (
          <div key={filter.key} className="space-y-2">
            <label className="text-sm font-medium">{filter.label}</label>
            <Input
              value={currentValue as string || ''}
              onChange={(e) => onChange(filter.key, e.target.value || null)}
              placeholder={filter.placeholder}
            />
          </div>
        );

      case 'number':
        return (
          <div key={filter.key} className="space-y-2">
            <label className="text-sm font-medium">{filter.label}</label>
            <Input
              type="number"
              value={currentValue as number || ''}
              onChange={(e) => onChange(filter.key, e.target.value ? Number(e.target.value) : null)}
              placeholder={filter.placeholder}
              min={filter.min}
              max={filter.max}
            />
          </div>
        );

      case 'date':
        return (
          <div key={filter.key} className="space-y-2">
            <label className="text-sm font-medium">{filter.label}</label>
            <Input
              type="date"
              value={currentValue as string || ''}
              onChange={(e) => onChange(filter.key, e.target.value || null)}
            />
          </div>
        );

      case 'range':
        const rangeValue = currentValue as [number, number] || [filter.min || 0, filter.max || 100];
        return (
          <div key={filter.key} className="space-y-2">
            <label className="text-sm font-medium">{filter.label}</label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={rangeValue[0] || ''}
                onChange={(e) => onChange(filter.key, [Number(e.target.value) || 0, rangeValue[1]])}
                placeholder="Min"
                className="w-20"
              />
              <Input
                type="number"
                value={rangeValue[1] || ''}
                onChange={(e) => onChange(filter.key, [rangeValue[0], Number(e.target.value) || 0])}
                placeholder="Max"
                className="w-20"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <CardTitle className="text-base">{title}</CardTitle>
                {activeCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {activeCount} active
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClear();
                    }}
                    className="h-6 px-2"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </Button>
                )}
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filters.map(renderFilter)}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};