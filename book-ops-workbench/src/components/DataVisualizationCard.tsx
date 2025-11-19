import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProgressRing } from './ProgressRing';
import { AnimatedCounter } from './AnimatedCounter';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  Info, 
  Users, 
  Building2, 
  DollarSign,
  Target
} from 'lucide-react';

interface DataPoint {
  label: string;
  value: number;
  percentage?: number;
  color?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: number;
  };
}

interface DataVisualizationCardProps {
  title: string;
  subtitle?: string;
  totalValue: number;
  data: DataPoint[];
  type: 'donut' | 'progress' | 'comparison' | 'metric';
  icon?: React.ElementType;
  onClick?: () => void;
  className?: string;
  showTrends?: boolean;
  formatValue?: (value: number) => string;
}

export const DataVisualizationCard = ({
  title,
  subtitle,
  totalValue,
  data,
  type,
  icon: Icon = Building2,
  onClick,
  className = '',
  showTrends = false,
  formatValue = (value) => value.toLocaleString()
}: DataVisualizationCardProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const renderVisualization = () => {
    switch (type) {
      case 'donut':
        return (
          <div className="flex items-center justify-center">
            <ProgressRing
              progress={data[0]?.percentage || 0}
              size={100}
              color={data[0]?.percentage > 80 ? 'success' : data[0]?.percentage > 60 ? 'warning' : 'primary'}
              animated={true}
            />
          </div>
        );

      case 'progress':
        return (
          <div className="space-y-3">
            {data.map((item, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{formatValue(item.value)}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <motion.div
                    className="h-2 rounded-full"
                    style={{ backgroundColor: item.color || 'hsl(var(--primary))' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage || 0}%` }}
                    transition={{ duration: 1, delay: index * 0.2 }}
                  />
                </div>
              </div>
            ))}
          </div>
        );

      case 'comparison':
        return (
          <div className="grid grid-cols-2 gap-4">
            {data.slice(0, 4).map((item, index) => (
              <motion.div
                key={index}
                className="text-center p-3 rounded-lg bg-background-subtle"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="text-lg font-semibold text-foreground">
                  <AnimatedCounter 
                    value={item.value} 
                    formatValue={formatValue}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {item.label}
                </div>
                {item.trend && showTrends && (
                  <div className={`flex items-center justify-center mt-1 text-xs ${
                    item.trend.direction === 'up' ? 'text-success' : 'text-destructive'
                  }`}>
                    {item.trend.direction === 'up' ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {item.trend.value}%
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        );

      default:
        return (
          <div className="text-center py-4">
            <AnimatedCounter
              value={totalValue}
              className="text-3xl font-bold text-foreground"
              formatValue={formatValue}
            />
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
        );
    }
  };

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <Card
          className={`
            card-interactive transition-all duration-300
            ${onClick ? 'cursor-pointer hover-glow' : ''}
            ${isHovered ? 'scale-[1.02] shadow-lg' : ''}
          `}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={onClick}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 transition-colors ${
                  isHovered ? 'text-primary' : 'text-muted-foreground'
                }`} />
                <CardTitle className="text-base font-semibold">
                  {title}
                </CardTitle>
              </div>
              
              <div className="flex items-center gap-2">
                {data.length > 0 && data[0].trend && showTrends && (
                  <Badge className={`px-2 py-1 text-xs ${
                    data[0].trend.direction === 'up' 
                      ? 'bg-success-light text-success' 
                      : 'bg-destructive-light text-destructive'
                  }`}>
                    {data[0].trend.direction === 'up' ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {data[0].trend.value}%
                  </Badge>
                )}
                
                {onClick && (
                  <ArrowRight className={`h-4 w-4 transition-all ${
                    isHovered ? 'translate-x-1 text-primary' : 'text-muted-foreground'
                  }`} />
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {renderVisualization()}
            
            {type !== 'metric' && data.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-foreground">
                    {formatValue(totalValue)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </TooltipProvider>
  );
};