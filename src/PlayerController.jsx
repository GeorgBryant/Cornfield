import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export default function PlayerController() {
  const { camera, gl, scene } = useThree();

  const keys = useRef({});

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const movement = useRef(new THREE.Vector3());

  const yaw = useRef(0);
  const pitch = useRef(0);

  // Terrain-following objects
  const grassMeshes = useRef([]);
  const raycaster = useRef(new THREE.Raycaster());
  const rayOrigin = useRef(new THREE.Vector3());
  const down = useRef(new THREE.Vector3(0, -1, 0));

  const speed = 15;
  const mouseSensitivity = 0.002;

  // Distance between the ground and the player's eyes
  const eyeHeight = 2.6;

  useEffect(() => {
    function handleKeyDown(event) {
      keys.current[event.code] = true;
    }

    function handleKeyUp(event) {
      keys.current[event.code] = false;
    }

    function handleClick() {
      gl.domElement.requestPointerLock();
    }

    function handleMouseMove(event) {
      if (document.pointerLockElement !== gl.domElement) return;

      yaw.current -= event.movementX * mouseSensitivity;
      pitch.current -= event.movementY * mouseSensitivity;

      const maxPitch = Math.PI / 2 - 0.1;

      pitch.current = THREE.MathUtils.clamp(
        pitch.current,
        -maxPitch,
        maxPitch
      );
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousemove", handleMouseMove);
    gl.domElement.addEventListener("click", handleClick);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousemove", handleMouseMove);
      gl.domElement.removeEventListener("click", handleClick);
    };
  }, [gl]);

  useFrame((_, delta) => {
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    camera.getWorldDirection(forward.current);

    // Keep movement horizontal even when looking up or down
    forward.current.y = 0;
    forward.current.normalize();

    right.current
      .crossVectors(forward.current, camera.up)
      .normalize();

    movement.current.set(0, 0, 0);

    if (keys.current.KeyW) {
      movement.current.add(forward.current);
    }

    if (keys.current.KeyS) {
      movement.current.sub(forward.current);
    }

    if (keys.current.KeyD) {
      movement.current.add(right.current);
    }

    if (keys.current.KeyA) {
      movement.current.sub(right.current);
    }

    if (movement.current.lengthSq() > 0) {
      movement.current.normalize();
      movement.current.multiplyScalar(speed * delta);

      camera.position.add(movement.current);
    }

    /*
     * The terrain loads after PlayerController, so keep looking for the
     * four Grass objects until they are available.
     */
    if (grassMeshes.current.length === 0) {
      const foundGrass = [];

      scene.traverse((object) => {
        if (object.isMesh && object.name === "Grass") {
          foundGrass.push(object);
        }
      });

      grassMeshes.current = foundGrass;
    }

    if (grassMeshes.current.length > 0) {
      // Begin the ray safely above the player
      rayOrigin.current.set(
        camera.position.x,
        camera.position.y + 50,
        camera.position.z
      );

      raycaster.current.set(rayOrigin.current, down.current);

      const hits = raycaster.current.intersectObjects(
        grassMeshes.current,
        false
      );

      if (hits.length > 0) {
        const targetHeight = hits[0].point.y + eyeHeight;

        // Smoothly follow slopes instead of snapping vertically
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          targetHeight,
          12,
          delta
        );
      }
    }
  });

  return null;
}