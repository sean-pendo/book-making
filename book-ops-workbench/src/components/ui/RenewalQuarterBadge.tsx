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

  // Handle new format "Q1-FY27" or legacy "Q1"
  const upper = renewalQuarter.toUpperCase();
  
  // Extract just the quarter part (Q1, Q2, Q3, Q4) for styling
  const quarterMatch = upper.match(/Q[1-4]/);
  const quarterKey = quarterMatch ? quarterMatch[0] : null;
  
  // Normalize display: keep full format if it has FY, otherwise just show Q#
  let displayLabel = upper;
  if (!upper.startsWith('Q')) {
    // Handle plain number input like "1" -> "Q1"
    displayLabel = `Q${renewalQuarter}`;
  }
  
  const style = quarterKey 
    ? quarterStyles[quarterKey] 
    : 'bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600';

  return (
    <Badge 
      variant="outline" 
      className={`text-xs whitespace-nowrap min-w-[4rem] justify-center ${style} ${className}`}
    >
      {displayLabel}
    </Badge>
  );
}

