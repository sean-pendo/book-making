import React from 'react';
import { motion } from 'framer-motion';

interface EnhancedLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export const EnhancedLoader = ({ 
  size = 'md', 
  text = 'Loading...', 
  className = '' 
}: EnhancedLoaderProps) => {
  const sizeConfig = {
    sm: { container: 'h-32', spinner: 'h-8 w-8', text: 'text-sm' },
    md: { container: 'h-64', spinner: 'h-12 w-12', text: 'text-base' },
    lg: { container: 'h-96', spinner: 'h-16 w-16', text: 'text-lg' }
  };

  const config = sizeConfig[size];

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
        <div className="text-center">
          <motion.h3 
            className={`font-semibold text-foreground ${config.text}`}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {text}
          </motion.h3>
        </div>
      </motion.div>
    </div>
  );
};