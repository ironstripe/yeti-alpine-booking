/**
 * PLZ (postal code) to city lookup for Switzerland, Liechtenstein, Austria, and Germany
 */

interface PlzEntry {
  city: string;
  country: string;
}

const PLZ_DATABASE: Record<string, PlzEntry> = {
  // Liechtenstein
  "9485": { city: "Nendeln", country: "LI" },
  "9486": { city: "Schaanwald", country: "LI" },
  "9487": { city: "Gamprin-Bendern", country: "LI" },
  "9488": { city: "Schellenberg", country: "LI" },
  "9489": { city: "Schaan", country: "LI" },
  "9490": { city: "Vaduz", country: "LI" },
  "9491": { city: "Ruggell", country: "LI" },
  "9492": { city: "Eschen", country: "LI" },
  "9493": { city: "Mauren", country: "LI" },
  "9494": { city: "Schaan", country: "LI" },
  "9495": { city: "Triesen", country: "LI" },
  "9496": { city: "Balzers", country: "LI" },
  "9497": { city: "Triesenberg", country: "LI" },
  "9498": { city: "Planken", country: "LI" },

  // Switzerland - Major cities
  "8001": { city: "Zürich", country: "CH" },
  "8002": { city: "Zürich", country: "CH" },
  "8003": { city: "Zürich", country: "CH" },
  "8004": { city: "Zürich", country: "CH" },
  "8005": { city: "Zürich", country: "CH" },
  "3000": { city: "Bern", country: "CH" },
  "3001": { city: "Bern", country: "CH" },
  "4000": { city: "Basel", country: "CH" },
  "4001": { city: "Basel", country: "CH" },
  "1200": { city: "Genève", country: "CH" },
  "1201": { city: "Genève", country: "CH" },
  "6900": { city: "Lugano", country: "CH" },
  "9000": { city: "St. Gallen", country: "CH" },
  "7000": { city: "Chur", country: "CH" },
  "7500": { city: "St. Moritz", country: "CH" },
  "7270": { city: "Davos", country: "CH" },
  "3920": { city: "Zermatt", country: "CH" },
  "6390": { city: "Engelberg", country: "CH" },
  "3800": { city: "Interlaken", country: "CH" },
  "6460": { city: "Altdorf", country: "CH" },

  // Austria - Nearby
  "6800": { city: "Feldkirch", country: "AT" },
  "6850": { city: "Dornbirn", country: "AT" },
  "6901": { city: "Bregenz", country: "AT" },

  // Germany - Nearby
  "88131": { city: "Lindau", country: "DE" },
  "78462": { city: "Konstanz", country: "DE" },
};

export function lookupPlz(plz: string): PlzEntry | null {
  return PLZ_DATABASE[plz] || null;
}

export function getCountryName(code: string): string {
  const countries: Record<string, string> = {
    LI: "Liechtenstein",
    CH: "Schweiz",
    AT: "Österreich",
    DE: "Deutschland",
  };
  return countries[code] || code;
}
