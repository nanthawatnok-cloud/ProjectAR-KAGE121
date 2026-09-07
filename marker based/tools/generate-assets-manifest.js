const fs = require("fs");
const path = require("path");

const assetsDirectory = path.resolve(__dirname, "../assets");
const outputFile = path.join(assetsDirectory, "manifest.json");
const assetPattern = /^asset(\d+)\.(gltf|glb|zip|jpg|jpeg|png|gif|mp4)$/i;
const markerPattern = /^marker(\d+)\.patt$/i;

const files = fs.readdirSync(assetsDirectory);
const markers = new Map();
const assets = [];
const warnings = [];

for (const file of files) {
    const markerMatch = file.match(markerPattern);
    if (markerMatch) {
        const number = Number(markerMatch[1]);
        if (markers.has(number)) warnings.push(`Duplicate marker number ${number}: ${file}`);
        markers.set(number, file);
    }
}

for (const file of files) {
    const assetMatch = file.match(assetPattern);
    if (!assetMatch) continue;

    const number = Number(assetMatch[1]);
    if (!markers.has(number)) {
        warnings.push(`Missing marker${number}.patt for ${file}`);
        continue;
    }
    if (assets.some((asset) => asset.number === number)) {
        warnings.push(`Duplicate asset number ${number}: ${file}`);
        continue;
    }
    assets.push({
        number,
        file,
        marker: markers.get(number),
    });
}

assets.sort((left, right) => left.number - right.number);
fs.writeFileSync(outputFile, `${JSON.stringify({ assets }, null, 2)}\n`);
console.log(`Generated ${path.relative(process.cwd(), outputFile)} with ${assets.length} asset(s).`);
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (assets.length === 0) {
    console.error("No valid pairs found. Use names such as asset1.png + marker1.patt.");
    process.exitCode = 1;
}
