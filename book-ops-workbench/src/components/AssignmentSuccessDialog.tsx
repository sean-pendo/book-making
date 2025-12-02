import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, PartyPopper } from 'lucide-react';

interface AssignmentSuccessDialogProps {
  open: boolean;
  onClose: () => void;
  assignmentCount: number;
  onViewBalancing?: () => void;
  onViewReview?: () => void;
}

export const AssignmentSuccessDialog: React.FC<AssignmentSuccessDialogProps> = ({
  open,
  onClose,
  assignmentCount,
  onViewBalancing,
  onViewReview
}) => {
  const [showCheck, setShowCheck] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (open) {
      // Stagger animations
      setShowCheck(false);
      setShowContent(false);
      
      const checkTimer = setTimeout(() => setShowCheck(true), 100);
      const contentTimer = setTimeout(() => setShowContent(true), 500);
      
      return () => {
        clearTimeout(checkTimer);
        clearTimeout(contentTimer);
      };
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md text-center border-green-200 dark:border-green-800">
        <div className="py-6 space-y-6">
          {/* Animated Check Circle */}
          <div className="relative flex justify-center">
            <div 
              className={`
                w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 
                flex items-center justify-center
                transition-all duration-500 ease-out
                ${showCheck ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}
              `}
            >
              <CheckCircle 
                className={`
                  w-16 h-16 text-green-600 dark:text-green-400
                  transition-all duration-300 delay-200
                  ${showCheck ? 'scale-100' : 'scale-0'}
                `}
                strokeWidth={1.5}
              />
            </div>
            
            {/* Confetti particles */}
            {showCheck && (
              <>
                <PartyPopper className="absolute -top-2 -left-4 w-6 h-6 text-amber-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <PartyPopper className="absolute -top-2 -right-4 w-6 h-6 text-pink-500 animate-bounce" style={{ animationDelay: '0.4s', transform: 'scaleX(-1)' }} />
              </>
            )}
          </div>

          {/* Success Message */}
          <div 
            className={`
              space-y-2 transition-all duration-500 delay-300
              ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}
          >
            <h2 className="text-2xl font-bold text-green-700 dark:text-green-300">
              Assignments Applied!
            </h2>
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">{assignmentCount.toLocaleString()}</span> assignments 
              have been saved to the database.
            </p>
          </div>

          {/* Action Buttons */}
          <div 
            className={`
              flex flex-col gap-2 pt-4 transition-all duration-500 delay-500
              ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}
          >
            {onViewBalancing && (
              <Button 
                onClick={() => {
                  onClose();
                  onViewBalancing();
                }}
                variant="outline"
                className="w-full"
              >
                View Balancing Dashboard
              </Button>
            )}
            {onViewReview && (
              <Button 
                onClick={() => {
                  onClose();
                  onViewReview();
                }}
                variant="outline"
                className="w-full"
              >
                View Review Dashboard
              </Button>
            )}
            <Button 
              onClick={onClose}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Continue Working
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


