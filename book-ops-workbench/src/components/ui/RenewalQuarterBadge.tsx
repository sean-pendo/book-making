import { Badge } from "@/components/ui/badge";

interface RenewalQuarterBadgeProps {
  renewalQuarter: string | null | undefined;
  className?: string;
}

const quarterStyles: Record<string, string> = {
  'Q1': 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700',
  'Q2': 'bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-700',
  'Q3': 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700',
  'Q4': 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700',
};

export function RenewalQuarterBadge({ renewalQuarter, className = '' }: RenewalQuarterBadgeProps) {
  if (!renewalQuarter) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  // Normalize the quarter value (handle "Q1", "q1", "1", etc.)
  const normalized = renewalQuarter.toUpperCase().startsWith('Q') 
    ? renewalQuarter.toUpperCase() 
    : `Q${renewalQuarter}`;
  
  const style = quarterStyles[normalized] || 'bg-gray-50 text-gray-700 border-gray-300';

  return (
    <Badge variant="outline" className={`text-xs ${style} ${className}`}>
      {normalized}
    </Badge>
  );
}

