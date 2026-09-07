(() => {
    "use strict";
    const assetLibrary = document.getElementById("asset-library");
    const scene = document.getElementById("scene");
    const status = document.getElementById("status");
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
            element.muted = true;
            element.playsInline = true;
        }

        if (!element) return null;
        element.id = id;
        element.src = getExtension(asset.file) === ".zip"
            ? await getZipModelUrl(asset.file)
            : `assets/${encodeURIComponent(asset.file)}`;
        assetLibrary.appendChild(element);
        return { kind, id, element };
    }

    function preserveAspectRatio(media, source, fallback) {
        const update = () => {
            const width = source.naturalWidth || source.videoWidth;
            const height = source.naturalHeight || source.videoHeight;
            media.setAttribute("height", String(width && height ? height / width : fallback));
        };
        update();
        source.addEventListener("load", update, { once: true });
        source.addEventListener("loadedmetadata", update, { once: true });
    }

    function createMarker(asset, loadedAsset) {
        const marker = document.createElement("a-marker");
        marker.id = `marker-${asset.number}`;
        marker.setAttribute("type", "pattern");
        marker.setAttribute("preset", "custom");
        marker.setAttribute("url", `assets/${encodeURIComponent(asset.marker)}`);
        marker.setAttribute("emitevents", "true");

        const content = document.createElement("a-entity");
        content.classList.add("clickable");
        content.setAttribute("ar-manipulable", "");

        let media;
        if (loadedAsset.kind === "model") {
            media = document.createElement("a-entity");
            media.setAttribute("gltf-model", `#${loadedAsset.id}`);
            media.setAttribute("animation-mixer", "clip: *; loop: repeat");
            media.setAttribute("fit-model", "size: 1");
        } else if (loadedAsset.kind === "image") {
            media = document.createElement("a-image");
            media.setAttribute("src", `#${loadedAsset.id}`);
            media.setAttribute("width", "1");
            media.setAttribute("height", "1");
            media.setAttribute("rotation", "-90 0 0");
            media.setAttribute("position", "0 0.01 0");
            preserveAspectRatio(media, loadedAsset.element, 1);
        } else {
            media = document.createElement("a-video");
            media.setAttribute("src", `#${loadedAsset.id}`);
            media.setAttribute("width", "1");
            media.setAttribute("height", "0.5625");
            media.setAttribute("rotation", "-90 0 0");
            media.setAttribute("position", "0 0.01 0");
            preserveAspectRatio(media, loadedAsset.element, 0.5625);
        }

        content.appendChild(media);
        marker.appendChild(content);
        scene.insertBefore(marker, scene.querySelector("[camera]"));
    }

    async function loadAssets() {
        const response = await fetch("assets/manifest.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`Cannot load assets/manifest.json (${response.status})`);

        const manifest = await response.json();
        if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
            throw new Error("ไม่พบคู่ไฟล์ asset และ marker ใน manifest.json");
        }
        await Promise.all(manifest.assets.map(async (asset) => {
            const loadedAsset = await createAssetElement(asset);
            if (loadedAsset && asset.marker) createMarker(asset, loadedAsset);
        }));

        scene.emit("assets-loaded");
        status.textContent = `พร้อมใช้งาน ${manifest.assets.length} marker — แตะแล้วลาก หรือใช้ 2 นิ้วย่อ/ขยาย/หมุน`;
        status.className = "ready";
    }

    loadAssets().catch((error) => {
        console.error("AR asset loader:", error);
        status.textContent = `เปิด AR ไม่สำเร็จ: ${error.message}`;
        status.className = "error";
        scene.emit("assets-load-error", { error });
    });
})();
