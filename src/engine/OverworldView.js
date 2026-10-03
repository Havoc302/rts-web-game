import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { BIOME_TYPES } from '../config.js';

const COLORS = {
  ocean: '#176078',
  mixed: '#789785',
  [BIOME_TYPES.TEMPERATE]: '#4f985d',
  [BIOME_TYPES.PLAINS]: '#a5c778',
  [BIOME_TYPES.HILLY]: '#a5a37d',
  [BIOME_TYPES.MOUNTAINOUS]: '#b8bcb6',
  [BIOME_TYPES.SWAMP]: '#477e6d',
  [BIOME_TYPES.DESERT]: '#d3ba72',
};

function point(lat, lng, radius = 1) {
  const latitude = lat * Math.PI / 180;
  const longitude = lng * Math.PI / 180;
  return new THREE.Vector3(
    radius * Math.cos(latitude) * Math.sin(longitude),
    radius * Math.sin(latitude),
    radius * Math.cos(latitude) * Math.cos(longitude),
  );
}

export function buildGlobeBoundaries(cells) {
  const centers = new Map(Array.from(cells.values(), (cell) => [point(cell.lat, cell.lng), cell.id]));
  const hull = new ConvexHull().setFromPoints(Array.from(centers.keys()));
  const corners = new Map(Array.from(cells.keys(), (id) => [id, []]));
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      corners.get(centers.get(edge.vertex.point)).push(face.normal.clone());
      edge = edge.next;
    } while (edge !== face.edge);
  }
  const boundaries = new Map();
  for (const [center, id] of centers) {
    const tangent = new THREE.Vector3(0, 1, 0).cross(center).normalize();
    if (tangent.lengthSq() < 0.5) tangent.set(1, 0, 0);
    const bitangent = center.clone().cross(tangent);
    const vertices = corners.get(id).filter((vertex, index, candidates) =>
      candidates.findIndex((other) => other.distanceToSquared(vertex) < 1e-18) === index);
    vertices.sort((first, second) =>
      Math.atan2(first.dot(bitangent), first.dot(tangent)) - Math.atan2(second.dot(bitangent), second.dot(tangent)));
    boundaries.set(id, vertices.map((vertex) => [
      Math.asin(THREE.MathUtils.clamp(vertex.y, -1, 1)) * 180 / Math.PI,
      Math.atan2(vertex.x, vertex.z) * 180 / Math.PI,
    ]));
  }
  return boundaries;
}

function outline(cell, color, boundary = cell.boundary) {
  const vertices = boundary.map(([lat, lng]) => point(lat, lng, 1.028));
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(vertices),
    new THREE.LineBasicMaterial({ color }),
  );
}

export class OverworldView {
  constructor(element, planet, { onEnter, onClose, onRegenerate, isVisited, hasCity, getTerrainStats }) {
    this.element = element;
    this.planet = planet;
    this.onEnter = onEnter;
    this.onClose = onClose;
    this.isVisited = isVisited;
    this.hasCity = hasCity;
    this.getTerrainStats = getTerrainStats;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b2331');
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Planet map; drag to rotate and click a land hex');
    this.element.querySelector('#overworld-scene').appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.9;
    this.controls.maxDistance = 8;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.buildGlobe();
    this.cityMarkers = new THREE.Group();
    this.cityMarkerGeometry = new THREE.CircleGeometry(0.03, 20);
    this.cityMarkerBorderMaterial = new THREE.MeshBasicMaterial({ color: '#172a25' });
    this.cityMarkerMaterial = new THREE.MeshBasicMaterial({ color: '#fff2c6' });
    this.scene.add(this.cityMarkers);
    this.element.querySelector('#btn-close-overworld').onclick = () => this.close();
    this.element.querySelector('#btn-enter-hex').onclick = () => {
      if (this.selected) this.onEnter(this.selected.id);
    };
    this.element.querySelector('#btn-generate-overworld').onclick = () => {
      const input = this.element.querySelector('#overworld-seed-input');
      if (!input.reportValidity() || !Number.isInteger(input.valueAsNumber)) return;
      onRegenerate(input.valueAsNumber);
    };
    let down = null;
    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      down = { x: event.clientX, y: event.clientY };
    });
    this.renderer.domElement.addEventListener('pointerup', (event) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
      down = null;
      this.pick(event);
    });
    this.handleResize = () => { if (this.isOpen) this.resize(); };
    window.addEventListener('resize', this.handleResize);
  }

  buildGlobe() {
    this.cellBoundaries = buildGlobeBoundaries(this.planet.cells);
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.998, 48, 32), new THREE.MeshBasicMaterial({ color: '#0d4359' })));
    const positions = [];
    const colors = [];
    const edges = [];
    const edgeColors = [];
    this.faceCells = [];
    const landEdge = new THREE.Color('#c7d6c0');
    const oceanEdge = new THREE.Color('#5c9bad');
    for (const cell of this.planet.cells.values()) {
      const center = point(cell.lat, cell.lng, 1.009);
      const boundary = this.cellBoundaries.get(cell.id);
      const corners = boundary.map(([lat, lng]) => point(lat, lng, 1.009));
      const color = new THREE.Color(COLORS[cell.ocean ? 'ocean' : cell.biome]);
      for (let index = 0; index < corners.length; index++) {
        const first = corners[index];
        const second = corners[(index + 1) % corners.length];
        const outward = first.clone().sub(center).cross(second.clone().sub(center)).dot(center) > 0;
        for (const vertex of (outward ? [center, first, second] : [center, second, first])) {
          positions.push(vertex.x, vertex.y, vertex.z);
          colors.push(color.r, color.g, color.b);
        }
        this.faceCells.push(cell.id);
        const a = point(boundary[index][0], boundary[index][1], 1.015);
        const b = point(boundary[(index + 1) % corners.length][0], boundary[(index + 1) % corners.length][1], 1.015);
        edges.push(a.x, a.y, a.z, b.x, b.y, b.z);
        const edge = cell.ocean ? oceanEdge : landEdge;
        for (let vertex = 0; vertex < 2; vertex++) edgeColors.push(edge.r, edge.g, edge.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    this.surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.scene.add(this.surface);
    const border = new THREE.BufferGeometry();
    border.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
    border.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));
    this.scene.add(new THREE.LineSegments(border, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })));
  }

  refreshCityMarkers() {
    this.cityMarkers.clear();
    for (const cell of this.planet.cells.values()) {
      if (cell.ocean || !this.hasCity(cell.id)) continue;
      const marker = new THREE.Mesh(this.cityMarkerGeometry, this.cityMarkerBorderMaterial);
      marker.position.copy(point(cell.lat, cell.lng, 1.035));
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), marker.position.clone().normalize());
      marker.userData.cellId = cell.id;
      const center = new THREE.Mesh(this.cityMarkerGeometry, this.cityMarkerMaterial);
      center.scale.setScalar(0.65);
      center.position.z = 0.001;
      marker.add(center);
      this.cityMarkers.add(marker);
    }
  }

  open(currentId) {
    this.currentId = currentId;
    this.refreshCityMarkers();
    this.isOpen = true;
    this.element.hidden = false;
    this.element.querySelector('#btn-close-overworld').hidden = !currentId;
    this.element.querySelector('#overworld-seed-input').value = this.planet.seed;
    this.resize();
    const current = this.planet.getCell(currentId) || this.planet.getCell(this.planet.homeCellId);
    const fitDistance = 1 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * 0.82);
    this.camera.position.copy(point(current.lat, current.lng, Math.max(3.1, fitDistance)));
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    if (this.currentOutline) this.scene.remove(this.currentOutline);
    this.currentOutline = currentId ? outline(current, '#fbbf24', this.cellBoundaries?.get(current.id)) : null;
    if (this.currentOutline) this.scene.add(this.currentOutline);
    this.select(currentId ? current : null);
    this.frame();
  }

  select(cell) {
    this.selected = cell?.ocean ? null : cell;
    const info = this.element.querySelector('#overworld-info');
    info.hidden = !this.selected;
    if (this.selected) {
      this.element.querySelector('#overworld-biome').textContent = this.selected.biome;
      this.element.querySelector('#overworld-seed').textContent = this.selected.seed.toLocaleString();
      const terrainStats = this.getTerrainStats(this.selected.id);
      this.element.querySelector('#overworld-water-percent').textContent = `${terrainStats.water.toFixed(1)}%`;
      this.element.querySelector('#overworld-forest-percent').textContent = `${terrainStats.forest.toFixed(1)}%`;
      this.element.querySelector('#overworld-mountain-percent').textContent = `${terrainStats.mountain.toFixed(1)}%`;
      this.element.querySelector('#overworld-status').textContent = this.selected.id === this.currentId
        ? 'Current city' : this.isVisited(this.selected.id) ? 'Visited city' : 'Unexplored';
      this.element.querySelector('#btn-enter-hex').textContent = 'Open Map';
    }
    if (this.selectedOutline) this.scene.remove(this.selectedOutline);
    this.selectedOutline = this.selected && this.selected.id !== this.currentId ? outline(this.selected, '#ffffff', this.cellBoundaries?.get(this.selected.id)) : null;
    if (this.selectedOutline) this.scene.add(this.selectedOutline);
  }

  pick(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.surface)[0];
    this.select(hit ? this.planet.getCell(this.faceCells[hit.faceIndex]) : null);
  }

  resize() {
    const bounds = this.element.querySelector('#overworld-scene').getBoundingClientRect();
    this.camera.aspect = Math.max(1, bounds.width) / Math.max(1, bounds.height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(bounds.width, bounds.height);
    if (this.isOpen && this.camera.position.length() > 0) {
      const fitDistance = 1 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * 0.82);
      this.camera.position.setLength(Math.max(3.1, fitDistance));
    }
  }

  frame() {
    if (!this.isOpen) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.frame());
  }

  close() {
    this.isOpen = false;
    cancelAnimationFrame(this.animationFrame);
    this.element.hidden = true;
    this.onClose();
  }

  dispose() {
    if (this.isOpen) this.close();
    window.removeEventListener('resize', this.handleResize);
    this.cityMarkerGeometry.dispose();
    this.cityMarkerBorderMaterial.dispose();
    this.cityMarkerMaterial.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}