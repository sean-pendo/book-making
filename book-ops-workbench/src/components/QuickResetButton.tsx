import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resetAndRegenerate } from '@/utils/resetAndRegenerate';

interface QuickResetButtonProps {
  buildId: string;
  onComplete?: () => void;
}

export const QuickResetButton = ({ buildId, onComplete }: QuickResetButtonProps) => {
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();

  const handleReset = async () => {
    if (!confirm('This will clear ALL existing assignments. Continue?')) return;
    
    setIsResetting(true);
    try {
      await resetAndRegenerate(buildId);
      
      toast({
        title: "Assignments Reset",
        description: "All assignments cleared. Ready for fresh generation with fixed logic.",
      });
      
      onComplete?.();
    } catch (error) {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Button
      onClick={handleReset}
      disabled={isResetting}
      variant="outline"
      size="sm"
    >
      {isResetting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Resetting...
        </>
      ) : (
        <>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset All Assignments
        </>
      )}
    </Button>
  );
};
