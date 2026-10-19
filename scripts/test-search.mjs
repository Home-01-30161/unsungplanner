import cities from "../src/data/cities.json" with { type: "json" };

function searchCities(query, countryQuery = "", max = 8) {
  const q = query.trim().toLowerCase();
  const cQ = countryQuery.trim().toLowerCase();
  if (q.length < 2) return [];

  const matches = [];

  for (const c of cities) {
    const [city, admin, country, iso2, lat, lng, pop, capital] = c;

    // Filter by country if specified
    if (cQ) {
      const matchCountry = country.toLowerCase().includes(cQ) || iso2.toLowerCase() === cQ;
      if (!matchCountry) continue;
    }

    const cityLower = city.toLowerCase();
    const adminLower = admin.toLowerCase();

    // Check matches
    const exactCity = cityLower === q;
    const cityStartsWith = cityLower.startsWith(q);
    const cityIncludes = cityLower.includes(q);
    const adminExact = adminLower === q;
    const adminStartsWith = adminLower.startsWith(q);
    const adminIncludes = adminLower.includes(q);

    if (exactCity || cityStartsWith || cityIncludes || adminExact || adminStartsWith || adminIncludes) {
      let score = 0;
      if (exactCity) score += 1000;
      else if (cityStartsWith) score += 500;
      else if (cityIncludes) score += 100;

      if (adminExact) {
        score += 800;
        if (capital === "admin" || capital === "primary") score += 300; // Prefer capital of the prefecture
      } else if (adminStartsWith) {
        score += 300;
      } else if (adminIncludes) {
        score += 50;
      }

      // Bonus for capitals & population
      if (capital === "primary") score += 200;
      if (capital === "admin") score += 100;
      score += Math.log10(pop + 1) * 20;

      matches.push({
        name: city,
        admin1: admin,
        country,
        countryCode: iso2,
        lat,
        lng,
        pop,
        capital,
        score,
        label: admin && admin !== city ? `${city}, ${admin}, ${country}` : `${city}, ${country}`
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, max);
}

console.log("=== Query: 'Aichi' (no country) ===");
console.log(searchCities("Aichi").map(m => `[${m.score.toFixed(0)}] ${m.label} (pop: ${m.pop})`));

console.log("\n=== Query: 'Aichi' (country: 'Japan') ===");
console.log(searchCities("Aichi", "Japan").map(m => `[${m.score.toFixed(0)}] ${m.label} (pop: ${m.pop})`));

console.log("\n=== Query: 'Bang' (no country) ===");
console.log(searchCities("Bang").map(m => `[${m.score.toFixed(0)}] ${m.label} (pop: ${m.pop})`));

console.log("\n=== Query: 'Osaka' (no country) ===");
console.log(searchCities("Osaka").map(m => `[${m.score.toFixed(0)}] ${m.label} (pop: ${m.pop})`));
