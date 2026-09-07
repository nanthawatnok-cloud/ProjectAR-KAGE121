/* global AFRAME, THREE */
(() => {
    "use strict";

    AFRAME.registerComponent("fit-model", {
        schema: { size: { type: "number", default: 1 } },

        init() {
            this.fit = this.fit.bind(this);
            this.el.addEventListener("model-loaded", this.fit);
        },

        remove() {
            this.el.removeEventListener("model-loaded", this.fit);
        },

        fit() {
            const mesh = this.el.getObject3D("mesh");
            if (!mesh) return;
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            const largestSide = Math.max(size.x, size.y, size.z);
            if (!Number.isFinite(largestSide) || largestSide <= 0) return;

            mesh.scale.multiplyScalar(this.data.size / largestSide);
            box.setFromObject(mesh);
            const center = box.getCenter(new THREE.Vector3());
            mesh.position.x -= center.x;
            mesh.position.y -= box.min.y;
            mesh.position.z -= center.z;
        },
    });

    AFRAME.registerSystem("ar-manipulable", {
        init() {
            this.items = new Set();
            this.pointers = new Map();
            this.selected = null;
            this.dragStart = null;
            this.lastGesture = null;
            this.el.addEventListener("render-target-loaded", () => this.attach());
            if (this.el.canvas) this.attach();
        },

        attach() {
            const canvas = this.el.canvas;
            if (!canvas || this.canvas === canvas) return;
            this.canvas = canvas;
            canvas.style.touchAction = "none";
            canvas.addEventListener("pointerdown", (event) => this.pointerDown(event), { passive: false });
            canvas.addEventListener("pointermove", (event) => this.pointerMove(event), { passive: false });
            canvas.addEventListener("pointerup", (event) => this.pointerUp(event), { passive: false });
            canvas.addEventListener("pointercancel", (event) => this.pointerUp(event), { passive: false });
            canvas.addEventListener("wheel", (event) => this.wheel(event), { passive: false });
        },

        register(component) { this.items.add(component); },
        unregister(component) { this.items.delete(component); },

        pick(event) {
            const camera = this.el.camera;
            if (!camera || !this.canvas) return null;
            const rect = this.canvas.getBoundingClientRect();
            const pointer = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(pointer, camera);
            let closest = null;

            for (const component of this.items) {
                if (!component.markerVisible) continue;
                const hits = raycaster.intersectObject(component.el.object3D, true);
                if (hits.length && (!closest || hits[0].distance < closest.distance)) {
                    closest = { component, distance: hits[0].distance };
                }
            }
            return closest && closest.component;
        },

        pointerDown(event) {
            this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (!this.selected) this.selected = this.pick(event);
            if (!this.selected) return;
            event.preventDefault();
            this.canvas.setPointerCapture?.(event.pointerId);
            this.beginGesture();
        },

        pointerMove(event) {
            if (!this.pointers.has(event.pointerId)) return;
            this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (!this.selected) return;
            event.preventDefault();
            const points = [...this.pointers.values()];

            if (points.length === 1 && this.dragStart) {
                const dx = (points[0].x - this.dragStart.x) / Math.max(this.canvas.clientWidth, 1);
                const dy = (points[0].y - this.dragStart.y) / Math.max(this.canvas.clientHeight, 1);
                const position = this.selected.el.object3D.position;
                position.x = this.dragStart.position.x + dx * 2.5;
                position.z = this.dragStart.position.z + dy * 2.5;
            } else if (points.length >= 2) {
                const gesture = this.getTwoPointerGesture(points);
                if (this.lastGesture) {
                    const object = this.selected.el.object3D;
                    const ratio = gesture.distance / Math.max(this.lastGesture.distance, 1);
                    const nextScale = THREE.MathUtils.clamp(object.scale.x * ratio, .15, 8);
                    object.scale.setScalar(nextScale);
                    object.rotation.y += gesture.angle - this.lastGesture.angle;
                }
                this.lastGesture = gesture;
            }
        },

        pointerUp(event) {
            this.pointers.delete(event.pointerId);
            if (this.pointers.size === 0) {
                this.selected = null;
                this.dragStart = null;
                this.lastGesture = null;
            } else {
                this.beginGesture();
            }
        },

        wheel(event) {
            const selected = this.pick(event);
            if (!selected) return;
            event.preventDefault();
            const object = selected.el.object3D;
            const nextScale = THREE.MathUtils.clamp(object.scale.x * (event.deltaY < 0 ? 1.1 : .9), .15, 8);
            object.scale.setScalar(nextScale);
        },

        beginGesture() {
            const points = [...this.pointers.values()];
            this.lastGesture = points.length >= 2 ? this.getTwoPointerGesture(points) : null;
            if (points.length === 1 && this.selected) {
                this.dragStart = {
                    x: points[0].x,
                    y: points[0].y,
                    position: this.selected.el.object3D.position.clone(),
                };
            }
        },

        getTwoPointerGesture(points) {
            const dx = points[1].x - points[0].x;
            const dy = points[1].y - points[0].y;
            return { distance: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
        },
    });

    AFRAME.registerComponent("ar-manipulable", {
        init() {
            this.marker = this.el.closest("a-marker");
            this.markerVisible = false;
            this.found = () => { this.markerVisible = true; };
            this.lost = () => { this.markerVisible = false; };
            this.marker?.addEventListener("markerFound", this.found);
            this.marker?.addEventListener("markerLost", this.lost);
            this.system.register(this);
        },

        remove() {
            this.marker?.removeEventListener("markerFound", this.found);
            this.marker?.removeEventListener("markerLost", this.lost);
            this.system.unregister(this);
        },
    });
})();
