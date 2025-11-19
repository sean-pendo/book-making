import React, { useEffect, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  formatValue?: (value: number) => string;
  decimals?: number;
}

export const AnimatedCounter = ({
  value,
  duration = 2000,
  className = '',
  prefix = '',
  suffix = '',
  formatValue,
  decimals = 0
}: AnimatedCounterProps) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const formatDisplayValue = (val: number) => {
    if (formatValue) {
      return formatValue(val);
    }
    
    if (decimals > 0) {
      return val.toFixed(decimals);
    }
    
    return Math.round(val).toLocaleString();
  };

  return (
    <span className={className}>
      {prefix}
      <span>{formatDisplayValue(displayValue)}</span>
      {suffix}
    </span>
  );
};