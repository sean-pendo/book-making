import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, Users, FileText, TrendingUp, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';

interface DataCounts {
  accounts: number;
  opportunities: number;
  salesReps: number;
  assignments: number;
}

interface DataVerificationProps {
  buildId: string;
  buildName?: string;
  onRefresh?: () => void;
}

export const DataVerification = ({ buildId, buildName, onRefresh }: DataVerificationProps) => {
  const [counts, setCounts] = useState<DataCounts>({ accounts: 0, opportunities: 0, salesReps: 0, assignments: 0 });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadDataCounts = useCallback(async () => {
    try {
      setLoading(true);
      
      // Use shared counting service for consistency
      const { buildCountService } = await import('@/services/buildCountService');
      const counts = await buildCountService.getBuildCounts(buildId);

      setCounts({
        accounts: counts.accounts,
        opportunities: counts.opportunities,
        salesReps: counts.salesReps,
        assignments: counts.assignments
      });
    } catch (error) {
      console.error('Error loading data counts:', error);
      toast({
        title: "Error Loading Data",
        description: "Could not load data verification counts.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [buildId, toast]);

  useEffect(() => {
    if (buildId) {
      loadDataCounts();
    }
  }, [buildId, loadDataCounts]);

  const handleNavigateToDashboard = () => {
    navigate('/dashboard');
  };

  const handleNavigateToBuild = () => {
    navigate(`/build/${buildId}`);
  };

  const getTotalRecords = useMemo(() => counts.accounts + counts.opportunities + counts.salesReps, [counts]);
  const hasData = getTotalRecords > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Data Verification
            </CardTitle>
            <CardDescription>
              Current data counts for {buildName ? `"${buildName}"` : 'selected build'}
            </CardDescription>
          </div>
          <Button variant="outline" onClick={loadDataCounts} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Database className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Accounts</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16 mx-auto" />
            ) : (
              <Badge variant={counts.accounts > 0 ? "default" : "secondary"} className="text-lg px-3 py-1">
                {counts.accounts.toLocaleString()}
              </Badge>
            )}
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Opportunities</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16 mx-auto" />
            ) : (
              <Badge variant={counts.opportunities > 0 ? "default" : "secondary"} className="text-lg px-3 py-1">
                {counts.opportunities.toLocaleString()}
              </Badge>
            )}
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Sales Reps</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16 mx-auto" />
            ) : (
              <Badge variant={counts.salesReps > 0 ? "default" : "secondary"} className="text-lg px-3 py-1">
                {counts.salesReps.toLocaleString()}
              </Badge>
            )}
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Assignments</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16 mx-auto" />
            ) : (
              <Badge variant={counts.assignments > 0 ? "default" : "secondary"} className="text-lg px-3 py-1">
                {counts.assignments.toLocaleString()}
              </Badge>
            )}
          </div>
        </div>

        {hasData && (
          <div className="pt-4 border-t space-y-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {getTotalRecords.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">
                Total Records Ready for Book Building
              </div>
            </div>
            
            <div className="flex gap-2 justify-center">
              <Button onClick={handleNavigateToBuild} className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Open Build Details
              </Button>
              <Button variant="outline" onClick={handleNavigateToDashboard} className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                View Dashboard
              </Button>
            </div>
          </div>
        )}

        {!hasData && !loading && (
          <div className="text-center py-4 text-muted-foreground">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No data found for this build.</p>
            <p className="text-sm">Import your CSV files to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};