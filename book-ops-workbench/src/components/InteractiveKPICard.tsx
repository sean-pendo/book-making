import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, TrendingDown, Info, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface KPIData {
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    percentage: number;
    period?: string;
  };
  comparison?: {
    label: string;
    value: number | string;
  };
  status?: 'success' | 'warning' | 'error' | 'info';
  icon: React.ElementType;
  onClick?: () => void;
  actionable?: boolean;
}

interface InteractiveKPICardProps {
  data: KPIData;
  className?: string;
  animated?: boolean;
  expandable?: boolean;
}

export const InteractiveKPICard = ({ 
  data, 
  className = '', 
  animated = true,
  expandable = false 
}: InteractiveKPICardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'success': return 'border-l-success bg-success-light/20 hover:bg-success-light/30';
      case 'warning': return 'border-l-warning bg-warning-light/20 hover:bg-warning-light/30';
      case 'error': return 'border-l-destructive bg-destructive-light/20 hover:bg-destructive-light/30';
      case 'info': return 'border-l-info bg-info-light/20 hover:bg-info-light/30';
      default: return 'border-l-primary bg-gradient-subtle hover:bg-background-elevated';
    }
  };

  const getTrendIcon = () => {
    if (!data.trend) return null;
    return data.trend.direction === 'up' ? TrendingUp : TrendingDown;
  };

  const getTrendColor = () => {
    if (!data.trend) return '';
    switch (data.trend.direction) {
      case 'up': return 'text-success bg-success-light';
      case 'down': return 'text-destructive bg-destructive-light';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const TrendIcon = getTrendIcon();
  const IconComponent = data.icon;

  return (
    <motion.div
      initial={animated ? { opacity: 0, y: 20 } : {}}
      animate={animated ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.3 }}
      className={className}
    >
        <Card 
          className={`
            card-interactive border-l-4 transition-all duration-300 cursor-pointer
            ${getStatusColor(data.status)}
            ${isHovered ? 'hover-glow scale-[1.02]' : ''}
            ${data.actionable ? 'hover:shadow-lg' : ''}
          `}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => {
            if (data.onClick) data.onClick();
            if (expandable) setIsExpanded(!isExpanded);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {data.title}
              {data.comparison && (
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{data.comparison.label}: {data.comparison.value}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <IconComponent className={`h-4 w-4 transition-colors ${
                isHovered ? 'text-primary' : 'text-muted-foreground'
              }`} />
              {data.actionable && (
                <ArrowRight className={`h-3 w-3 transition-all ${
                  isHovered ? 'translate-x-1 text-primary' : 'text-muted-foreground'
                }`} />
              )}
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-2">
              <motion.div 
                className="text-2xl font-bold text-foreground"
                animate={isHovered ? { scale: 1.05 } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                {data.value}
              </motion.div>
              
              <div className="flex items-center justify-between">
                {data.subtitle && (
                  <p className="text-xs text-muted-foreground">
                    {data.subtitle}
                  </p>
                )}
                
                {data.trend && TrendIcon && (
                  <Badge className={`${getTrendColor()} px-2 py-1 text-xs font-medium`}>
                    <TrendIcon className="h-3 w-3 mr-1" />
                    {data.trend.percentage}%
                    {data.trend.period && (
                      <span className="ml-1 opacity-70">
                        {data.trend.period}
                      </span>
                    )}
                  </Badge>
                )}
              </div>
            </div>

            <AnimatePresence>
              {isExpanded && expandable && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4 pt-4 border-t border-border space-y-2"
                >
                  {data.comparison && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{data.comparison.label}</span>
                      <span className="font-medium">{data.comparison.value}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className={data.status === 'success' ? 'status-success' : 'status-info'}>
                      {data.status === 'success' ? 'Healthy' : 'Active'}
                    </Badge>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
    </motion.div>
  );
};