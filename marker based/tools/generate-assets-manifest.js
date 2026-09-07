const fs = require("fs");
const path = require("path");

const assetsDirectory = path.resolve(__dirname, "../assets");
const outputFile = path.join(assetsDirectory, "manifest.json");
const assetPattern = /^asset(\d+)\.(gltf|glb|zip|jpg|jpeg|png|gif|mp4)$/i;
const markerPattern = /^marker(\d+)\.patt$/i;

const files = fs.readdirSync(assetsDirectory);
const markers = new Map();
const assets = [];

for (const file of files) {
    const markerMatch = file.match(markerPattern);
    if (markerMatch) markers.set(Number(markerMatch[1]), file);
}

for (const file of files) {
    const assetMatch = file.match(assetPattern);
    if (!assetMatch) continue;

    const number = Number(assetMatch[1]);
    assets.push({
        number,
        file,
        marker: markers.get(number) || null,
    });
}

assets.sort((left, right) => left.number - right.number);
fs.writeFileSync(outputFile, `${JSON.stringify({ assets }, null, 2)}\n`);
console.log(`Generated ${path.relative(process.cwd(), outputFile)} with ${assets.length} asset(s).`);