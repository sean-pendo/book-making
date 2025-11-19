import React from 'react';
import { motion } from 'framer-motion';

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showPercentage?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'error';
  animated?: boolean;
}

export const ProgressRing = ({
  progress,
  size = 120,
  strokeWidth = 8,
  className = '',
  showPercentage = true,
  color = 'primary',
  animated = true
}: ProgressRingProps) => {
  const normalizedRadius = (size - strokeWidth * 2) / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const getColor = () => {
    switch (color) {
      case 'success': return 'hsl(var(--success))';
      case 'warning': return 'hsl(var(--warning))';
      case 'error': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--primary))';
    }
  };

  const getGradientId = () => `gradient-${color}-${Math.random().toString(36).substr(2, 9)}`;
  const gradientId = getGradientId();

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg
        height={size}
        width={size}
        className="transform -rotate-90"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={getColor()} stopOpacity="1" />
            <stop offset="100%" stopColor={getColor()} stopOpacity="0.6" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Background circle */}
        <circle
          stroke="hsl(var(--muted))"
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
          opacity={0.3}
        />
        
        {/* Progress circle */}
        <motion.circle
          stroke={`url(#${gradientId})`}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={animated ? strokeDashoffset : circumference - (progress / 100) * circumference}
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
          strokeLinecap="round"
          filter="url(#glow)"
          initial={animated ? { strokeDashoffset: circumference } : {}}
          animate={animated ? { strokeDashoffset: strokeDashoffset } : {}}
          transition={{ 
            duration: 1.5, 
            ease: "easeInOut",
            delay: 0.2
          }}
        />
      </svg>
      
      {showPercentage && (
        <motion.div 
          className="absolute inset-0 flex items-center justify-center"
          initial={animated ? { opacity: 0, scale: 0.5 } : {}}
          animate={animated ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              {Math.round(progress)}%
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Complete
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};