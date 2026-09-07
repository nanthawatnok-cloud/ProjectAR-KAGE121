const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

require("./generate-assets-manifest");
if (process.exitCode) process.exit(process.exitCode);

const root = path.resolve(__dirname, "..");
const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".patt": "text/plain",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".mp4": "video/mp4",
    ".zip": "application/zip",
};

http.createServer((request, response) => {
    const requested = decodeURIComponent(request.url.split("?")[0]);
    const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) {
        response.writeHead(403).end("Forbidden");
        return;
    }

    fs.readFile(file, (error, data) => {
        if (error) {
            response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
            return;
        }
        response.writeHead(200, {
            "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-store",
        });
        response.end(data);
    });
}).listen(8080, "127.0.0.1", () => {
    console.log("AR server is ready: http://localhost:8080");
    console.log("Keep this window open. Press Ctrl+C to stop.");
    if (process.platform === "win32" && !process.env.AR_NO_OPEN) {
        execFile("cmd", ["/c", "start", "", "http://localhost:8080"]);
    }
});
