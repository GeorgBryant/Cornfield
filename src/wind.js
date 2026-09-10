import * as THREE from "three";

export const WindSettings = {
  direction: [1, 0.35],
  baseStrength: 0.4,
  speed: 6,
  heightExponent: 2,
};

export const windUniforms = {
  uTime: { value: 0 },
};

export function applyWindShader(material, maxHeight) {
  if (material.userData.windApplied) return;

  material.userData.windApplied = true;

  const direction = new THREE.Vector2(
    ...WindSettings.direction
  ).normalize();

  material.onBeforeCompile = (shader) => {
  console.log("Wind shader compiled", {
    material: material.name,
    maxHeight,
  });

  shader.uniforms.uTime = windUniforms.uTime;

    shader.uniforms.uWindDirection = {
      value: direction,
    };

    shader.uniforms.uBaseStrength = {
      value: WindSettings.baseStrength,
    };

    shader.uniforms.uSpeed = {
      value: WindSettings.speed,
    };

    shader.uniforms.uHeightExponent = {
      value: WindSettings.heightExponent,
    };

    shader.uniforms.uMaxHeight = {
      value: maxHeight,
    };

    shader.vertexShader =
      `
      uniform float uTime;
      uniform vec2 uWindDirection;
      uniform float uBaseStrength;
      uniform float uSpeed;
      uniform float uHeightExponent;
      uniform float uMaxHeight;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      vec3 transformed = vec3(position);

      #ifdef USE_INSTANCING
        vec3 windInstancePos = instanceMatrix[3].xyz;

        float windPhase = dot(
          windInstancePos.xz,
          vec2(0.13, 0.17)
        );
      #else
        float windPhase = 0.0;
      #endif

      float windHeightFactor = clamp(
        transformed.y / uMaxHeight,
        0.0,
        1.0
      );

      float windBend = pow(
        windHeightFactor,
        uHeightExponent
      );

      float windSway =
        sin(uTime * uSpeed + windPhase) *
        uBaseStrength;

      transformed.xz +=
        uWindDirection *
        windSway *
        windBend;
      `
    );
  };

  material.needsUpdate = true;
}