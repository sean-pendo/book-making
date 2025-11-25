/**
 * Utility functions for automatically mapping sales territories to US regions
 */

export interface TerritoryInfo {
  territory: string;
  account_count: number;
}

/**
 * Auto-map a sales territory to a US region using exact territory name matching
 */
export function autoMapTerritoryToRegion(territory: string): string | null {
  const territoryUpper = territory.toUpperCase().trim();
  const normalizedTokens = territoryUpper.replace(/[^A-Z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
  const tokenSet = new Set(normalizedTokens);

  type RegionName = 'North East' | 'South East' | 'Central' | 'West';

  interface RegionConfig {
    states: string[];
    cities: string[];
    keywords: string[];
  }

  const REGION_CONFIG: Record<RegionName, RegionConfig> = {
    'North East': {
      states: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE'],
      cities: ['BOSTON', 'NEW YORK', 'PHILADELPHIA', 'BUFFALO', 'PITTSBURGH', 'TORONTO', 'MONTREAL', 'QUEBEC', 'OTTAWA'],
      keywords: ['NEW ENGLAND', 'QUEBEC', 'ONTARIO', 'TRI-STATE']
    },
    'South East': {
      states: ['MD', 'DC', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'AL', 'MS', 'LA', 'AR', 'TN', 'KY', 'TX', 'OK'],
      cities: ['ATLANTA', 'MIAMI', 'ORLANDO', 'CHARLOTTE', 'RALEIGH', 'NASHVILLE', 'NEW ORLEANS', 'BIRMINGHAM', 'DALLAS', 'AUSTIN', 'HOUSTON', 'SAN ANTONIO', 'TAMPA'],
      keywords: ['SOUTH EAST', 'SOUTHEAST', 'GULF COAST', 'MID-ATLANTIC', 'AUSTIN – HOUSTON', 'AUSTIN - HOUSTON', 'CHESAPEAKE']
    },
    'Central': {
      states: ['ND', 'SD', 'NE', 'KS', 'MO', 'IA', 'MN', 'WI', 'IL', 'IN', 'OH', 'MI', 'CO', 'WY', 'MT', 'NM', 'ID'],
      cities: ['CHICAGO', 'MINNEAPOLIS', 'ST LOUIS', 'KANSAS CITY', 'CLEVELAND', 'COLUMBUS', 'DETROIT', 'DENVER', 'CALGARY', 'EDMONTON'],
      keywords: ['GREAT LAKES', 'MIDWEST', 'MOUNTAIN', 'SOUTHWEST', 'ALBERTA']
    },
    'West': {
      states: ['WA', 'OR', 'CA', 'NV', 'UT', 'AZ', 'AK', 'HI'],
      cities: ['SEATTLE', 'PORTLAND', 'SAN FRANCISCO', 'SAN DIEGO', 'LOS ANGELES', 'SACRAMENTO', 'LAS VEGAS', 'PHOENIX', 'TUCSON', 'SALT LAKE CITY', 'VANCOUVER'],
      keywords: ['NOR CAL', 'SO CAL', 'PAC NW', 'PACIFIC NORTHWEST', 'BRITISH COLUMBIA']
    }
  };

  const matchesConfig = (config: RegionConfig): boolean => {
    const hasState = config.states.some(state => tokenSet.has(state));
    const hasCity = config.cities.some(city => territoryUpper.includes(city));
    const hasKeyword = config.keywords.some(keyword => territoryUpper.includes(keyword));
    return hasState || hasCity || hasKeyword;
  };

  for (const [regionName, config] of Object.entries(REGION_CONFIG) as [RegionName, RegionConfig][]) {
    if (matchesConfig(config)) {
      return regionName;
    }
  }
  
  // Other (International) territories
  const internationalTerritories = [
    'AUSTRALIA', 'BENELUX', 'CHINA', 'DACH', 'FRANCE', 'ISRAEL', 'JAPAN', 
    'LATAM', 'MIDDLE EAST', 'NEW ZEALAND', 'NZ', 'NORDICS', 'RO-APAC', 
    'RO-EMEA', 'SINGAPORE', 'UKI'
  ];
  if (internationalTerritories.some(t => territoryUpper.includes(t))) {
    return 'Other';
  }
  
  return null; // No match found
}

/**
 * Auto-map multiple territories to regions, returning the mappings and statistics
 */
export function autoMapTerritories(territories: TerritoryInfo[]) {
  const mappings: Record<string, string> = {};
  const stats = {
    mapped: 0,
    unmapped: 0,
    mappedAccounts: 0,
    unmappedAccounts: 0,
    byRegion: {
      West: { territories: 0, accounts: 0 },
      'North East': { territories: 0, accounts: 0 },
      'South East': { territories: 0, accounts: 0 },
      Central: { territories: 0, accounts: 0 },
      Other: { territories: 0, accounts: 0 }
    }
  };
  
  territories.forEach(territory => {
    const region = autoMapTerritoryToRegion(territory.territory);
    
    if (region) {
      mappings[territory.territory] = region;
      stats.mapped++;
      stats.mappedAccounts += territory.account_count;
      stats.byRegion[region as keyof typeof stats.byRegion].territories++;
      stats.byRegion[region as keyof typeof stats.byRegion].accounts += territory.account_count;
    } else {
      stats.unmapped++;
      stats.unmappedAccounts += territory.account_count;
    }
  });
  
  return { mappings, stats };
}