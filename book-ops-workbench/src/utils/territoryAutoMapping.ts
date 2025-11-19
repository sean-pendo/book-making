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
  
  // North East territories
  const northEastTerritories = ['BOSTON', 'NEW ENGLAND', 'NY E', 'NY S'];
  if (northEastTerritories.some(t => territoryUpper.includes(t))) {
    return 'North East';
  }
  
  // South East territories
  const southEastTerritories = ['CHESAPEAKE', 'MID-ATLANTIC', 'SOUTH EAST', 'GULF COAST', 'AUSTIN – HOUSTON', 'AUSTIN - HOUSTON'];
  if (southEastTerritories.some(t => territoryUpper.includes(t))) {
    return 'South East';
  }
  
  // Central territories
  const centralTerritories = [
    'CHICAGO', 'GREAT LAKES N-CA', 'GREAT LAKES N-US', 'GREAT LAKES S', 
    'GREATER ONTARIO-CA', 'MID-WEST', 'MOUNTAIN', 'SOUTHWEST'
  ];
  if (centralTerritories.some(t => territoryUpper.includes(t))) {
    return 'Central';
  }
  
  // West territories
  const westTerritories = [
    'LOS ANGELES', 'NOR CAL', 'PAC NW-CA', 'PAC NW-US', 
    'SAN FRANCISCO', 'SO CAL'
  ];
  if (westTerritories.some(t => territoryUpper.includes(t))) {
    return 'West';
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