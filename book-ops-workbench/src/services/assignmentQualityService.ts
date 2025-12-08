/**
 * Assignment Quality Service
 * 
 * Measures the quality of assignment outputs to determine if the
 * waterfall algorithm is producing "good" distributions.
 * 
 * This service calculates metrics BEFORE and AFTER assignment runs
 * to quantify improvement and identify problem areas.
 */

export interface RepWorkloadSnapshot {
  repId: string;
  repName: string;
  region: string | null;
  isStrategic: boolean;
  
  // ARR metrics
  customerARR: number;
  prospectNetARR: number;
  
  // Count metrics
  customerAccounts: number;
  prospectAccounts: number;
  totalAccounts: number;
  
  // Risk metrics
  creCount: number;
  tier1Count: number;
  tier2Count: number;
  
  // Renewal metrics
  q1Renewals: number;
  q2Renewals: number;
  q3Renewals: number;
  q4Renewals: number;
}

export interface AssignmentQualityMetrics {
  // Timestamp and context
  calculatedAt: string;
  buildId: string;
  phase: 'before' | 'after';
  
  // Distribution metrics (lower coefficient of variation is better)
  arrDistribution: {
    mean: number;
    stdDev: number;
    coefficientOfVariation: number;  // stdDev / mean - target < 0.15
    min: number;
    max: number;
    range: number;
  };
  
  // CRE risk distribution
  creDistribution: {
    mean: number;
    stdDev: number;
    coefficientOfVariation: number;
    maxPerRep: number;
    repsOverLimit: number;  // Reps with CRE > configured max
  };
  
  // Tier distribution
  tier1Distribution: {
    mean: number;
    stdDev: number;
    coefficientOfVariation: number;
  };
  
  tier2Distribution: {
    mean: number;
    stdDev: number;
    coefficientOfVariation: number;
  };
  
  // Business rule compliance (higher is better)
  compliance: {
    continuityRate: number;       // % accounts with same owner
    geographyMatchRate: number;   // % accounts in home region
    strategicCompliance: number;  // % strategic accounts with strategic reps
    parentChildAlignment: number; // % parent/child with same owner
  };
  
  // Quarterly renewal balance
  renewalBalance: {
    q1Variance: number;
    q2Variance: number;
    q3Variance: number;
    q4Variance: number;
    worstQuarterVariance: number;
  };
  
  // Composite scores (0-100, higher is better)
  scores: {
    distributionScore: number;    // How evenly distributed
    complianceScore: number;      // How well rules are followed
    riskScore: number;            // How well risk is spread
    overallScore: number;         // Weighted composite
  };
  
  // Problem identification
  warnings: QualityWarning[];
}

export interface QualityWarning {
  severity: 'low' | 'medium' | 'high';
  category: 'distribution' | 'compliance' | 'risk' | 'capacity';
  message: string;
  affectedReps?: string[];
  metric?: string;
  value?: number;
  threshold?: number;
}

export interface QualityComparison {
  before: AssignmentQualityMetrics;
  after: AssignmentQualityMetrics;
  improvements: {
    metric: string;
    before: number;
    after: number;
    change: number;
    changePercent: number;
    improved: boolean;
  }[];
  overallImprovement: number;  // -100 to +100
}

/**
 * Calculate standard deviation of an array of numbers
 */
function calculateStdDev(values: number[]): { mean: number; stdDev: number; cv: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0, cv: 0 };
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean === 0 ? 0 : stdDev / mean;
  
  return { mean, stdDev, cv };
}

/**
 * Calculate quality metrics from rep workload snapshots
 */
export function calculateQualityMetrics(
  snapshots: RepWorkloadSnapshot[],
  buildId: string,
  phase: 'before' | 'after',
  config?: {
    maxCrePerRep?: number;
    targetARR?: number;
    continuityAccounts?: { accountId: string; sameOwner: boolean }[];
    geographyMatches?: { accountId: string; matched: boolean }[];
  }
): AssignmentQualityMetrics {
  
  // Filter to normal reps only for distribution metrics
  const normalReps = snapshots.filter(s => !s.isStrategic);
  
  if (normalReps.length === 0) {
    throw new Error('No normal reps found for quality calculation');
  }
  
  const warnings: QualityWarning[] = [];
  
  // ARR Distribution
  const arrValues = normalReps.map(r => r.customerARR);
  const arrStats = calculateStdDev(arrValues);
  const arrDistribution = {
    mean: arrStats.mean,
    stdDev: arrStats.stdDev,
    coefficientOfVariation: arrStats.cv,
    min: Math.min(...arrValues),
    max: Math.max(...arrValues),
    range: Math.max(...arrValues) - Math.min(...arrValues)
  };
  
  if (arrStats.cv > 0.20) {
    warnings.push({
      severity: arrStats.cv > 0.30 ? 'high' : 'medium',
      category: 'distribution',
      message: `ARR distribution has ${(arrStats.cv * 100).toFixed(1)}% coefficient of variation (target < 15%)`,
      metric: 'arrCV',
      value: arrStats.cv,
      threshold: 0.15
    });
  }
  
  // CRE Distribution
  const creValues = normalReps.map(r => r.creCount);
  const creStats = calculateStdDev(creValues);
  const maxCrePerRep = config?.maxCrePerRep || 3;
  const repsOverCreLimit = normalReps.filter(r => r.creCount > maxCrePerRep);
  
  const creDistribution = {
    mean: creStats.mean,
    stdDev: creStats.stdDev,
    coefficientOfVariation: creStats.cv,
    maxPerRep: Math.max(...creValues),
    repsOverLimit: repsOverCreLimit.length
  };
  
  if (repsOverCreLimit.length > 0) {
    warnings.push({
      severity: 'high',
      category: 'risk',
      message: `${repsOverCreLimit.length} reps exceed CRE limit of ${maxCrePerRep}`,
      affectedReps: repsOverCreLimit.map(r => r.repName),
      metric: 'repsOverCreLimit',
      value: repsOverCreLimit.length,
      threshold: 0
    });
  }
  
  // Tier 1 Distribution
  const tier1Values = normalReps.map(r => r.tier1Count);
  const tier1Stats = calculateStdDev(tier1Values);
  const tier1Distribution = {
    mean: tier1Stats.mean,
    stdDev: tier1Stats.stdDev,
    coefficientOfVariation: tier1Stats.cv
  };
  
  // Tier 2 Distribution
  const tier2Values = normalReps.map(r => r.tier2Count);
  const tier2Stats = calculateStdDev(tier2Values);
  const tier2Distribution = {
    mean: tier2Stats.mean,
    stdDev: tier2Stats.stdDev,
    coefficientOfVariation: tier2Stats.cv
  };
  
  // Compliance rates
  const continuityAccounts = config?.continuityAccounts || [];
  const continuityRate = continuityAccounts.length > 0
    ? continuityAccounts.filter(a => a.sameOwner).length / continuityAccounts.length
    : 1;
  
  const geographyMatches = config?.geographyMatches || [];
  const geographyMatchRate = geographyMatches.length > 0
    ? geographyMatches.filter(a => a.matched).length / geographyMatches.length
    : 1;
  
  // Strategic compliance (all strategic accounts with strategic reps)
  const strategicReps = snapshots.filter(s => s.isStrategic);
  const strategicCompliance = 1; // Would need account-level data to calculate
  
  const compliance = {
    continuityRate,
    geographyMatchRate,
    strategicCompliance,
    parentChildAlignment: 1 // Would need hierarchy data to calculate
  };
  
  // Quarterly renewal balance
  const q1Values = normalReps.map(r => r.q1Renewals);
  const q2Values = normalReps.map(r => r.q2Renewals);
  const q3Values = normalReps.map(r => r.q3Renewals);
  const q4Values = normalReps.map(r => r.q4Renewals);
  
  const q1Stats = calculateStdDev(q1Values);
  const q2Stats = calculateStdDev(q2Values);
  const q3Stats = calculateStdDev(q3Values);
  const q4Stats = calculateStdDev(q4Values);
  
  const renewalBalance = {
    q1Variance: q1Stats.cv,
    q2Variance: q2Stats.cv,
    q3Variance: q3Stats.cv,
    q4Variance: q4Stats.cv,
    worstQuarterVariance: Math.max(q1Stats.cv, q2Stats.cv, q3Stats.cv, q4Stats.cv)
  };
  
  // Calculate composite scores (0-100)
  
  // Distribution score: inverse of average CV across metrics
  const avgCV = (arrStats.cv + creStats.cv + tier1Stats.cv + tier2Stats.cv) / 4;
  const distributionScore = Math.max(0, Math.min(100, 100 * (1 - avgCV / 0.5)));
  
  // Compliance score: weighted average of compliance rates
  const complianceScore = Math.round(
    (compliance.continuityRate * 0.4 +
     compliance.geographyMatchRate * 0.3 +
     compliance.strategicCompliance * 0.2 +
     compliance.parentChildAlignment * 0.1) * 100
  );
  
  // Risk score: inverse of CRE concentration
  const riskScore = Math.max(0, Math.min(100, 
    100 * (1 - repsOverCreLimit.length / normalReps.length) * (1 - creStats.cv)
  ));
  
  // Overall score: weighted composite
  const overallScore = Math.round(
    distributionScore * 0.40 +
    complianceScore * 0.35 +
    riskScore * 0.25
  );
  
  return {
    calculatedAt: new Date().toISOString(),
    buildId,
    phase,
    arrDistribution,
    creDistribution,
    tier1Distribution,
    tier2Distribution,
    compliance,
    renewalBalance,
    scores: {
      distributionScore: Math.round(distributionScore),
      complianceScore,
      riskScore: Math.round(riskScore),
      overallScore
    },
    warnings
  };
}

/**
 * Compare before and after metrics to quantify improvement
 */
export function compareQualityMetrics(
  before: AssignmentQualityMetrics,
  after: AssignmentQualityMetrics
): QualityComparison {
  
  const improvements: QualityComparison['improvements'] = [
    {
      metric: 'ARR CV',
      before: before.arrDistribution.coefficientOfVariation,
      after: after.arrDistribution.coefficientOfVariation,
      change: before.arrDistribution.coefficientOfVariation - after.arrDistribution.coefficientOfVariation,
      changePercent: ((before.arrDistribution.coefficientOfVariation - after.arrDistribution.coefficientOfVariation) / before.arrDistribution.coefficientOfVariation) * 100,
      improved: after.arrDistribution.coefficientOfVariation < before.arrDistribution.coefficientOfVariation
    },
    {
      metric: 'CRE CV',
      before: before.creDistribution.coefficientOfVariation,
      after: after.creDistribution.coefficientOfVariation,
      change: before.creDistribution.coefficientOfVariation - after.creDistribution.coefficientOfVariation,
      changePercent: ((before.creDistribution.coefficientOfVariation - after.creDistribution.coefficientOfVariation) / (before.creDistribution.coefficientOfVariation || 1)) * 100,
      improved: after.creDistribution.coefficientOfVariation < before.creDistribution.coefficientOfVariation
    },
    {
      metric: 'Distribution Score',
      before: before.scores.distributionScore,
      after: after.scores.distributionScore,
      change: after.scores.distributionScore - before.scores.distributionScore,
      changePercent: ((after.scores.distributionScore - before.scores.distributionScore) / (before.scores.distributionScore || 1)) * 100,
      improved: after.scores.distributionScore > before.scores.distributionScore
    },
    {
      metric: 'Compliance Score',
      before: before.scores.complianceScore,
      after: after.scores.complianceScore,
      change: after.scores.complianceScore - before.scores.complianceScore,
      changePercent: ((after.scores.complianceScore - before.scores.complianceScore) / (before.scores.complianceScore || 1)) * 100,
      improved: after.scores.complianceScore > before.scores.complianceScore
    },
    {
      metric: 'Overall Score',
      before: before.scores.overallScore,
      after: after.scores.overallScore,
      change: after.scores.overallScore - before.scores.overallScore,
      changePercent: ((after.scores.overallScore - before.scores.overallScore) / (before.scores.overallScore || 1)) * 100,
      improved: after.scores.overallScore > before.scores.overallScore
    }
  ];
  
  // Calculate overall improvement (-100 to +100)
  const improvementCount = improvements.filter(i => i.improved).length;
  const overallImprovement = Math.round(
    (improvementCount / improvements.length) * 100 - 50
  ) * 2;
  
  return {
    before,
    after,
    improvements,
    overallImprovement
  };
}

/**
 * Get a text summary of the quality metrics
 */
export function getQualitySummary(metrics: AssignmentQualityMetrics): string {
  const lines: string[] = [
    `📊 Assignment Quality Report (${metrics.phase.toUpperCase()})`,
    `Build: ${metrics.buildId}`,
    `Calculated: ${new Date(metrics.calculatedAt).toLocaleString()}`,
    '',
    '== SCORES ==',
    `Overall: ${metrics.scores.overallScore}/100`,
    `Distribution: ${metrics.scores.distributionScore}/100`,
    `Compliance: ${metrics.scores.complianceScore}/100`,
    `Risk: ${metrics.scores.riskScore}/100`,
    '',
    '== DISTRIBUTION ==',
    `ARR CV: ${(metrics.arrDistribution.coefficientOfVariation * 100).toFixed(1)}% (target < 15%)`,
    `ARR Range: $${(metrics.arrDistribution.min/1000000).toFixed(1)}M - $${(metrics.arrDistribution.max/1000000).toFixed(1)}M`,
    `CRE CV: ${(metrics.creDistribution.coefficientOfVariation * 100).toFixed(1)}%`,
    `Reps over CRE limit: ${metrics.creDistribution.repsOverLimit}`,
    '',
    '== COMPLIANCE ==',
    `Continuity: ${(metrics.compliance.continuityRate * 100).toFixed(1)}%`,
    `Geography Match: ${(metrics.compliance.geographyMatchRate * 100).toFixed(1)}%`,
  ];
  
  if (metrics.warnings.length > 0) {
    lines.push('', '== WARNINGS ==');
    metrics.warnings.forEach(w => {
      lines.push(`[${w.severity.toUpperCase()}] ${w.message}`);
    });
  }
  
  return lines.join('\n');
}
