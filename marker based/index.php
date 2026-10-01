<?php
declare(strict_types=1);

// Maximum width or height of images/videos in A-Frame world units.
const MAX_MEDIA_SIZE = 4;

const ASSET_RULES = [
    'glb'  => ['type' => 'model', 'max' => 50 * 1024 * 1024],
    'gltf' => ['type' => 'model', 'max' => 50 * 1024 * 1024],
    'zip'  => ['type' => 'archive', 'max' => 50 * 1024 * 1024],
    'jpg'  => ['type' => 'image', 'max' => 15 * 1024 * 1024],
    'jpeg' => ['type' => 'image', 'max' => 15 * 1024 * 1024],
    'png'  => ['type' => 'image', 'max' => 15 * 1024 * 1024],
    'gif'  => ['type' => 'image', 'max' => 15 * 1024 * 1024],
    'mp4'  => ['type' => 'video', 'max' => 25 * 1024 * 1024],
];

function assetUrl(string $relativePath): string
{
    return implode('/', array_map('rawurlencode', explode('/', str_replace('\\', '/', $relativePath))));
}

/** Extract a ZIP package and return the first GLB/GLTF model inside it. */
function modelFromZip(string $zipPath, int $assetNumber, string &$error): ?string
{
    if (!class_exists('ZipArchive')) {
        $error = "asset{$assetNumber}.zip requires the PHP ZipArchive extension";
        return null;
    }

    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        $error = "Cannot open asset{$assetNumber}.zip";
        return null;
    }

    $safeFiles = [];
    $models = [];
    $uncompressedSize = 0;
    $allowedContents = ['glb', 'gltf', 'bin', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'ktx', 'ktx2'];

    if ($zip->numFiles > 500) {
        $zip->close();
        $error = "asset{$assetNumber}.zip contains too many files";
        return null;
    }

    for ($index = 0; $index < $zip->numFiles; $index++) {
        $stat = $zip->statIndex($index);
        if ($stat === false) {
            continue;
        }

        $name = str_replace('\\', '/', $stat['name']);
        $parts = explode('/', trim($name, '/'));
        $isUnsafe = $name === ''
            || substr($name, 0, 1) === '/'
            || preg_match('/^[A-Za-z]:\//', $name)
            || in_array('..', $parts, true)
            || strpos($name, "\0") !== false;

        if ($isUnsafe) {
            $zip->close();
            $error = "asset{$assetNumber}.zip contains an unsafe path";
            return null;
        }
        if (substr($name, -1) === '/') {
            continue;
        }

        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($extension, $allowedContents, true)) {
            continue;
        }

        $uncompressedSize += (int) $stat['size'];
        if ($uncompressedSize > 200 * 1024 * 1024) {
            $zip->close();
            $error = "asset{$assetNumber}.zip is too large after extraction";
            return null;
        }

        $safeFiles[] = $name;
        if ($extension === 'glb' || $extension === 'gltf') {
            $models[] = $name;
        }
    }

    if ($models === []) {
        $zip->close();
        $error = "asset{$assetNumber}.zip does not contain a .glb or .gltf file";
        return null;
    }

    usort($models, static fn(string $a, string $b): int => substr_count($a, '/') <=> substr_count($b, '/'));
    $cacheName = 'asset' . $assetNumber . '-' . substr(sha1_file($zipPath) ?: '', 0, 12);
    $cacheDirectory = __DIR__ . '/assets/.asset-cache/' . $cacheName;

    if (!is_dir($cacheDirectory) && !mkdir($cacheDirectory, 0755, true) && !is_dir($cacheDirectory)) {
        $zip->close();
        $error = 'Cannot create assets/.asset-cache; please allow PHP to write to this folder';
        return null;
    }

    if (!$zip->extractTo($cacheDirectory, $safeFiles)) {
        $zip->close();
        $error = "Cannot extract asset{$assetNumber}.zip";
        return null;
    }

    $zip->close();
    return 'assets/.asset-cache/' . $cacheName . '/' . $models[0];
}

function findAsset(int $assetNumber, string &$error): ?array
{
    $assetDirectory = __DIR__ . '/assets';
    $expectedName = 'asset' . $assetNumber;
    $matches = [];

    foreach (new DirectoryIterator($assetDirectory) as $file) {
        if (!$file->isFile() || strcasecmp($file->getBasename('.' . $file->getExtension()), $expectedName) !== 0) {
            continue;
        }

        $extension = strtolower($file->getExtension());
        if (isset(ASSET_RULES[$extension])) {
            $matches[$extension] = $file->getPathname();
        }
    }

    // A number should normally have one asset. This order keeps duplicate handling deterministic.
    foreach (array_keys(ASSET_RULES) as $extension) {
        if (!isset($matches[$extension])) {
            continue;
        }

        $path = $matches[$extension];
        $rule = ASSET_RULES[$extension];
        $size = filesize($path);
        if ($size === false || $size > $rule['max']) {
            $limit = (int) ($rule['max'] / 1024 / 1024);
            $error = basename($path) . " exceeds the {$limit} MB limit";
            return null;
        }

        if ($rule['type'] === 'archive') {
            $modelUrl = modelFromZip($path, $assetNumber, $error);
            return $modelUrl === null ? null : ['type' => 'model', 'extension' => 'zip', 'url' => $modelUrl];
        }

        return ['type' => $rule['type'], 'extension' => $extension, 'url' => 'assets/' . basename($path)];
    }

    return null;
}

$items = [];
$assetErrors = [];
for ($i = 1; $i <= 24; $i++) {
    if (!is_file(__DIR__ . "/assets/marker{$i}.patt")) {
        continue;
    }

    $error = '';
    $asset = findAsset($i, $error);
    if ($asset !== null) {
        $items[] = ['number' => $i] + $asset;
    } elseif ($error !== '') {
        $assetErrors[] = $error;
    }
}
?>
<!doctype html>
<html lang="th">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://aframe.io/releases/1.0.4/aframe.min.js"></script>
        <script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js"></script>
        <script src="https://raw.githack.com/AR-js-org/studio-backend/master/src/modules/marker/tools/gesture-detector.js"></script>
        <script src="https://raw.githack.com/AR-js-org/studio-backend/master/src/modules/marker/tools/gesture-handler.js"></script>
        <script>
            // Keep the original image/video ratio while limiting the longest side.
            AFRAME.registerComponent('fit-media', {
                schema: {
                    maxSize: {type: 'number', default: 4}
                },

                init: function () {
                    this.fitted = false;
                    this.fit = this.fit.bind(this);
                    this.el.addEventListener('materialtextureloaded', this.fit);
                    this.el.addEventListener('loaded', this.fit);
                },

                tick: function () {
                    if (!this.fitted) this.fit();
                },

                fit: function () {
                    const mesh = this.el.getObject3D('mesh');
                    const source = mesh && mesh.material && mesh.material.map
                        ? mesh.material.map.image
                        : null;
                    const sourceWidth = source
                        ? (source.videoWidth || source.naturalWidth || source.width || 0)
                        : 0;
                    const sourceHeight = source
                        ? (source.videoHeight || source.naturalHeight || source.height || 0)
                        : 0;

                    if (!sourceWidth || !sourceHeight) return;

                    const scale = this.data.maxSize / Math.max(sourceWidth, sourceHeight);
                    this.el.setAttribute('geometry', {
                        width: sourceWidth * scale,
                        height: sourceHeight * scale
                    });
                    this.fitted = true;
                },

                remove: function () {
                    this.el.removeEventListener('materialtextureloaded', this.fit);
                    this.el.removeEventListener('loaded', this.fit);
                }
            });

            // WebGL textures need to be refreshed for animated GIF frames.
            AFRAME.registerComponent('animated-gif', {
                init: function () {
                    this.nextUpdate = 0;
                },
                tick: function (time) {
                    if (time < this.nextUpdate) return;
                    this.nextUpdate = time + 50;
                    const mesh = this.el.getObject3D('mesh');
                    if (mesh && mesh.material && mesh.material.map) {
                        mesh.material.map.needsUpdate = true;
                    }
                }
            });
        </script>
    </head>

    <body style="margin: 0; overflow: hidden;">
        <a-scene
            vr-mode-ui="enabled: false;"
            loading-screen="enabled: false;"
            arjs="trackingMethod: best; sourceType: webcam; debugUIEnabled: false;"
            id="scene"
            embedded
            gesture-detector
        >
            <a-assets>
                <?php foreach ($items as $item): ?>
                    <?php if ($item['type'] === 'video'): ?>
                        <video
                            id="video-asset-<?php echo $item['number']; ?>"
                            src="<?php echo htmlspecialchars(assetUrl($item['url']), ENT_QUOTES, 'UTF-8'); ?>"
                            preload="auto"
                            autoplay
                            loop
                            muted
                            playsinline
                            webkit-playsinline
                        ></video>
                    <?php endif; ?>
                <?php endforeach; ?>
            </a-assets>

            <?php foreach ($items as $item): ?>
                <a-marker
                    id="marker-<?php echo $item['number']; ?>"
                    type="pattern"
                    preset="custom"
                    url="assets/marker<?php echo $item['number']; ?>.patt"
                    raycaster="objects: .clickable"
                    emitevents="true"
                    cursor="fuse: false; rayOrigin: mouse;"
                >
                    <?php if ($item['type'] === 'model'): ?>
                        <a-entity
                            gltf-model="url(<?php echo htmlspecialchars(assetUrl($item['url']), ENT_QUOTES, 'UTF-8'); ?>)"
                            scale="1 1 1"
                            class="clickable"
                            rotation="0 0 0"
                            gesture-handler
                        ></a-entity>
                    <?php elseif ($item['type'] === 'video'): ?>
                        <a-video
                            src="#video-asset-<?php echo $item['number']; ?>"
                            width="1"
                            height="1"
                            class="clickable"
                            rotation="-90 0 0"
                            fit-media="maxSize: <?php echo MAX_MEDIA_SIZE; ?>"
                            gesture-handler
                        ></a-video>
                    <?php else: ?>
                        <a-image
                            src="<?php echo htmlspecialchars(assetUrl($item['url']), ENT_QUOTES, 'UTF-8'); ?>"
                            width="1"
                            height="1"
                            class="clickable"
                            rotation="-90 0 0"
                            fit-media="maxSize: <?php echo MAX_MEDIA_SIZE; ?>"
                            <?php if ($item['extension'] === 'gif'): ?>animated-gif<?php endif; ?>
                            gesture-handler
                        ></a-image>
                    <?php endif; ?>
                </a-marker>
            <?php endforeach; ?>

            <a-entity camera></a-entity>
        </a-scene>

        <?php foreach ($assetErrors as $error): ?>
            <!-- <?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?> -->
        <?php endforeach; ?>
    </body>
</html>
