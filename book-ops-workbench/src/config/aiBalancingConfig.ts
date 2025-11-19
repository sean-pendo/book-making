export interface BalancingGoals {
  arrBalance: {
    priority: number; // 1-10, 10 being highest
    minARR: number;
    maxARR: number;
    targetVariance: number; // percentage
  };
  atrBalance: {
    priority: number;
    targetVariance: number; // percentage
  };
  customerCountBalance: {
    priority: number;
    maxDeviation: number; // number of accounts
  };
  riskDistribution: {
    priority: number;
    maxCREPerRep: number;
  };
  renewalTiming: {
    priority: number;
    targetQuarterlyVariance: number; // percentage
  };
  tierMix: {
    priority: number;
    enterpriseCommercialRatio: number; // 0-1, e.g., 0.6 = 60% enterprise
  };
}

export interface BalancingConstraints {
  mustStayInRegion: boolean;
  maintainContinuity: boolean; // Don't move accounts owned >90 days
  maxMovesPerRep: number;
  maxTotalMoves: number;
}

export const DEFAULT_BALANCING_GOALS: BalancingGoals = {
  arrBalance: {
    priority: 10,
    minARR: 1000000, // $1M
    maxARR: 3000000, // $3M
    targetVariance: 15 // 15% variance acceptable
  },
  atrBalance: {
    priority: 6,
    targetVariance: 20 // 20% variance acceptable
  },
  customerCountBalance: {
    priority: 8,
    maxDeviation: 5 // Within ±5 accounts
  },
  riskDistribution: {
    priority: 7,
    maxCREPerRep: 3 // Max 3 high-risk accounts per rep
  },
  renewalTiming: {
    priority: 5,
    targetQuarterlyVariance: 15 // 15% variance per quarter acceptable
  },
  tierMix: {
    priority: 4,
    enterpriseCommercialRatio: 0.6 // 60% enterprise, 40% commercial
  }
};

export const DEFAULT_BALANCING_CONSTRAINTS: BalancingConstraints = {
  mustStayInRegion: true,
  maintainContinuity: true,
  maxMovesPerRep: 5,
  maxTotalMoves: 20
};
