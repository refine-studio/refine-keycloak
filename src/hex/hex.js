import * as THREE from "three";

/* ------------------------------------------------------------------
   The rippling hexagon background of refine.studio, copied from
   mono-frontend apps/web/components/hex-effect/{HexGrid,HexScene}.tsx
   @ 5ec6f8c. The website draws it with React Three Fiber. This port draws
   the same scene with plain three.js, because a Keycloak theme has no React.
   Every constant below keeps the website's value.
   ------------------------------------------------------------------ */

const CELL_RADIUS = 0.58;
const GAP_FACTOR = 0.975;
const PRISM_DEPTH = 0.35;

const COLUMNS = 39;
const ROWS = 23;
const COLUMN_SPACING = CELL_RADIUS * Math.sqrt(3);
const ROW_SPACING = CELL_RADIUS * 1.5;

const WAVE_AMPLITUDE = 0.25;
const WAVE_FREQUENCY = 0.42;
const WAVE_SPEED = 0.75;
const ROW_PHASE_SKEW = 0.22;
const JITTER_RANGE = 0.7;

const PALETTES = {
  dark: { surface: "#3a3c3f", tones: [0.85, 0.62, 0.42], peakShadeGain: 0.8 },
  light: { surface: "#ffffff", tones: [1.0, 0.88, 0.76], peakShadeGain: 0.14 },
};

const SCENE_SETTINGS = {
  dark: { background: "#101113", keyIntensity: 3.6, ambientIntensity: 0.7, fillColor: "#7c7e82" },
  light: { background: "#f2f3f5", keyIntensity: 1.4, ambientIntensity: 1.8, fillColor: "#e8e9eb" },
};

const seededRandom = (seed) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const buildCells = () => {
  const cells = [];
  const random = seededRandom(1688);
  const xOffset = ((COLUMNS - 1) * COLUMN_SPACING) / 2;
  const yOffset = ((ROWS - 1) * ROW_SPACING) / 2;

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      // Odd-r offset to axial coordinates. (q - r) mod 3 changes across every hex edge.
      const axialQ = column - (row - (row & 1)) / 2;
      cells.push({
        x: column * COLUMN_SPACING - xOffset + (row % 2 === 1 ? COLUMN_SPACING / 2 : 0),
        y: row * ROW_SPACING - yOffset,
        phaseJitter: (random() - 0.5) * JITTER_RANGE,
        toneIndex: (((axialQ - row) % 3) + 3) % 3,
      });
    }
  }
  return cells;
};

const liftAt = (cell, time) => {
  const phase = cell.x * WAVE_FREQUENCY - time * WAVE_SPEED + cell.y * ROW_PHASE_SKEW + cell.phaseJitter;
  const swell = Math.sin(phase);
  return swell * Math.abs(swell) * WAVE_AMPLITUDE;
};

export class HexScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    this.camera.position.set(0, -1.6, 15);

    this.key = new THREE.DirectionalLight("#ffffff");
    this.key.position.set(-8, 10, 12);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -22, right: 22, top: 14, bottom: -14, near: 1, far: 40 });
    this.key.shadow.bias = -0.0004;
    this.ambient = new THREE.AmbientLight();
    this.fill = new THREE.DirectionalLight();
    this.fill.position.set(6, -6, 8);
    this.fill.intensity = 0.25;
    this.scene.add(this.key, this.ambient, this.fill);

    this.cells = buildCells();
    const prism = new THREE.CylinderGeometry(CELL_RADIUS * GAP_FACTOR, CELL_RADIUS * GAP_FACTOR, PRISM_DEPTH, 6);
    prism.rotateX(Math.PI / 2);
    this.material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
    this.mesh = new THREE.InstancedMesh(prism, this.material, this.cells.length);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.time = 0;
    this.setTheme("dark");
    this.resize();
  }

  setTheme(theme) {
    const settings = SCENE_SETTINGS[theme];
    this.palette = PALETTES[theme];
    this.scene.background = new THREE.Color(settings.background);
    this.key.intensity = settings.keyIntensity;
    this.ambient.intensity = settings.ambientIntensity;
    this.fill.color.set(settings.fillColor);
    this.material.color.set(this.palette.surface);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Advances the wave by dt seconds and draws one frame. */
  render(dt) {
    this.time += dt;
    const { cells, dummy, color, mesh, palette } = this;
    cells.forEach((cell, index) => {
      const lift = liftAt(cell, this.time);
      dummy.position.set(cell.x, cell.y, lift);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.setScalar(palette.tones[cell.toneIndex] + (lift / WAVE_AMPLITUDE) * palette.peakShadeGain);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
