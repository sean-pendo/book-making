import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle, Database, RefreshCw } from 'lucide-react';

interface DataFlowStep {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  description: string;
  timestamp?: Date;
}

interface AssignmentDataFlowTrackerProps {
  steps: DataFlowStep[];
  isVisible: boolean;
}

export const AssignmentDataFlowTracker: React.FC<AssignmentDataFlowTrackerProps> = ({
  steps,
  isVisible
}) => {
  if (!isVisible) return null;

  const getStepIcon = (status: DataFlowStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in-progress':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: DataFlowStep['status']) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'in-progress':
        return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Database className="w-4 h-4" />
          Assignment Data Flow
        </CardTitle>
        <CardDescription className="text-xs">
          Real-time tracking of assignment execution and data refresh
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-start gap-3 p-2 rounded border bg-white dark:bg-gray-900">
            <div className="flex items-center justify-center w-6 h-6 rounded-full border">
              {getStepIcon(step.status)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">{step.name}</h4>
                {getStatusBadge(step.status)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
              {step.timestamp && (
                <p className="text-xs text-muted-foreground mt-1">
                  {step.timestamp.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};