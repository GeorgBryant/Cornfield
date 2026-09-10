import { Canvas, useFrame , useThree} from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { QUALITY_LEVELS, resolveQuality } from "./quality";
import { applyWindShader, windUniforms } from "./wind";
import PlayerController from "./PlayerController";

// Collects EVERY material-part of the corn mesh, not just the first one.
// A Blender object with multiple material slots gets split into multiple
// single-material meshes on glTF export, so we need all of them.
function getMeshParts(scene) {
  scene.updateWorldMatrix(true, true);

  const parts = [];

  scene.traverse((child) => {
    if (child.isMesh) {
      const geometry = child.geometry.clone();

      // Bake Blender's local transform into the geometry so every part
      // lines up correctly relative to the others.
      geometry.applyMatrix4(child.matrixWorld);

      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      parts.push({
        geometry,
        material: child.material,
      });
    }
  });

  // Whole-plant height range, shared across every part below, so wind bend
  // is consistent and stems/leaves never separate.
  const maxHeight = Math.max(
    ...parts.map((part) => part.geometry.boundingBox.max.y)
  );

  parts.forEach((part) => applyWindShader(part.material, maxHeight));

  return parts;
}

function WorldContent({ cornPerTile }) {
  const corn1 = useGLTF("/models/Corn_01.glb").scene;
  const corn2 = useGLTF("/models/Corn_02.glb").scene;
  const corn3 = useGLTF("/models/Corn_03.glb").scene;
  const corn4 = useGLTF("/models/Corn_04.glb").scene;

  const cornPartsByVariant = useMemo(() => {
    return [
      getMeshParts(corn1),
      getMeshParts(corn2),
      getMeshParts(corn3),
      getMeshParts(corn4),
    ];
  }, [corn1, corn2, corn3, corn4]);

  return (
    <>
      <Landscape />

      <LoopingWorld
        cornPerTile={cornPerTile}
        cornPartsByVariant={cornPartsByVariant}
      />
    </>
  );
}

const BACKGROUND_FOLLOW = 1;

function Landscape() {
  const { scene } = useGLTF("/models/Landscape.glb");
  const groupRef = useRef();
  const { camera } = useThree();

  // Snap to the camera's starting XZ on mount, before the first paint, so
  // there's no visible jump on the first frame once following begins.
  useLayoutEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.position.x = camera.position.x * BACKGROUND_FOLLOW;
    groupRef.current.position.z = camera.position.z * BACKGROUND_FOLLOW;
  }, [camera]);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.x = camera.position.x * BACKGROUND_FOLLOW;
    groupRef.current.position.z = camera.position.z * BACKGROUND_FOLLOW;
    // Y is intentionally left alone — background stays at its fixed height.
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}
// Advances the shared wind clock once per frame. Mutates a plain object
// directly (windUniforms.uTime.value) — no React state, no re-renders.
function WindDriver() {
  useFrame((_, delta) => {
    windUniforms.uTime.value += delta;
  });
  return null;
}

// Renders one InstancedMesh per part (stem / top / middle / etc).
// All parts share the exact same `items` transform array, so instance i's
// stem, top, and middle all land in the same place and form one plant.
function InstancedCornVariant({ parts, items }) {
  const refs = useRef([]);

  useLayoutEffect(() => {
    if (!parts || parts.length === 0 || items.length === 0) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Euler();

    parts.forEach((_, partIndex) => {
      const mesh = refs.current[partIndex];
      if (!mesh) return;

      items.forEach((item, i) => {
        position.set(item.x, item.y, item.z);
        rotation.set(0, item.rotation, 0);
        quaternion.setFromEuler(rotation);
        scale.set(item.scale, item.scale, item.scale);

        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();

if (mesh.boundingSphere) {
  mesh.boundingSphere.radius += 1;
}
    });
  }, [parts, items]);

  if (!parts || parts.length === 0 || items.length === 0) return null;

  return (
    <>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(el) => (refs.current[i] = el)}
          args={[part.geometry, part.material, items.length]}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

function CornField({ grass, count, cornPartsByVariant }) {
  const corn = useMemo(() => {
    grass.updateWorldMatrix(true, true);

    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const rayOrigin = new THREE.Vector3();
    const box = new THREE.Box3().setFromObject(grass);

    const cornItems = [];
    const hits = [];

    while (cornItems.length < count) {
      const x = THREE.MathUtils.randFloat(box.min.x, box.max.x);
      const z = THREE.MathUtils.randFloat(box.min.z, box.max.z);

      rayOrigin.set(x, box.max.y + 50, z);
      raycaster.set(rayOrigin, down);

      hits.length = 0;
      raycaster.intersectObject(grass, true, hits);

      if (hits.length === 0) continue;

      cornItems.push({
        id: cornItems.length,
        model: Math.floor(Math.random() * 4),
        x,
        y: hits[0].point.y,
        z,
        rotation: Math.random() * Math.PI * 2,
        scale: 0.8 + Math.random() * 0.4,
      });
    }

    return cornItems;
  }, [grass, count]);

  const itemsByVariant = useMemo(() => {
    const groups = [[], [], [], []];

    corn.forEach((item) => {
      groups[item.model].push(item);
    });

    return groups;
  }, [corn]);

  return (
    <>
      {cornPartsByVariant.map((parts, variantIndex) => (
        <InstancedCornVariant
          key={variantIndex}
          parts={parts}
          items={itemsByVariant[variantIndex]}
        />
      ))}
    </>
  );
}

function Tile({
  sourceScene,
  initialOffsetX,
  initialOffsetZ,
  tileSize,
  cornPerTile,
  cornPartsByVariant,
  tileRef,
}) {
  const tileScene = useMemo(() => clone(sourceScene), [sourceScene]);

  const grass = useMemo(() => {
    const foundGrass = tileScene.getObjectByName("Grass");

    if (!foundGrass) {
      console.error("Could not find object named Grass in Grass_Tile.glb");
    }

    return foundGrass;
  }, [tileScene]);

  useLayoutEffect(() => {
  grass.traverse((child) => {
    if (child.isMesh) {
      child.frustumCulled = false;
    }
  });
}, [grass]);

  return (
    <group
      ref={tileRef}
      position={[
        initialOffsetX * tileSize,
        0,
        initialOffsetZ * tileSize,
      ]}
    >
      <primitive object={tileScene} />

      {grass && (
        <CornField
          grass={grass}
          count={cornPerTile}
          cornPartsByVariant={cornPartsByVariant}
        />
      )}
    </group>
  );
}

const TILE_LAYOUT = [
  { x: -1, z: -1 },
  { x: 0,  z: -1 },
  { x: 1,  z: -1 },

  { x: -1, z: 0 },
  { x: 0,  z: 0 },
  { x: 1,  z: 0 },

  { x: -1, z: 1 },
  { x: 0,  z: 1 },
  { x: 1,  z: 1 },
];

function LoopingWorld({ cornPerTile, cornPartsByVariant }) {
  const { scene } = useGLTF("/models/Grass_Tile.glb");
  const tileRefs = useRef([]);

  const tileSize = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();

    box.getSize(size);

    console.log("Actual Grass_Tile size:", {
      x: size.x,
      y: size.y,
      z: size.z,
    });

    return Math.max(size.x, size.z);
  }, [scene]);

  // Total area the 2x2 layout spans on each axis. When a tile is recycled,
  // it jumps forward/backward by this amount to land in the equivalent
  // "opposite side" slot of the grid.
  const gridWidth = tileSize * 3;
  const gridDepth = tileSize * 3;

  useFrame(({ camera }) => {
  const recycleX = gridWidth / 2;
  const recycleZ = gridDepth / 2;

  tileRefs.current.forEach((tile) => {
    if (!tile) return;

    if (camera.position.x - tile.position.x > recycleX) {
      tile.position.x += gridWidth;
    } else if (tile.position.x - camera.position.x > recycleX) {
      tile.position.x -= gridWidth;
    }

    if (camera.position.z - tile.position.z > recycleZ) {
      tile.position.z += gridDepth;
    } else if (tile.position.z - camera.position.z > recycleZ) {
      tile.position.z -= gridDepth;
    }
  });
});


  return (
    <>
      {TILE_LAYOUT.map((layout, index) => (
        <Tile
  key={index}
  sourceScene={scene}
  initialOffsetX={layout.x}
  initialOffsetZ={layout.z}
  tileSize={tileSize}
  cornPerTile={cornPerTile}
  cornPartsByVariant={cornPartsByVariant}
  tileRef={(el) => {
    tileRefs.current[index] = el;
  }}
/>
      ))}
    </>
  );
}

// Small, self-contained UI for switching quality levels. Purely additive —
// remove this component (and the two lines that render it in App) if you
// don't want a visible selector, and Automatic will still work as the
// default with no other changes needed.
function QualitySelector({ selected, onChange }) {
  const options = [
    QUALITY_LEVELS.AUTOMATIC,
    QUALITY_LEVELS.LOW,
    QUALITY_LEVELS.MEDIUM,
    QUALITY_LEVELS.HIGH,
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        display: "flex",
        gap: 6,
        fontFamily: "sans-serif",
        fontSize: 12,
      }}
    >
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          style={{
            padding: "4px 10px",
            borderRadius: 4,
            border: "1px solid #888",
            background: selected === option ? "#333" : "#fff",
            color: selected === option ? "#fff" : "#333",
            cursor: "pointer",
            textTransform: "capitalize",
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [qualityLevel, setQualityLevel] = useState(
    QUALITY_LEVELS.AUTOMATIC
  );

  const { settings } = useMemo(
    () => resolveQuality(qualityLevel),
    [qualityLevel]
  );

  const cornPerTile = settings.cornCount / 9;

  return (
    <>
      <QualitySelector
        selected={qualityLevel}
        onChange={setQualityLevel}
      />

      <Canvas
        style={{ width: "100vw", height: "100vh" }}
        camera={{ position: [0, 3, 20], fov: 60 }}
        dpr={settings.dpr}
      >
        <ambientLight intensity={1.5} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={2}
        />

        <WindDriver />
        <PlayerController />

<Suspense fallback={null}>
  <WorldContent
    key={qualityLevel}
    cornPerTile={cornPerTile}
  />
</Suspense>

      </Canvas>
    </>
  );
}

useGLTF.preload("/models/Landscape.glb");
useGLTF.preload("/models/Grass_Tile.glb");
useGLTF.preload("/models/Corn_01.glb");
useGLTF.preload("/models/Corn_02.glb");
useGLTF.preload("/models/Corn_03.glb");
useGLTF.preload("/models/Corn_04.glb");
