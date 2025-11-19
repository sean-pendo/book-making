import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { motion } from 'framer-motion';

interface SkeletonLoaderProps {
  variant?: 'card' | 'table' | 'chart' | 'list';
  count?: number;
  className?: string;
}

const shimmer = {
  initial: { backgroundPosition: '-200% 0' },
  animate: { 
    backgroundPosition: '200% 0',
    transition: {
      duration: 2,
      ease: 'linear' as const,
      repeat: Infinity,
    }
  }
};

const SkeletonElement = ({ className = '' }: { className?: string }) => (
  <motion.div
    className={`loading-shimmer rounded ${className}`}
    style={{
      background: 'linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-hover)) 50%, hsl(var(--muted)) 75%)',
      backgroundSize: '200% 100%',
    }}
    variants={shimmer}
    initial="initial"
    animate="animate"
  />
);

export const SkeletonLoader = ({ 
  variant = 'card', 
  count = 1, 
  className = '' 
}: SkeletonLoaderProps) => {
  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <Card className="card-elevated">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <SkeletonElement className="h-4 w-32" />
                <SkeletonElement className="h-4 w-4 rounded-full" />
              </div>
              <SkeletonElement className="h-3 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <SkeletonElement className="h-8 w-24" />
              <div className="space-y-2">
                <SkeletonElement className="h-3 w-full" />
                <SkeletonElement className="h-3 w-3/4" />
              </div>
            </CardContent>
          </Card>
        );

      case 'table':
        return (
          <Card className="card-elevated">
            <CardHeader>
              <SkeletonElement className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <SkeletonElement className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <SkeletonElement className="h-4 w-3/4" />
                    <SkeletonElement className="h-3 w-1/2" />
                  </div>
                  <SkeletonElement className="h-4 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>
        );

      case 'chart':
        return (
          <Card className="card-elevated">
            <CardHeader>
              <div className="flex items-center justify-between">
                <SkeletonElement className="h-5 w-40" />
                <SkeletonElement className="h-6 w-16 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center">
                <SkeletonElement className="h-24 w-24 rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <SkeletonElement className="h-3 w-16" />
                    <SkeletonElement className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      case 'list':
        return (
          <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
              <Card key={i} className="card-elevated">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <SkeletonElement className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <SkeletonElement className="h-4 w-3/4" />
                      <SkeletonElement className="h-3 w-1/2" />
                    </div>
                    <div className="space-y-2">
                      <SkeletonElement className="h-4 w-16" />
                      <SkeletonElement className="h-3 w-12" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      default:
        return <SkeletonElement className="h-20 w-full" />;
    }
  };

  return (
    <div className={`animate-fade-in ${className}`}>
      {count > 1 && variant !== 'list' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              {renderSkeleton()}
            </motion.div>
          ))}
        </div>
      ) : (
        renderSkeleton()
      )}
    </div>
  );
};