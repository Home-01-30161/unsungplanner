import fs from "fs";
import readline from "readline";

const rl = readline.createInterface({
  input: fs.createReadStream("d:/unsungplanner/simplemaps_worldcities_basicv1.91.4/worldcities.csv"),
  crlfDelay: Infinity
});

let header = null;
const cities = [];

for await (const line of rl) {
  const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
  if (!matches) continue;
  const cols = matches.map(m => m.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, "\""));
  if (!header) {
    header = cols;
    continue;
  }
  // 1: city_ascii
  // 2: lat
  // 3: lng
  // 4: country
  // 5: iso2
  // 7: admin_name
  // 8: capital
  // 9: population
  const cityAscii = cols[1]?.trim();
  const lat = parseFloat(cols[2]);
  const lng = parseFloat(cols[3]);
  const country = cols[4]?.trim();
  const iso2 = cols[5]?.trim();
  const adminName = cols[7]?.trim();
  const capital = cols[8]?.trim() || "";
  const pop = parseInt(cols[9], 10) || 0;

  if (cityAscii && !isNaN(lat) && !isNaN(lng)) {
    // Compact tuple format: [cityAscii, adminName, country, iso2, lat, lng, pop, capital]
    cities.push([cityAscii, adminName, country, iso2, lat, lng, pop, capital]);
  }
}

// Sort once globally by population descending so top cities naturally rank higher in prefix/substring matches
cities.sort((a, b) => b[6] - a[6]);

const outPath = "d:/unsungplanner/src/data/cities.json";
fs.writeFileSync(outPath, JSON.stringify(cities));

const stat = fs.statSync(outPath);
console.log(`Generated ${cities.length} cities in ${outPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
