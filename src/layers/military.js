/**
 * Military Aircraft Filter Logic
 * Identifies military aircraft based on ICAO24 hex codes and callsign prefixes.
 * Pure function, no external dependencies.
 */

/**
 * Known military ICAO24 hex prefixes
 * These are allocated ranges for military aircraft by various nations.
 *
 * Reference: https://www.ads-b.nl/mil-icao.html
 */
const MILITARY_HEX_PREFIXES = [
  // United States Military
  'ae',     // US Air Force
  'af',     // US Air Force (continued range)
  // US Coast Guard
  'a8',     // USCG aircraft
  // UK Military
  '43c',    // UK Ministry of Defence
  // France Military
  '3a',     // French Air Force
  '3b',     // French Air Force (continued)
  // Germany Military
  '3f',     // German Air Force (Luftwaffe)
  // Canada Military
  'c0',     // Canadian Armed Forces
  // Australia Military
  '7c',     // Royal Australian Air Force
  // NATO / Allied
  '45',     // Reserved military
];

/**
 * Known military callsign prefixes
 * These are commonly used callsigns for military aircraft.
 */
const MILITARY_CALLSIGN_PREFIXES = [
  // US Air Force
  'RCH',    // Reach - Air Mobility Command strategic airlift
  'CNV',    // Convoy - C-17 formations
  'STEEL',  // Steel - Military transport
  'SHADY',  // Shady - KC-135/KC-10 tankers
  'LOBO',   // Lobo - Special operations
  'SPAR',   // SPAR - Special Air Mission (VIP transport)
  'SAM',    // Special Air Mission (Air Force One support)
  'EXEC',   // Executive flight
  'REACH',  // Reach variant
  'TITAN',  // Titan - Heavy airlift
  'BOXER',  // Boxer - Military transport
  'THUD',   // Thud - Fighter callsign
  'VIPER',  // Viper - F-16 callsign
  'EAGLE',  // Eagle - F-15 callsign
  'RAID',   // Raid - Strike missions
  'DUKE',   // Duke - Special ops
  'KING',   // King - Combat search and rescue
  'JOLLY',  // Jolly - HH-60 CSAR
  'PEDRO',  // Pedro - Pararescue
  'EVAC',   // Evac - Aeromedical evacuation
  'KNIFE',  // Knife - Special operations
  'JAKE',   // Jake - Military refueling
  'HAWK',   // Hawk - Training aircraft
  // US Navy
  'NAVY',   // Navy aircraft
  'CNY',    // Convoy Navy
  // US Marine Corps
  'MARINE', // Marine Corps
  // US Army
  'ARMY',   // Army aviation
  'PAT',    // Patriot - Army aviation
  // UK Royal Air Force
  'ASCOT',  // Ascot - RAF Transport
  'RRR',    // RAF callsign prefix
  // NATO
  'NATO',   // NATO AWACS/exercises
  // Generic military identifiers
  'MIL',    // Military generic
  'AFR',    // Air Force Reserve
  'ANG',    // Air National Guard
  'GUARD',  // Guard unit
];

/**
 * Known military aircraft type codes (ICAO type designators)
 */
const MILITARY_TYPE_CODES = [
  // Fighters
  'F15',    // F-15 Eagle
  'F16',    // F-16 Fighting Falcon
  'F18',    // F/A-18 Hornet
  'F22',    // F-22 Raptor
  'F35',    // F-35 Lightning II
  'FA18',   // F/A-18 Super Hornet
  'FA50',   // FA-50 Fighting Eagle
  'EUFI',   // Eurofighter Typhoon
  'RFAL',   // Rafale
  'T38',    // T-38 Talon
  // Bombers
  'B1',     // B-1 Lancer
  'B2',     // B-2 Spirit
  'B52',    // B-52 Stratofortress
  // Transport
  'C17',    // C-17 Globemaster III
  'C5',     // C-5 Galaxy
  'C130',   // C-130 Hercules
  'C5M',    // C-5M Super Galaxy
  'KC10',   // KC-10 Extender
  'KC35',   // KC-135 Stratotanker
  'KC46',   // KC-46 Pegasus
  'A400',   // A400M Atlas
  // Surveillance
  'E3',     // E-3 Sentry AWACS
  'E8',     // E-8 JSTARS
  'E6',     // E-6 Mercury
  'RC135',  // RC-135 Rivet Joint
  'U2',     // U-2 Dragon Lady
  'RQ4',    // RQ-4 Global Hawk
  'MQ9',    // MQ-9 Reaper
  'MQ1',    // MQ-1 Predator
  // Helicopters
  'H60',    // UH-60 Black Hawk
  'AH64',   // AH-64 Apache
  'CH47',   // CH-47 Chinook
  'V22',    // V-22 Osprey
  'MH60',   // MH-60 variants
  'UH60',   // UH-60 Black Hawk
];

/**
 * Check if an ICAO24 hex code matches known military ranges
 * @param {string|null|undefined} icao24 - ICAO 24-bit address (hex string)
 * @returns {boolean} true if military hex range
 */
function checkMilitaryHex(icao24) {
  if (!icao24 || typeof icao24 !== 'string') {
    return false;
  }

  const hex = icao24.toLowerCase().trim();
  if (!hex) {
    return false;
  }

  for (const prefix of MILITARY_HEX_PREFIXES) {
    if (hex.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a callsign matches known military patterns
 * @param {string|null|undefined} callsign - Aircraft callsign
 * @returns {boolean} true if military callsign pattern
 */
function checkMilitaryCallsign(callsign) {
  if (!callsign || typeof callsign !== 'string') {
    return false;
  }

  const cs = callsign.toUpperCase().trim();
  if (!cs) {
    return false;
  }

  for (const prefix of MILITARY_CALLSIGN_PREFIXES) {
    if (cs.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an aircraft type code is a known military type
 * @param {string|null|undefined} typeCode - ICAO aircraft type designator
 * @returns {boolean} true if military type code
 */
function checkMilitaryType(typeCode) {
  if (!typeCode || typeof typeCode !== 'string') {
    return false;
  }

  const type = typeCode.toUpperCase().trim();
  if (!type) {
    return false;
  }

  return MILITARY_TYPE_CODES.includes(type);
}

/**
 * Determine if an aircraft is military based on available data
 * Checks ICAO24 hex code, callsign, and optionally aircraft type.
 *
 * @param {Object} aircraft - Aircraft object with icao24, callsign, and optionally typeCode
 * @param {string} [aircraft.icao24] - ICAO 24-bit address (hex string)
 * @param {string} [aircraft.callsign] - Aircraft callsign
 * @param {string} [aircraft.typeCode] - ICAO aircraft type designator
 * @returns {boolean} true if aircraft appears to be military, false otherwise (never throws)
 */
export function isMilitary(aircraft) {
  // Handle null/undefined/invalid input gracefully
  if (!aircraft || typeof aircraft !== 'object') {
    return false;
  }

  // Check ICAO24 hex code against known military ranges
  if (checkMilitaryHex(aircraft.icao24)) {
    return true;
  }

  // Check callsign against known military patterns
  if (checkMilitaryCallsign(aircraft.callsign)) {
    return true;
  }

  // Check aircraft type code if available
  if (checkMilitaryType(aircraft.typeCode)) {
    return true;
  }

  return false;
}

// Export constants for testing and external use
export {
  MILITARY_HEX_PREFIXES,
  MILITARY_CALLSIGN_PREFIXES,
  MILITARY_TYPE_CODES,
  checkMilitaryHex,
  checkMilitaryCallsign,
  checkMilitaryType,
};
