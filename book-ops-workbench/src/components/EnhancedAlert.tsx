import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Info, X, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EnhancedAlertProps {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  title?: string;
  description: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  animate?: boolean;
}

const alertIcons = {
  default: Info,
  destructive: AlertCircle,
  success: CheckCircle,
  warning: AlertTriangle,
  info: Info,
};

const alertStyles = {
  default: 'border-border bg-background text-foreground',
  destructive: 'border-destructive/50 bg-destructive/10 text-destructive-foreground',
  success: 'border-success/50 bg-success/10 text-success-foreground',
  warning: 'border-warning/50 bg-warning/10 text-warning-foreground',
  info: 'border-info/50 bg-info/10 text-info-foreground',
};

export const EnhancedAlert = ({
  variant = 'default',
  title,
  description,
  dismissible = false,
  onDismiss,
  action,
  className,
  animate = true
}: EnhancedAlertProps) => {
  const Icon = alertIcons[variant];

  const alertContent = (
    <Alert className={cn(
      'relative overflow-hidden card-glass border-glow',
      alertStyles[variant],
      className
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex-shrink-0 p-1 rounded-full',
          variant === 'success' && 'bg-success/20',
          variant === 'warning' && 'bg-warning/20',
          variant === 'destructive' && 'bg-destructive/20',
          variant === 'info' && 'bg-info/20',
          variant === 'default' && 'bg-muted/20'
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-1">
          {title && (
            <AlertTitle className="text-sm font-semibold">
              {title}
            </AlertTitle>
          )}
          <AlertDescription className="text-sm">
            {description}
          </AlertDescription>
          {action && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={action.onClick}
                className="hover-scale"
              >
                {action.label}
              </Button>
            </div>
          )}
        </div>
        {dismissible && onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="p-1 h-auto text-muted-foreground hover:text-foreground hover-scale"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {/* Animated background gradient */}
      <div className={cn(
        'absolute inset-0 opacity-5',
        variant === 'success' && 'bg-gradient-to-r from-success to-success-light',
        variant === 'warning' && 'bg-gradient-to-r from-warning to-warning-light',
        variant === 'destructive' && 'bg-gradient-to-r from-destructive to-destructive-light',
        variant === 'info' && 'bg-gradient-to-r from-info to-info-light',
        variant === 'default' && 'bg-gradient-subtle'
      )} />
    </Alert>
  );

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {alertContent}
      </motion.div>
    );
  }

  return alertContent;
};