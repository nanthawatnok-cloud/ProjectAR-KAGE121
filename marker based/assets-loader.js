(() => {
    const assetLibrary = document.getElementById("asset-library");
    const scene = document.getElementById("scene");
    const supportedModels = [".gltf", ".glb", ".zip"];
    const supportedImages = [".jpg", ".jpeg", ".png", ".gif"];
    const supportedVideos = [".mp4"];

    function getExtension(fileName) {
        return fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
    }

    function getAssetKind(fileName) {
        const extension = getExtension(fileName);
        if (supportedModels.includes(extension)) return "model";
        if (supportedImages.includes(extension)) return "image";
        if (supportedVideos.includes(extension)) return "video";
        return null;
    }

    async function getZipModelUrl(fileName) {
        if (!window.JSZip) throw new Error("JSZip is not available");

        const response = await fetch(`assets/${encodeURIComponent(fileName)}`);
        const zip = await window.JSZip.loadAsync(await response.arrayBuffer());
        const entries = Object.values(zip.files).filter((entry) => !entry.dir);
        const modelEntry = entries.find((entry) => /\.(glb|gltf)$/i.test(entry.name));
        if (!modelEntry) throw new Error(`${fileName} does not contain a .glb or .gltf file`);

        if (/\.glb$/i.test(modelEntry.name)) {
            return URL.createObjectURL(await modelEntry.async("blob"));
        }

        const model = JSON.parse(await modelEntry.async("text"));
        const modelDirectory = modelEntry.name.includes("/")
            ? modelEntry.name.slice(0, modelEntry.name.lastIndexOf("/") + 1)
            : "";
        const referencedFiles = [...(model.buffers || []), ...(model.images || [])];
        for (const reference of referencedFiles) {
            if (!reference.uri || reference.uri.startsWith("data:")) continue;
            const entry = zip.files[modelDirectory + reference.uri] || entries.find((item) => item.name.endsWith(`/${reference.uri}`));
            if (!entry) throw new Error(`${fileName} is missing ${reference.uri}`);
            reference.uri = URL.createObjectURL(await entry.async("blob"));
        }

        return URL.createObjectURL(new Blob([JSON.stringify(model)], { type: "model/gltf+json" }));
    }

    async function createAssetElement(asset) {
        const kind = getAssetKind(asset.file);
        const id = `asset-${asset.number}`;
        let element;

        if (kind === "model") {
            element = document.createElement("a-asset-item");
        } else if (kind === "image") {
            element = document.createElement("img");
        } else if (kind === "video") {
            element = document.createElement("video");
            element.setAttribute("autoplay", "true");
            element.setAttribute("loop", "true");
            element.setAttribute("muted", "true");
            element.setAttribute("playsinline", "true");
        }

        if (!element) return null;
        element.id = id;
        element.src = getExtension(asset.file) === ".zip"
            ? await getZipModelUrl(asset.file)
            : `assets/${encodeURIComponent(asset.file)}`;
        assetLibrary.appendChild(element);
        return { kind, id };
    }

    function createMarker(asset, loadedAsset) {
        const marker = document.createElement("a-marker");
        marker.id = `marker-${asset.number}`;
        marker.setAttribute("type", "pattern");
        marker.setAttribute("preset", "custom");
        marker.setAttribute("url", `assets/${encodeURIComponent(asset.marker)}`);
        marker.setAttribute("raycaster", "objects: .clickable");
        marker.setAttribute("emitevents", "true");
        marker.setAttribute("cursor", "fuse: false; rayOrigin: mouse;");

        let content;
        if (loadedAsset.kind === "model") {
            content = document.createElement("a-entity");
            content.setAttribute("gltf-model", `#${loadedAsset.id}`);
            content.setAttribute("animation-mixer", "loop: repeat");
            content.setAttribute("scale", "0.5800801371315691 0.5800801371315691 0.5800801371315691");
            content.setAttribute("gesture-handler", "");
        } else if (loadedAsset.kind === "image") {
            content = document.createElement("a-image");
            content.setAttribute("src", `#${loadedAsset.id}`);
            content.setAttribute("width", "1");
            content.setAttribute("height", "1");
        } else {
            content = document.createElement("a-video");
            content.setAttribute("src", `#${loadedAsset.id}`);
            content.setAttribute("width", "1");
            content.setAttribute("height", "0.5625");
            content.setAttribute("autoplay", "true");
            content.setAttribute("loop", "true");
            content.setAttribute("muted", "true");
        }

        content.classList.add("clickable");
        marker.appendChild(content);
        scene.insertBefore(marker, scene.querySelector("[camera]"));
    }

    async function loadAssets() {
        const response = await fetch("assets/manifest.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`Cannot load assets/manifest.json (${response.status})`);

        const manifest = await response.json();
        await Promise.all(manifest.assets.map(async (asset) => {
            const loadedAsset = await createAssetElement(asset);
            if (loadedAsset && asset.marker) createMarker(asset, loadedAsset);
        }));

        scene.emit("assets-loaded");
    }

    loadAssets().catch((error) => {
        console.error("AR asset loader:", error);
        scene.emit("assets-load-error", { error });
    });
})();