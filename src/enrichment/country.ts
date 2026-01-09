/**
 * Standardize country names to use common abbreviations for US/UK,
 * otherwise use full country names.
 */

const COUNTRY_STANDARDIZATION: Record<string, string> = {
  // United States variations
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "us": "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "america": "US",
  
  // United Kingdom variations
  "united kingdom": "UK",
  "great britain": "UK",
  "britain": "UK",
  "uk": "UK",
  "u.k.": "UK",
  "gb": "UK",
  "england": "UK",
  "scotland": "UK",
  "wales": "UK",
  "northern ireland": "UK",
  
  // Common countries that should use full names
  "china": "China",
  "cn": "China",
  "prc": "China",
  "people's republic of china": "China",
  
  "japan": "Japan",
  "jp": "Japan",
  
  "taiwan": "Taiwan",
  "tw": "Taiwan",
  "republic of china": "Taiwan",
  
  "india": "India",
  "in": "India",
  
  "germany": "Germany",
  "de": "Germany",
  "deutschland": "Germany",
  
  "france": "France",
  "fr": "France",
  
  "canada": "Canada",
  "ca": "Canada",
  
  "australia": "Australia",
  "au": "Australia",
  
  "brazil": "Brazil",
  "br": "Brazil",
  "brasil": "Brazil",
  
  "russia": "Russia",
  "ru": "Russia",
  "russian federation": "Russia",
  
  "south korea": "South Korea",
  "korea": "South Korea",
  "kr": "South Korea",
  "republic of korea": "South Korea",
  
  "singapore": "Singapore",
  "sg": "Singapore",
  
  "netherlands": "Netherlands",
  "nl": "Netherlands",
  "holland": "Netherlands",
  
  "spain": "Spain",
  "es": "Spain",
  "españa": "Spain",
  
  "italy": "Italy",
  "it": "Italy",
  "italia": "Italy",
  
  "poland": "Poland",
  "pl": "Poland",
  "polska": "Poland",
  
  "sweden": "Sweden",
  "se": "Sweden",
  "sverige": "Sweden",
  
  "switzerland": "Switzerland",
  "ch": "Switzerland",
  
  "israel": "Israel",
  "il": "Israel",
  
  "mexico": "Mexico",
  "mx": "Mexico",
  "méxico": "Mexico",
  
  "argentina": "Argentina",
  "ar": "Argentina",
  
  "turkey": "Turkey",
  "türkiye": "Turkey",
  "tr": "Turkey",
  
  "ukraine": "Ukraine",
  "ua": "Ukraine",
  
  "indonesia": "Indonesia",
  "id": "Indonesia",
  
  "vietnam": "Vietnam",
  "vn": "Vietnam",
  
  "thailand": "Thailand",
  "th": "Thailand",
  
  "philippines": "Philippines",
  "ph": "Philippines",
  
  "malaysia": "Malaysia",
  "my": "Malaysia",
  
  "pakistan": "Pakistan",
  "pk": "Pakistan",
  
  "bangladesh": "Bangladesh",
  "bd": "Bangladesh",
  
  "egypt": "Egypt",
  "eg": "Egypt",
  
  "nigeria": "Nigeria",
  "ng": "Nigeria",
  
  "south africa": "South Africa",
  "za": "South Africa",
  
  "new zealand": "New Zealand",
  "nz": "New Zealand",
  
  "ireland": "Ireland",
  "ie": "Ireland",
  
  "belgium": "Belgium",
  "be": "Belgium",
  
  "austria": "Austria",
  "at": "Austria",
  
  "denmark": "Denmark",
  "dk": "Denmark",
  
  "norway": "Norway",
  "no": "Norway",
  
  "finland": "Finland",
  "fi": "Finland",
  
  "portugal": "Portugal",
  "pt": "Portugal",
  
  "greece": "Greece",
  "gr": "Greece",
  
  "czech republic": "Czech Republic",
  "czechia": "Czech Republic",
  "cz": "Czech Republic",
  
  "romania": "Romania",
  "ro": "Romania",
  
  "hungary": "Hungary",
  "hu": "Hungary",
};

/**
 * Standardize a country name to the canonical format.
 * Returns null if the input is null/undefined/empty.
 */
export function standardizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  
  const normalized = country.trim().toLowerCase();
  if (!normalized) return null;
  
  // Check if we have a standardized version
  const standardized = COUNTRY_STANDARDIZATION[normalized];
  if (standardized) return standardized;
  
  // If not in our map, capitalize each word and return as-is
  return country
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
