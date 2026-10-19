import fs from "fs";
import readline from "readline";

const rl = readline.createInterface({
  input: fs.createReadStream("d:/unsungplanner/simplemaps_worldcities_basicv1.91.4/worldcities.csv"),
  crlfDelay: Infinity
});

let header = null;
let count = 0;
let aichiMatches = [];

for await (const line of rl) {
  // basic csv split handling quotes
  const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
  if (!matches) continue;
  const cols = matches.map(m => m.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, "\""));
  if (!header) {
    header = cols;
    continue;
  }
  count++;
  // cols: 0:city, 1:city_ascii, 2:lat, 3:lng, 4:country, 5:iso2, 6:iso3, 7:admin_name, 8:capital, 9:population, 10:id
  if (cols[4] === "Japan" && (cols[7] === "Aichi" || cols[1] === "Nagoya")) {
    aichiMatches.push({
      city: cols[1],
      admin: cols[7],
      country: cols[4],
      pop: Number(cols[9]) || 0,
      capital: cols[8],
      lat: Number(cols[2]),
      lng: Number(cols[3])
    });
  }
}

console.log("Total rows:", count);
console.log("Aichi matches count:", aichiMatches.length);
aichiMatches.sort((a, b) => b.pop - a.pop);
console.log("Top 5 Aichi matches:", aichiMatches.slice(0, 5));
