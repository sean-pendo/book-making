import React from 'react';
import { motion } from 'framer-motion';

interface EnhancedLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  subtext?: string;
  progress?: { current: number; total: number } | null;
  className?: string;
}

export const EnhancedLoader = ({
  size = 'md',
  text = 'Loading...',
  subtext,
  progress,
  className = ''
}: EnhancedLoaderProps) => {
  const sizeConfig = {
    sm: { container: 'h-32', spinner: 'h-8 w-8', text: 'text-sm', subtext: 'text-xs' },
    md: { container: 'h-64', spinner: 'h-12 w-12', text: 'text-base', subtext: 'text-sm' },
    lg: { container: 'h-96', spinner: 'h-16 w-16', text: 'text-lg', subtext: 'text-base' }
  };

  const config = sizeConfig[size];
  const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : null;

  return (
    <div className={`flex items-center justify-center ${config.container} ${className}`}>
      <motion.div
        className="flex flex-col items-center space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="relative">
          <motion.div
            className={`${config.spinner} border-4 border-primary/20 border-t-primary rounded-full`}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className={`absolute inset-0 ${config.spinner} rounded-full bg-gradient-primary opacity-20`}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        <div className="text-center space-y-2">
          <motion.h3
            className={`font-semibold text-foreground ${config.text}`}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {text}
          </motion.h3>
          {(subtext || progress) && (
            <div className="space-y-2">
              {subtext && (
                <p className={`text-muted-foreground ${config.subtext}`}>{subtext}</p>
              )}
              {progress && (
                <div className="w-48 mx-auto">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{progress.current.toLocaleString()}</span>
                    <span>{progressPercent}%</span>
                    <span>{progress.total.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};