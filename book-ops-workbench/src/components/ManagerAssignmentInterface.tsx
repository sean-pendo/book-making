import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Edit, Check, X } from 'lucide-react';

interface ManagerAssignmentInterfaceProps {
  repId: string;
  currentFLM: string;
  buildId: string;
  onUpdate: () => void;
}

export const ManagerAssignmentInterface = ({ 
  repId, 
  currentFLM, 
  buildId, 
  onUpdate 
}: ManagerAssignmentInterfaceProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newFLM, setNewFLM] = useState(currentFLM);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!newFLM.trim()) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('sales_reps')
        .update({ flm: newFLM.trim() })
        .eq('rep_id', repId)
        .eq('build_id', buildId);

      if (error) throw error;

      toast({
        title: "Manager Updated",
        description: `Successfully assigned ${newFLM} as FLM`,
      });

      setIsEditing(false);
      onUpdate();
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to update manager assignment",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setNewFLM(currentFLM);
    setIsEditing(false);
  };

  if (currentFLM === 'Unassigned FLM' && !isEditing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsEditing(true)}
        className="h-6 px-2 text-xs"
      >
        <Edit className="h-3 w-3 mr-1" />
        Assign FLM
      </Button>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={newFLM}
          onChange={(e) => setNewFLM(e.target.value)}
          className="h-6 text-xs"
          placeholder="Enter FLM name"
          disabled={isLoading}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={isLoading || !newFLM.trim()}
          className="h-6 w-6 p-0"
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={isLoading}
          className="h-6 w-6 p-0"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return <span>{currentFLM}</span>;
};