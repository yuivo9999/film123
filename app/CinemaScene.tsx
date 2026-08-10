"use client";

/* Three.js cameras, renderers and materials are intentionally mutable. */
/* eslint-disable react-hooks/immutability */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AmbientLight,
  BackSide,
  CanvasTexture,
  Color,
  Euler,
  ExtrudeGeometry,
  Fog,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  Shape,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  VideoTexture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  cinemaSeatGeometry,
  getSeatEyeY,
  type Auditorium,
  type Seat,
} from "./cinema-data";

type ViewCommand = {
  yaw: number;
  pitch: number;
  token: number;
};

export type FreeMoveCommand = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

const idleFreeMove: FreeMoveCommand = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

type FitMode =
  | "fit_screen"
  | "original"
  | "16_9"
  | "4_3"
  | "4_9"
  | "9_16"
  | "16_10"
  | "contain"
  | "fill"
  | "height"
  | "vertical"
  | "aspect_fit"
  | "cover"
  | "align_height";

export type CameraPreset =
  | "seat"
  | "rear_center"
  | "front_row"
  | "stage_view"
  | "birds_eye"
  | "side_angle"
  | "free";

type CinemaSceneProps = {
  auditorium: Auditorium;
  seats: Seat[];
  selectedSeat: Seat;
  filmMode: boolean;
  cameraPreset?: CameraPreset;
  sceneStyle?:
    | "classic"
    | "urban_plaza"
    | "snowy_greek"
    | "space_station"
    | "warm_wood_lounge"
    | "imax_giant"
    | "minimalist_cream"
    | "alpine_desert"
    | "baroque_opera"
    | "suzhou_garden";
  playing: boolean;
  playbackToken: number;
  viewCommand: ViewCommand;
  freeMove?: FreeMoveCommand;
  isMobile: boolean;
  videoSrc?: string;
  playbackRate?: number;
  fitMode?: FitMode;
  audioMode?: "original" | "cinema_spatial";
  volume?: number;
  seekTime?: number | null;
  skipTailSeconds?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
};

const upVector = new Vector3(0, 1, 0);
const screenOverlayWidth = 1440;
const screenOverlayHeight = 1080;
const lightingTransitionSpeed = 3.2;
const cameraHorizontalFov = 62;
const smoothFactor = (delta: number) =>
  1 - Math.exp(-lightingTransitionSpeed * delta);
const verticalFovForAspect = (aspect: number) =>
  (2 *
    Math.atan(
      Math.tan((cameraHorizontalFov * Math.PI) / 360) /
        Math.max(aspect, 0.1),
    ) *
    180) /
  Math.PI;
const tuneSeatMaterial = (
  material: MeshPhysicalMaterial | null,
  factor: number,
  targetEmission: number,
  targetSheen: number,
  targetSpecular: number,
) => {
  if (!material) return;

  const dE = targetEmission - material.emissiveIntensity;
  const dSh = targetSheen - material.sheen;
  const dSp = targetSpecular - material.specularIntensity;

  if (Math.abs(dE) > 0.0005) {
    material.emissiveIntensity += dE * factor;
  } else {
    material.emissiveIntensity = targetEmission;
  }

  if (Math.abs(dSh) > 0.0005) {
    material.sheen += dSh * factor;
  } else {
    material.sheen = targetSheen;
  }

  if (Math.abs(dSp) > 0.0005) {
    material.specularIntensity += dSp * factor;
  } else {
    material.specularIntensity = targetSpecular;
  }
};
const silverScreenVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const silverScreenFragmentShader = `
  uniform float uGain;
  uniform float uHalfGainAngle;
  uniform float uReflectiveArea;
  uniform float uHouseLights;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  float hash21(vec2 value) {
    value = fract(value * vec2(123.34, 456.21));
    value += dot(value, value + 45.32);
    return fract(value.x * value.y);
  }

  float topSpotlight(float center, float depthFromTop) {
    float beamWidth = 0.025 + depthFromTop * 0.19;
    float horizontalFalloff = exp(
      -3.2 * pow((vUv.x - center) / beamWidth, 2.0)
    );
    float verticalFalloff = exp(-2.15 * depthFromTop);
    float softPool = exp(
      -1.2 * pow((vUv.x - center) / (beamWidth * 2.5), 2.0)
    ) * exp(-3.0 * depthFromTop);
    return horizontalFalloff * verticalFalloff + softPool * 0.28;
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);

    vec3 warmLight = normalize(vec3(-0.46, 0.58, 1.0));
    vec3 coolLight = normalize(vec3(0.62, 0.36, 1.0));
    float warmReflection = pow(
      max(dot(normal, normalize(warmLight + viewDirection)), 0.0),
      15.0
    );
    float coolReflection = pow(
      max(dot(normal, normalize(coolLight + viewDirection)), 0.0),
      22.0
    );

    float viewingAngle = acos(clamp(facing, 0.0001, 1.0));
    float gainCurve = exp(
      -0.69314718 * pow(viewingAngle / uHalfGainAngle, 2.0)
    );
    float gainStrength = clamp((uGain - 1.0) / 2.0, 0.0, 1.0);
    float screenGain =
      mix(0.78, 0.62, gainStrength) +
      gainCurve * mix(0.22, 0.38, gainStrength);
    float edgeFalloff = 1.0 - length(vUv - vec2(0.5)) * 0.025;
    vec2 grainCell = floor(vUv * vec2(1480.0, 940.0));
    float grainNoise = hash21(grainCell);
    float grain = (grainNoise - 0.5) * 0.022;
    float sparkle = pow(grainNoise, 24.0) * 0.075;

    float depthFromTop = 1.0 - vUv.y;
    float topWash =
      topSpotlight(0.18, depthFromTop) +
      topSpotlight(0.50, depthFromTop) * 1.08 +
      topSpotlight(0.82, depthFromTop);

    float highlightCenter =
      0.5 + clamp(viewDirection.x * 0.72, -0.24, 0.24);
    float movingSheen = exp(
      -4.2 * pow((vUv.x - highlightCenter) / 0.24, 2.0)
    );
    float grazingSheen = pow(1.0 - facing, 1.6);

    float luminance =
      0.34 * screenGain * edgeFalloff +
      warmReflection * 0.19 +
      coolReflection * 0.13 +
      movingSheen * 0.115 +
      grazingSheen * 0.08 +
      topWash * 0.22 +
      grain +
      sparkle;

    // Digital perforations account for roughly 4.16% open area. At normal
    // seating distances they affect reflectance, not as individually visible dots.
    luminance *= uReflectiveArea;

    vec3 silver = vec3(0.79, 0.82, 0.83) * luminance;
    silver += vec3(0.17, 0.105, 0.055) * topWash;
    silver += vec3(0.055, 0.075, 0.095) * movingSheen;
    silver += vec3(0.035, 0.022, 0.012) * warmReflection;
    silver += vec3(0.012, 0.025, 0.045) * coolReflection;

    gl_FragColor = vec4(silver * clamp(uHouseLights, 0.0, 1.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function quaternionLookingAt(position: Vector3, target: Vector3) {
  const helper = new PerspectiveCamera();
  helper.position.copy(position);
  helper.up.copy(upVector);
  helper.lookAt(target);
  return helper.quaternion.clone();
}

function createCurvedScreenGeometry(
  width: number,
  height: number,
  curveDepth: number,
) {
  const geometry = new PlaneGeometry(width, height, 56, 18);
  const position = geometry.getAttribute("position");

  for (let index = 0; index < position.count; index += 1) {
    const normalizedX = position.getX(index) / (width / 2);
    position.setZ(index, curveDepth * normalizedX * normalizedX);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCinemaSeatBackGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.34, -0.58);
  shape.quadraticCurveTo(-0.43, -0.52, -0.44, -0.36);
  shape.quadraticCurveTo(-0.46, 0.1, -0.48, 0.4);
  shape.quadraticCurveTo(-0.47, 0.56, -0.32, 0.61);
  shape.quadraticCurveTo(0, 0.68, 0.32, 0.61);
  shape.quadraticCurveTo(0.47, 0.56, 0.48, 0.4);
  shape.quadraticCurveTo(0.46, 0.1, 0.44, -0.36);
  shape.quadraticCurveTo(0.43, -0.52, 0.34, -0.58);
  shape.quadraticCurveTo(0, -0.63, -0.34, -0.58);

  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.22,
    steps: 1,
    curveSegments: 8,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.045,
    bevelThickness: 0.035,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 白瓷砖影城专用：程序化生成 PBR 多层瓷砖贴图
 * 通过 HTML5 Canvas 离屏绘制，输出 baseColor / bumpMap / roughnessMap 三层纹理，
 * 用 PBR 材质贴到单面墙上即可获得精细瓷砖质感，无需堆叠 box/plane 几何体。
 *
 * 优化版（v2）：
 * - tilesPerSide 24 → 48（更细密，每块约 2cm 真实边长）
 * - bumpMap 增加对比度（勾缝更深 / 瓷砖面更亮）
 * - baseMap 减淡石材云纹，避免反射后"全白一片"
 */
function createWhiteTileTextures() {
  const size = 1024;
  const tilesPerSide = 48;
  const gapPx = 3;
  const cell = size / tilesPerSide;

  function makeCanvas() {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("CanvasTexture context unavailable");
    return { c, ctx };
  }

  // 1. Base Color - 米白瓷砖
  const { c: baseCanvas, ctx: baseCtx } = makeCanvas();
  baseCtx.fillStyle = "#ecead9";
  baseCtx.fillRect(0, 0, size, size);
  // 极淡的石材云纹
  for (let i = 0; i < 400; i++) {
    baseCtx.fillStyle = `rgba(60, 70, 80, ${0.015 + Math.random() * 0.025})`;
    baseCtx.fillRect(
      Math.random() * size,
      Math.random() * size,
      1 + Math.random() * 1.5,
      1 + Math.random() * 1.5,
    );
  }
  // 勾缝 (深灰)
  baseCtx.fillStyle = "#7d8088";
  for (let i = 0; i < tilesPerSide; i++) {
    baseCtx.fillRect(Math.round(i * cell) - gapPx / 2, 0, gapPx, size);
    baseCtx.fillRect(0, Math.round(i * cell) - gapPx / 2, size, gapPx);
  }
  const baseMap = new CanvasTexture(baseCanvas);
  baseMap.wrapS = baseMap.wrapT = RepeatWrapping;
  baseMap.colorSpace = SRGBColorSpace;
  baseMap.anisotropy = 16;
  baseMap.needsUpdate = true;

  // 2. Bump Map - 瓷砖面凸 / 勾缝凹（强烈对比，避免被反射遮盖）
  const { c: bumpCanvas, ctx: bumpCtx } = makeCanvas();
  bumpCtx.fillStyle = "#f4f4f4";
  bumpCtx.fillRect(0, 0, size, size);
  // 每块瓷砖上加微妙反光梯度
  for (let i = 0; i < tilesPerSide; i++) {
    for (let j = 0; j < tilesPerSide; j++) {
      const x = Math.round(i * cell) + gapPx;
      const y = Math.round(j * cell) + gapPx;
      const w = cell - gapPx;
      const g = bumpCtx.createLinearGradient(x, y, x + w, y + w);
      g.addColorStop(0, "#fafafa");
      g.addColorStop(0.5, "#dedede");
      g.addColorStop(1, "#f4f4f4");
      bumpCtx.fillStyle = g;
      bumpCtx.fillRect(x, y, w, w);
    }
  }
  // 勾缝（暗）= 低 = 凹（更暗）
  bumpCtx.fillStyle = "#444";
  for (let i = 0; i < tilesPerSide; i++) {
    bumpCtx.fillRect(Math.round(i * cell) - gapPx / 2, 0, gapPx, size);
    bumpCtx.fillRect(0, Math.round(i * cell) - gapPx / 2, size, gapPx);
  }
  // 边缘微凸白条 (瓷砖面包边感)
  bumpCtx.strokeStyle = "#ffffff";
  bumpCtx.lineWidth = 1;
  for (let i = 0; i < tilesPerSide; i++) {
    for (let j = 0; j < tilesPerSide; j++) {
      const x = Math.round(i * cell) + gapPx;
      const y = Math.round(j * cell) + gapPx;
      const w = cell - gapPx;
      bumpCtx.strokeRect(x + 0.5, y + 0.5, w - 1, w - 1);
    }
  }
  const bumpMap = new CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = RepeatWrapping;
  bumpMap.anisotropy = 16;
  bumpMap.needsUpdate = true;

  // 3. Roughness Map - 瓷砖面光滑 / 勾缝粗糙
  const { c: roughCanvas, ctx: roughCtx } = makeCanvas();
  roughCtx.fillStyle = "#5a5a5a";
  roughCtx.fillRect(0, 0, size, size);
  roughCtx.fillStyle = "#d8d8d8";
  for (let i = 0; i < tilesPerSide; i++) {
    roughCtx.fillRect(Math.round(i * cell) - gapPx / 2, 0, gapPx, size);
    roughCtx.fillRect(0, Math.round(i * cell) - gapPx / 2, size, gapPx);
  }
  const roughnessMap = new CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = RepeatWrapping;
  roughnessMap.anisotropy = 16;
  roughnessMap.needsUpdate = true;

  return { baseMap, bumpMap, roughnessMap };
}

/**
 * 米色地板瓷砖（中等大小方格）
 */
function createWhiteFloorTexture() {
  const size = 1024;
  const tilesPerSide = 12;
  const gapPx = 5;
  const cell = size / tilesPerSide;

  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("CanvasTexture context unavailable");

  // 白色大格瓷砖（用作第十二主题墙面）
  ctx.fillStyle = "#f6f5ef";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(70, 80, 90, ${0.02 + Math.random() * 0.03})`;
    ctx.fillRect(
      Math.random() * size,
      Math.random() * size,
      1 + Math.random() * 2,
      1 + Math.random() * 2,
    );
  }
  ctx.fillStyle = "#8a8d95";
  for (let i = 0; i < tilesPerSide; i++) {
    ctx.fillRect(Math.round(i * cell) - gapPx / 2, 0, gapPx, size);
    ctx.fillRect(0, Math.round(i * cell) - gapPx / 2, size, gapPx);
  }

  const baseMap = new CanvasTexture(c);
  baseMap.wrapS = baseMap.wrapT = RepeatWrapping;
  baseMap.colorSpace = SRGBColorSpace;
  baseMap.anisotropy = 16;
  baseMap.needsUpdate = true;

  return { baseMap };
}

/**
 * 白色细密方格纹理（仿帕尔影城地板视觉，CanvasTexture 绘制）
 */
function createWhiteFineGridTexture() {
  const size = 1024;
  const bigTilesPerSide = 4; // 大方格 4x4
  const smallTilesPerBig = 4; // 每个大方格内 4x4=16 个小格
  const bigCell = size / bigTilesPerSide; // 256
  const smallCell = bigCell / smallTilesPerBig; // 64
  const smallGapPx = 2;
  const bigGapPx = 5;

  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("CanvasTexture context unavailable");

  // 白色基色
  ctx.fillStyle = "#fafaf6";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 250; i++) {
    ctx.fillStyle = `rgba(70, 70, 70, ${0.015 + Math.random() * 0.025})`;
    ctx.fillRect(
      Math.random() * size,
      Math.random() * size,
      1 + Math.random() * 1.5,
      1 + Math.random() * 1.5,
    );
  }

  // 1. 小格浅色勾缝（在每个大方格内部）
  ctx.fillStyle = "#6a6e75";
  for (let bx = 0; bx < bigTilesPerSide; bx++) {
    for (let by = 0; by < bigTilesPerSide; by++) {
      const ox = bx * bigCell;
      const oy = by * bigCell;
      for (let s = 1; s < smallTilesPerBig; s++) {
        ctx.fillRect(
          ox + s * smallCell - smallGapPx / 2,
          oy,
          smallGapPx,
          bigCell,
        );
        ctx.fillRect(
          ox,
          oy + s * smallCell - smallGapPx / 2,
          bigCell,
          smallGapPx,
        );
      }
    }
  }

  // 2. 大方格深色粗勾缝
  ctx.fillStyle = "#3d4045";
  for (let i = 1; i < bigTilesPerSide; i++) {
    ctx.fillRect(i * bigCell - bigGapPx / 2, 0, bigGapPx, size);
    ctx.fillRect(0, i * bigCell - bigGapPx / 2, size, bigGapPx);
  }

  const baseMap = new CanvasTexture(c);
  baseMap.wrapS = baseMap.wrapT = RepeatWrapping;
  baseMap.colorSpace = SRGBColorSpace;
  baseMap.anisotropy = 16;
  baseMap.needsUpdate = true;

  return { baseMap };
}

/**
 * 米色天花板纹理（纯色 + 极淡纹理）
 */
function createWhiteCeilingTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("CanvasTexture context unavailable");
  ctx.fillStyle = "#efe5d0";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(80, 70, 50, ${0.02 + Math.random() * 0.03})`;
    ctx.fillRect(
      Math.random() * 512,
      Math.random() * 512,
      1 + Math.random() * 1.5,
      1 + Math.random() * 1.5,
    );
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

type ScreenPoint = { x: number; y: number };

function quadTransform(
  [topLeft, topRight, bottomRight, bottomLeft]: [
    ScreenPoint,
    ScreenPoint,
    ScreenPoint,
    ScreenPoint,
  ],
  width: number,
  height: number,
) {
  const dx1 = topRight.x - bottomRight.x;
  const dy1 = topRight.y - bottomRight.y;
  const dx2 = bottomLeft.x - bottomRight.x;
  const dy2 = bottomLeft.y - bottomRight.y;
  const dx3 =
    topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy3 =
    topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const denominator = dx1 * dy2 - dx2 * dy1;

  if (Math.abs(denominator) < 0.0001) return null;

  const perspectiveX = (dx3 * dy2 - dx2 * dy3) / denominator;
  const perspectiveY = (dx1 * dy3 - dx3 * dy1) / denominator;
  const scaleX =
    topRight.x - topLeft.x + perspectiveX * topRight.x;
  const skewY =
    topRight.y - topLeft.y + perspectiveX * topRight.y;
  const skewX =
    bottomLeft.x - topLeft.x + perspectiveY * bottomLeft.x;
  const scaleY =
    bottomLeft.y - topLeft.y + perspectiveY * bottomLeft.y;

  return `matrix3d(
    ${scaleX / width}, ${skewY / width}, 0, ${perspectiveX / width},
    ${skewX / height}, ${scaleY / height}, 0, ${perspectiveY / height},
    0, 0, 1, 0,
    ${topLeft.x}, ${topLeft.y}, 0, 1
  )`;
}

function ScreenMediaOverlayTracker({
  auditorium,
  active,
  overlayRef,
}: Pick<CinemaSceneProps, "auditorium"> & {
  active: boolean;
  overlayRef: React.RefObject<HTMLDivElement | null>;
}) {
  const lastCamKeyRef = useRef("");
  const corners = useMemo(
    () => [
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
    ],
    [],
  );

  useFrame(({ camera, size }) => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    if (!active) {
      if (overlay.style.visibility !== "hidden") {
        overlay.style.visibility = "hidden";
      }
      return;
    }

    const camKey = `${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)},${camera.quaternion.x.toFixed(2)},${camera.quaternion.y.toFixed(2)},${camera.quaternion.z.toFixed(2)},${size.width},${size.height}`;
    if (lastCamKeyRef.current === camKey) {
      return;
    }
    lastCamKeyRef.current = camKey;

    const centerY =
      auditorium.screenBottom + auditorium.screenHeight / 2;
    const edgeZ =
      auditorium.screenZ +
      0.09 +
      auditorium.screenSurface.curvatureDepth;
    const halfWidth = auditorium.screenWidth / 2;
    const halfHeight = auditorium.screenHeight / 2;

    corners[0].set(-halfWidth, centerY + halfHeight, edgeZ);
    corners[1].set(halfWidth, centerY + halfHeight, edgeZ);
    corners[2].set(halfWidth, centerY - halfHeight, edgeZ);
    corners[3].set(-halfWidth, centerY - halfHeight, edgeZ);

    const projected = corners.map((corner) => {
      corner.project(camera);
      return {
        x: (corner.x * 0.5 + 0.5) * size.width,
        y: (-corner.y * 0.5 + 0.5) * size.height,
        z: corner.z,
      };
    });

    if (projected.some((point) => point.z < -1 || point.z > 1)) {
      overlay.style.visibility = "hidden";
      return;
    }

    const transform = quadTransform(
      [
        projected[0],
        projected[1],
        projected[2],
        projected[3],
      ],
      screenOverlayWidth,
      screenOverlayHeight,
    );

    if (!transform) {
      overlay.style.visibility = "hidden";
      return;
    }

    overlay.style.visibility = "visible";
    overlay.style.transform = transform;
  });

  return null;
}

function CameraRig({
  auditorium,
  selectedSeat,
  viewCommand,
  cameraPreset = "seat",
  freeMove = idleFreeMove,
}: Pick<
  CinemaSceneProps,
  | "auditorium"
  | "selectedSeat"
  | "viewCommand"
  | "cameraPreset"
  | "freeMove"
>) {
  const { camera, gl, size } = useThree();
  const desiredPosition = useRef(new Vector3());
  const desiredEuler = useRef(new Euler(0, 0, 0, "YXZ"));
  const desiredQuaternion = useRef(new Quaternion());
  const lastPointer = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const wasFreeMode = useRef(false);

  useEffect(() => {
    const lastRowZ =
      auditorium.firstRowZ +
      (auditorium.rowCount - 1) * auditorium.rowSpacing;
    const roomDepth = lastRowZ - auditorium.screenZ + 14;
    const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
    const roomHeight = Math.max(
      16,
      auditorium.screenBottom + auditorium.screenHeight + 4,
    );
    const screenCenterY = auditorium.screenBottom + auditorium.screenHeight / 2;

    const position = new Vector3();
    const target = new Vector3();

    switch (cameraPreset) {
      case "rear_center":
        // 后排高视角，俯瞰全厅与完整银幕
        position.set(0, auditorium.screenBottom + auditorium.screenHeight * 0.72, lastRowZ + 4.5);
        target.set(0, auditorium.screenBottom + auditorium.screenHeight * 0.35, auditorium.screenZ);
        break;

      case "front_row":
        // 前排低角度仰视，感受震撼巨幕包围感
        position.set(0, 1.25, auditorium.firstRowZ - 1.5);
        target.set(0, auditorium.screenBottom + auditorium.screenHeight * 0.6, auditorium.screenZ);
        break;

      case "stage_view":
        // 银幕舞台反向视角，反看全厅阶梯座位与空间结构
        position.set(0, auditorium.screenBottom + 2.2, auditorium.screenZ + 1.5);
        target.set(0, 3.2, (auditorium.firstRowZ + lastRowZ) / 2);
        break;

      case "birds_eye":
        // 顶部鸟瞰空间透视
        position.set(0, roomHeight + 8, roomCenterZ + 4);
        target.set(0, 1.5, (auditorium.screenZ + lastRowZ) / 2);
        break;

      case "side_angle":
        // 侧翼45度斜角透视
        position.set(auditorium.seatingWidth * 0.75 + 5, 7.5, roomCenterZ + 2);
        target.set(0, screenCenterY * 0.8, (auditorium.screenZ + auditorium.firstRowZ) / 2);
        break;

      case "free": {
        // 自由视角：保持当前视线，仅当首次进入时锚定座位附近
        if (!wasFreeMode.current) {
          position.set(
            selectedSeat.x,
            getSeatEyeY(selectedSeat),
            selectedSeat.z + 3,
          );
          target.set(0, screenCenterY, auditorium.screenZ);
        } else {
          position.copy(camera.position);
          target.copy(camera.position).add(new Vector3(0, 0, -4));
        }
        break;
      }

      case "seat":
      default:
        // 第一人称当前选择座位视角
        position.set(
          selectedSeat.x,
          getSeatEyeY(selectedSeat),
          selectedSeat.z,
        );
        target.set(0, screenCenterY, auditorium.screenZ);
        break;
    }

    const quaternion = quaternionLookingAt(position, target);

    desiredPosition.current.copy(position);
    desiredQuaternion.current.copy(quaternion);
    desiredEuler.current.setFromQuaternion(quaternion, "YXZ");

    if (camera instanceof PerspectiveCamera) {
      camera.fov = verticalFovForAspect(size.width / size.height);
      camera.updateProjectionMatrix();
    }

    wasFreeMode.current = cameraPreset === "free";
  }, [auditorium, camera, selectedSeat, size.height, size.width, cameraPreset]);

  useEffect(() => {
    if (viewCommand.token === 0) return;
    desiredEuler.current.y += viewCommand.yaw;
    desiredEuler.current.x = Math.max(
      -1.25,
      Math.min(1.25, desiredEuler.current.x + viewCommand.pitch),
    );
    desiredQuaternion.current.setFromEuler(desiredEuler.current);
  }, [viewCommand]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      desiredQuaternion.current.copy(camera.quaternion);
      desiredEuler.current.setFromQuaternion(camera.quaternion, "YXZ");
      dragging.current = true;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      event.preventDefault();
      event.stopPropagation();
      const deltaX = event.clientX - lastPointer.current.x;
      const deltaY = event.clientY - lastPointer.current.y;
      lastPointer.current = { x: event.clientX, y: event.clientY };

      desiredEuler.current.y += deltaX * 0.004;
      desiredEuler.current.x = Math.max(
        -1.25,
        Math.min(1.25, desiredEuler.current.x + deltaY * 0.004),
      );
      desiredQuaternion.current.setFromEuler(desiredEuler.current);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragging.current) {
        event.preventDefault();
        event.stopPropagation();
      }
      dragging.current = false;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.style.cursor = "grab";
    };

    const onLostPointerCapture = () => {
      dragging.current = false;
      canvas.style.cursor = "grab";
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: false });
    canvas.addEventListener("lostpointercapture", onLostPointerCapture);

    return () => {
      canvas.style.cursor = "";
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const transitionFactor = 1 - Math.exp(-5.3 * delta);

    if (cameraPreset === "free") {
      const moveSpeed = 6.5;
      const yaw = desiredEuler.current.y;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const forward = new Vector3(-sin, 0, -cos);
      const right = new Vector3(cos, 0, -sin);

      if (freeMove.forward) {
        desiredPosition.current.addScaledVector(forward, moveSpeed * delta);
      }
      if (freeMove.back) {
        desiredPosition.current.addScaledVector(forward, -moveSpeed * delta);
      }
      if (freeMove.left) {
        desiredPosition.current.addScaledVector(right, -moveSpeed * delta);
      }
      if (freeMove.right) {
        desiredPosition.current.addScaledVector(right, moveSpeed * delta);
      }
      if (freeMove.up) {
        desiredPosition.current.y += moveSpeed * delta;
      }
      if (freeMove.down) {
        desiredPosition.current.y -= moveSpeed * delta;
      }

      // Clamp free camera inside the room bounds
      const lastRowZ =
        auditorium.firstRowZ + (auditorium.rowCount - 1) * auditorium.rowSpacing;
      const maxX = Math.max(auditorium.seatingWidth / 2 + 6, 22);
      const minY = 0.8;
      const maxY = Math.max(
        16,
        auditorium.screenBottom + auditorium.screenHeight + 3,
      );
      const minZ = auditorium.screenZ + 2;
      const maxZ = lastRowZ + 10;

      desiredPosition.current.x = Math.max(
        -maxX,
        Math.min(maxX, desiredPosition.current.x),
      );
      desiredPosition.current.y = Math.max(
        minY,
        Math.min(maxY, desiredPosition.current.y),
      );
      desiredPosition.current.z = Math.max(
        minZ,
        Math.min(maxZ, desiredPosition.current.z),
      );
    }

    camera.position.lerp(desiredPosition.current, transitionFactor);

    if (dragging.current) {
      camera.quaternion.copy(desiredQuaternion.current);
      return;
    }

    camera.quaternion.slerp(desiredQuaternion.current, transitionFactor);
  });

  return null;
}

function ScreenSurface({
  auditorium,
  blackout,
}: Pick<CinemaSceneProps, "auditorium"> & { blackout: boolean }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const [uniforms] = useState(
    () => ({
      uGain: { value: auditorium.screenSurface.gain },
      uHalfGainAngle: {
        value: (auditorium.screenSurface.halfGainAngle * Math.PI) / 180,
      },
      uReflectiveArea: {
        value: 1 - auditorium.screenSurface.openAreaPercent / 100,
      },
      uHouseLights: { value: blackout ? 0 : 1 },
    }),
  );
  const geometry = useMemo(
    () =>
      createCurvedScreenGeometry(
        auditorium.screenWidth,
        auditorium.screenHeight,
        auditorium.screenSurface.curvatureDepth,
      ),
    [
      auditorium.screenHeight,
      auditorium.screenSurface.curvatureDepth,
      auditorium.screenWidth,
    ],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    uniforms.uGain.value = auditorium.screenSurface.gain;
    uniforms.uHalfGainAngle.value =
      (auditorium.screenSurface.halfGainAngle * Math.PI) / 180;
    uniforms.uReflectiveArea.value =
      1 - auditorium.screenSurface.openAreaPercent / 100;
  }, [
    auditorium.screenSurface.gain,
    auditorium.screenSurface.halfGainAngle,
    auditorium.screenSurface.openAreaPercent,
    uniforms,
  ]);
  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    const target = blackout ? 0 : 1;
    material.uniforms.uHouseLights.value +=
      (target - material.uniforms.uHouseLights.value) * smoothFactor(delta);
  });

  return (
    <mesh
      position={[
        0,
        auditorium.screenBottom + auditorium.screenHeight / 2,
        auditorium.screenZ + 0.065,
      ]}
    >
      <primitive object={geometry} attach="geometry" />
      <shaderMaterial
        ref={materialRef}
        vertexShader={silverScreenVertexShader}
        fragmentShader={silverScreenFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

const screenFitVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const screenFitFragmentShader = `
  uniform sampler2D uMap;
  uniform vec2 uScale;
  varying vec2 vUv;

  void main() {
    vec2 st = (vUv - vec2(0.5)) / uScale + vec2(0.5);
    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      gl_FragColor = texture2D(uMap, st);
    }
  }
`;

function VideoSurface({
  auditorium,
  active,
  playing,
  videoSrc,
  playbackRate = 1.0,
  fitMode = "contain",
  audioMode = "original",
  volume = 1.0,
  seekTime,
  skipTailSeconds = 0,
  onTimeUpdate,
  onReady,
}: Pick<
  CinemaSceneProps,
  | "auditorium"
  | "playing"
  | "videoSrc"
  | "playbackRate"
  | "fitMode"
  | "audioMode"
  | "volume"
  | "seekTime"
  | "skipTailSeconds"
  | "onTimeUpdate"
> & {
  active: boolean;
  onReady: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const leftPannerRef = useRef<StereoPannerNode | null>(null);
  const rightPannerRef = useRef<StereoPannerNode | null>(null);
  const [videoAspect, setVideoAspect] = useState<number>(16 / 9);

  const texture = useMemo(() => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";

    const nextTexture = new VideoTexture(video);
    nextTexture.colorSpace = SRGBColorSpace;
    return nextTexture;
  }, []);

  useEffect(() => {
    if (texture?.image) {
      videoRef.current = texture.image as HTMLVideoElement;
    }
  }, [texture]);

  // Set initial or updated video src
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const targetSrc =
      videoSrc || `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/imax-countdown.mp4`;
    const currentAttr = video.getAttribute("src");
    if (currentAttr !== targetSrc && video.src !== targetSrc) {
      video.setAttribute("src", targetSrc);
      video.load();
    }
  }, [videoSrc]);

  // Video metadata & time update listeners with skipTailSeconds support
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      if (video.videoWidth && video.videoHeight) {
        setVideoAspect(video.videoWidth / video.videoHeight);
      }
      if (onTimeUpdate) {
        onTimeUpdate(video.currentTime, video.duration || 0);
      }
    };

    if (video.videoWidth && video.videoHeight) {
      handleLoadedMetadata();
    }

    const handleTimeUpdate = () => {
      const cur = video.currentTime;
      const dur = video.duration || 0;
      if (skipTailSeconds > 0 && dur > skipTailSeconds + 0.5) {
        if (cur >= dur - skipTailSeconds) {
          video.currentTime = 0;
          if (onTimeUpdate) {
            onTimeUpdate(0, dur);
          }
          return;
        }
      }
      if (onTimeUpdate) {
        onTimeUpdate(cur, dur);
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleLoadedMetadata);
    video.addEventListener("resize", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleLoadedMetadata);
      video.removeEventListener("resize", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [onTimeUpdate, skipTailSeconds]);

  // Frame-precise tail skip check
  useFrame(() => {
    const video = videoRef.current;
    if (!video || !playing) return;
    const dur = video.duration || 0;
    if (skipTailSeconds > 0 && dur > skipTailSeconds + 0.5) {
      if (video.currentTime >= dur - skipTailSeconds) {
        video.currentTime = 0;
      }
    }
  });

  // Playback rate
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  // Seek time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || seekTime === null || seekTime === undefined) return;
    if (Math.abs(video.currentTime - seekTime) > 0.3) {
      video.currentTime = seekTime;
    }
  }, [seekTime]);

  // Update Web Audio volume dynamically (0.0 to 2.0 = 0% to 200%)
  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      const ctx = audioContextRef.current;
      gainNodeRef.current.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    }
  }, [volume]);

  // Audio mode & Web Audio API graph setup (0-200% gain + DynamicsCompressor protection)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (active && playing && !video.muted) {
      if (!audioContextRef.current) {
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioContextRef.current = ctx;
            const source = ctx.createMediaElementSource(video);
            audioSourceRef.current = source;

            // Gain node for 0-200% volume
            const gainNode = ctx.createGain();
            gainNode.gain.value = volume;
            gainNodeRef.current = gainNode;

            // Compressor node to prevent digital clipping at high gain
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-18, ctx.currentTime);
            compressor.knee.setValueAtTime(24, ctx.currentTime);
            compressor.ratio.setValueAtTime(12, ctx.currentTime);
            compressor.attack.setValueAtTime(0.003, ctx.currentTime);
            compressor.release.setValueAtTime(0.2, ctx.currentTime);
            compressorRef.current = compressor;

            if (ctx.createStereoPanner) {
              const lPanner = ctx.createStereoPanner();
              lPanner.pan.setValueAtTime(-0.6, ctx.currentTime);
              const rPanner = ctx.createStereoPanner();
              rPanner.pan.setValueAtTime(0.6, ctx.currentTime);

              leftPannerRef.current = lPanner;
              rightPannerRef.current = rPanner;
            }
          }
        } catch {
          // Fallback to default HTML5 audio
        }
      }

      if (audioContextRef.current?.state === "suspended") {
        void audioContextRef.current.resume();
      }

      const ctx = audioContextRef.current;
      const source = audioSourceRef.current;
      const gainNode = gainNodeRef.current;
      const compressor = compressorRef.current;

      if (ctx && source && gainNode && compressor) {
        try {
          source.disconnect();
          gainNode.disconnect();
          compressor.disconnect();

          // Connect source -> gainNode -> compressor
          source.connect(gainNode);
          gainNode.connect(compressor);

          if (
            audioMode === "cinema_spatial" &&
            leftPannerRef.current &&
            rightPannerRef.current
          ) {
            const lPanner = leftPannerRef.current;
            const rPanner = rightPannerRef.current;
            try {
              lPanner.disconnect();
              rPanner.disconnect();
            } catch {
              // Ignore if not connected
            }

            // Split gain (0.5x) to prevent dual-path summation clipping/crackling on mobile speakers
            const splitGain = ctx.createGain();
            splitGain.gain.setValueAtTime(0.5, ctx.currentTime);

            const lDelay = ctx.createDelay();
            lDelay.delayTime.setValueAtTime(0.003, ctx.currentTime);
            const rDelay = ctx.createDelay();
            rDelay.delayTime.setValueAtTime(0.003, ctx.currentTime);

            compressor.connect(splitGain);
            splitGain.connect(lDelay);
            lDelay.connect(lPanner);
            lPanner.connect(ctx.destination);

            splitGain.connect(rDelay);
            rDelay.connect(rPanner);
            rPanner.connect(ctx.destination);
          } else {
            compressor.connect(ctx.destination);
          }
        } catch {
          // Ignore connection errors
        }
      }
    }
  }, [active, audioMode, playing, volume]);

  // Clean up
  useEffect(() => {
    const video = texture.image as HTMLVideoElement;
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, [texture]);

  // Video play / pause state
  useEffect(() => {
    const video = texture.image as HTMLVideoElement;
    let frameCallbackId: number | null = null;
    let firstFrameReported = false;

    const reportFirstFrame = () => {
      if (!active || !playing || firstFrameReported) return;
      firstFrameReported = true;
      onReady();
    };
    const waitForPaintedFrame = () => {
      if (!active || !playing || firstFrameReported) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        if (frameCallbackId !== null) return;
        frameCallbackId = video.requestVideoFrameCallback(() => {
          frameCallbackId = null;
          reportFirstFrame();
        });
      } else if (video.currentTime > 0) {
        reportFirstFrame();
      }
    };

    video.addEventListener("playing", waitForPaintedFrame);
    video.addEventListener("timeupdate", waitForPaintedFrame);

    if (active && playing) {
      video.muted = false;
      void video.play().then(waitForPaintedFrame).catch(() => undefined);
    } else {
      video.pause();
    }

    return () => {
      video.removeEventListener("playing", waitForPaintedFrame);
      video.removeEventListener("timeupdate", waitForPaintedFrame);
      if (
        frameCallbackId !== null &&
        typeof video.cancelVideoFrameCallback === "function"
      ) {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
    };
  }, [active, onReady, playing, texture]);

  // Mapping scale & offset for 5 Screen Fit Modes: contain, fill, cover, height, vertical
  const screenAspect = auditorium.screenWidth / auditorium.screenHeight;

  const materialRef = useRef<ShaderMaterial | null>(null);

  const [uniforms] = useState(() => ({
    uMap: { value: texture },
    uScale: { value: new Vector2(1.0, 1.0) },
    uOffset: { value: new Vector2(0.0, 0.0) },
  }));

  const meshScale = useMemo<[number, number, number]>(() => [1, 1, 1], []);

  useEffect(() => {
    uniforms.uMap.value = texture;
  }, [texture, uniforms]);

  useEffect(() => {
    const vAspect = videoAspect || 16 / 9;
    const sAspect = screenAspect || 16 / 9;

    let targetAspect = sAspect;
    if (fitMode === "fit_screen" || fitMode === "contain") {
      targetAspect = sAspect;
    } else if (fitMode === "original") {
      targetAspect = vAspect;
    } else if (fitMode === "16_9") {
      targetAspect = 16 / 9;
    } else if (fitMode === "4_3") {
      targetAspect = 4 / 3;
    } else if (fitMode === "4_9") {
      targetAspect = 4 / 9;
    } else if (fitMode === "9_16" || fitMode === "vertical") {
      targetAspect = 9 / 16;
    } else if (fitMode === "16_10") {
      targetAspect = 16 / 10;
    } else if (fitMode === "fill") {
      if (materialRef.current) {
        materialRef.current.uniforms.uScale.value.set(1.0, 1.0);
        materialRef.current.uniformsNeedUpdate = true;
      } else {
        uniforms.uScale.value.set(1.0, 1.0);
      }
      return;
    } else if (fitMode === "height" || fitMode === "align_height") {
      targetAspect = 2.39;
    } else {
      targetAspect = vAspect;
    }

    let scaleX = 1.0;
    let scaleY = 1.0;

    if (targetAspect > sAspect) {
      scaleX = 1.0;
      scaleY = sAspect / targetAspect;
    } else {
      scaleX = targetAspect / sAspect;
      scaleY = 1.0;
    }

    if (materialRef.current) {
      materialRef.current.uniforms.uScale.value.set(scaleX, scaleY);
      materialRef.current.uniformsNeedUpdate = true;
    } else {
      uniforms.uScale.value.set(scaleX, scaleY);
    }
  }, [fitMode, screenAspect, uniforms, videoAspect]);

  const geometry = useMemo(
    () =>
      createCurvedScreenGeometry(
        auditorium.screenWidth,
        auditorium.screenHeight,
        auditorium.screenSurface.curvatureDepth,
      ),
    [
      auditorium.screenHeight,
      auditorium.screenSurface.curvatureDepth,
      auditorium.screenWidth,
    ],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      visible={active}
      scale={meshScale}
      position={[
        0,
        auditorium.screenBottom + auditorium.screenHeight / 2,
        auditorium.screenZ + 0.085,
      ]}
    >
      <primitive object={geometry} attach="geometry" />
      <shaderMaterial
        ref={materialRef}
        vertexShader={screenFitVertexShader}
        fragmentShader={screenFitFragmentShader}
        uniforms={uniforms}
        toneMapped={false}
      />
    </mesh>
  );
}

function Screen({
  auditorium,
  filmMode,
  sceneStyle = "classic",
  playing,
  videoSrc,
  playbackRate,
  fitMode,
  audioMode,
  volume,
  seekTime,
  skipTailSeconds,
  onTimeUpdate,
  onFilmReady,
}: Pick<
  CinemaSceneProps,
  | "auditorium"
  | "filmMode"
  | "sceneStyle"
  | "playing"
  | "videoSrc"
  | "playbackRate"
  | "fitMode"
  | "audioMode"
  | "volume"
  | "seekTime"
  | "skipTailSeconds"
  | "onTimeUpdate"
> & { onFilmReady: () => void }) {
  const centerY = auditorium.screenBottom + auditorium.screenHeight / 2;
  const screenTop = auditorium.screenBottom + auditorium.screenHeight;
  const workLightOffsets = [-0.32, 0, 0.32];
  const workLightRefs = useRef<Array<SpotLight | null>>([]);
  const bulbMaterialRefs = useRef<Array<MeshBasicMaterial | null>>([]);
  const filmBounceRef = useRef<PointLight>(null);
  const screenSurroundMaterialRef = useRef<MeshPhysicalMaterial>(null);
  const screenSurroundLitColor = useMemo(
    () => new Color(sceneStyle === "snowy_greek" ? "#1e293b" : "#111315"),
    [sceneStyle],
  );
  const screenSurroundDarkColor = useMemo(
    () => new Color(sceneStyle === "snowy_greek" ? "#0f172a" : "#000000"),
    [sceneStyle],
  );
  const [initialHouseLights] = useState(() => (filmMode ? 0 : 1));

  useFrame((_, delta) => {
    const factor = smoothFactor(delta);
    const workLightTarget = filmMode ? 0 : 310;
    const bulbTarget = filmMode ? 0 : 1;

    workLightRefs.current.forEach((light) => {
      if (light) {
        light.intensity += (workLightTarget - light.intensity) * factor;
      }
    });
    bulbMaterialRefs.current.forEach((material) => {
      if (material) {
        material.opacity += (bulbTarget - material.opacity) * factor;
      }
    });
    if (filmBounceRef.current) {
      const target = filmMode ? 130 : 0;
      filmBounceRef.current.intensity +=
        (target - filmBounceRef.current.intensity) * factor;
    }
    if (screenSurroundMaterialRef.current) {
      screenSurroundMaterialRef.current.color.lerp(
        filmMode ? screenSurroundDarkColor : screenSurroundLitColor,
        factor,
      );
    }
  });

  const isMinimalistCream = sceneStyle === "minimalist_cream";
  const surroundWidth = isMinimalistCream
    ? auditorium.screenWidth + 0.1
    : auditorium.screenWidth + 0.8;
  const surroundHeight = isMinimalistCream
    ? auditorium.screenHeight + 0.1
    : auditorium.screenHeight + 0.8;
  const surroundDepth = isMinimalistCream ? 0.04 : 0.3;
  const surroundZOffset = isMinimalistCream ? 0.02 : 0.1;

  return (
    <group>
      <mesh position={[0, centerY, auditorium.screenZ - surroundZOffset]}>
        <boxGeometry args={[surroundWidth, surroundHeight, surroundDepth]} />
        <meshPhysicalMaterial
          ref={screenSurroundMaterialRef}
          color={initialHouseLights ? "#111315" : "#000000"}
          roughness={1}
          metalness={0}
          specularIntensity={0}
        />
      </mesh>
      <ScreenSurface auditorium={auditorium} blackout={filmMode} />
      <VideoSurface
        auditorium={auditorium}
        active={playing}
        playing={playing}
        videoSrc={videoSrc}
        playbackRate={playbackRate}
        fitMode={fitMode}
        audioMode={audioMode}
        volume={volume}
        seekTime={seekTime}
        skipTailSeconds={skipTailSeconds}
        onTimeUpdate={onTimeUpdate}
        onReady={onFilmReady}
      />
      {workLightOffsets.map((offset, index) => {
        const lightX = auditorium.screenWidth * offset;
        return (
          <group key={offset}>
            <spotLight
              ref={(light) => {
                workLightRefs.current[index] = light;
              }}
              position={[
                lightX,
                screenTop + 1.1,
                auditorium.screenZ + 2.4,
              ]}
              target-position={[
                lightX,
                centerY - auditorium.screenHeight * 0.16,
                auditorium.screenZ,
              ]}
              angle={0.34}
              penumbra={0.82}
              intensity={310 * initialHouseLights}
              distance={auditorium.screenHeight + 9}
              decay={1.8}
              color="#ffd2a8"
            />
            <mesh
              position={[
                lightX,
                screenTop + 0.5,
                auditorium.screenZ + 0.58,
              ]}
            >
              <cylinderGeometry args={[0.13, 0.18, 0.28, 16]} />
              <meshStandardMaterial
                color="#15171a"
                roughness={0.3}
                metalness={0.82}
              />
            </mesh>
            <mesh
              position={[
                lightX,
                screenTop + 0.34,
                auditorium.screenZ + 0.58,
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[0.105, 16]} />
              <meshBasicMaterial
                ref={(material) => {
                  bulbMaterialRefs.current[index] = material;
                }}
                color="#ffd8b6"
                transparent
                opacity={initialHouseLights}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}
      <pointLight
        ref={filmBounceRef}
        position={[0, centerY - 1, auditorium.screenZ + 3]}
        color="#b9d5e5"
        intensity={130 * (1 - initialHouseLights)}
        distance={32}
        decay={2}
      />
    </group>
  );
}

function UrbanPlazaBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;

  return (
    <group>
      {/* City Midnight Sky Canvas */}
      <mesh position={[0, 45, baseZ - 65]}>
        <planeGeometry args={[320, 150]} />
        <meshBasicMaterial color="#080c1a" toneMapped={false} />
      </mesh>

      {/* Urban Glow Light Pollution Horizon */}
      <mesh position={[0, 16, baseZ - 64]}>
        <planeGeometry args={[320, 50]} />
        <meshBasicMaterial
          color="#1e293b"
          transparent
          opacity={0.6}
          toneMapped={false}
        />
      </mesh>

      {/* City Moon */}
      <mesh position={[-52, 65, baseZ - 60]}>
        <sphereGeometry args={[6, 32, 32]} />
        <meshBasicMaterial color="#fef08a" toneMapped={false} />
      </mesh>

      {/* Background Central High-rise Towers (高层公寓与摩天大楼群) */}
      {[
        { x: -55, h: 78, w: 22, d: 18, color: "#1e293b" },
        { x: -32, h: 90, w: 20, d: 20, color: "#0f172a" },
        { x: -12, h: 68, w: 18, d: 16, color: "#1e293b" },
        { x: 12, h: 84, w: 22, d: 18, color: "#0f172a" },
        { x: 35, h: 72, w: 20, d: 20, color: "#1e293b" },
        { x: 58, h: 88, w: 24, d: 22, color: "#0f172a" },
      ].map((b, idx) => (
        <group key={idx} position={[b.x, b.h / 2 - 2, baseZ - 52]}>
          {/* Main Building Body */}
          <mesh>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color={b.color} roughness={0.7} metalness={0.2} />
          </mesh>
          {/* Illuminated Windows (发光窗户方格矩阵) */}
          {Array.from({ length: 8 }, (_, rowIdx) => (
            <group key={rowIdx} position={[0, -b.h / 2 + 10 + rowIdx * 8, b.d / 2 + 0.1]}>
              {[-b.w / 3, 0, b.w / 3].map((wx, colIdx) => (
                <mesh key={colIdx} position={[wx, 0, 0]}>
                  <planeGeometry args={[b.w * 0.22, 3.2]} />
                  <meshBasicMaterial
                    color={(rowIdx + colIdx) % 3 === 0 ? "#fef08a" : (rowIdx + colIdx) % 2 === 0 ? "#bae6fd" : "#38bdf8"}
                    transparent
                    opacity={(rowIdx * 7 + colIdx * 3) % 5 === 0 ? 0.35 : 0.85}
                    toneMapped={false}
                  />
                </mesh>
              ))}
            </group>
          ))}
          {/* Roof Beacon Light (楼顶警示红灯) */}
          <mesh position={[0, b.h / 2 + 0.8, 0]}>
            <sphereGeometry args={[0.8, 16, 16]} />
            <meshBasicMaterial color="#ef4444" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Left Flanking Apartment Skyscrapers (左侧近景大厦公寓) */}
      {[
        { x: -75, zOff: -20, h: 95, w: 26 },
        { x: -82, zOff: 10, h: 85, w: 28 },
      ].map((b, idx) => (
        <group key={`left-b-${idx}`} position={[b.x, b.h / 2 - 2, baseZ + b.zOff]}>
          <mesh>
            <boxGeometry args={[b.w, b.h, 24]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
          {/* Flanking Windows */}
          {Array.from({ length: 9 }, (_, rIdx) => (
            <group key={rIdx} position={[b.w / 2 + 0.1, -b.h / 2 + 12 + rIdx * 8, 0]} rotation={[0, Math.PI / 2, 0]}>
              {[-6, 0, 6].map((wx, cIdx) => (
                <mesh key={cIdx} position={[wx, 0, 0]}>
                  <planeGeometry args={[3.8, 3.2]} />
                  <meshBasicMaterial
                    color={cIdx % 2 === 0 ? "#fef08a" : "#bae6fd"}
                    transparent
                    opacity={0.8}
                    toneMapped={false}
                  />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}

      {/* Right Flanking Apartment Skyscrapers (右侧近景大厦公寓) */}
      {[
        { x: 75, zOff: -20, h: 98, w: 26 },
        { x: 82, zOff: 10, h: 88, w: 28 },
      ].map((b, idx) => (
        <group key={`right-b-${idx}`} position={[b.x, b.h / 2 - 2, baseZ + b.zOff]}>
          <mesh>
            <boxGeometry args={[b.w, b.h, 24]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
          {/* Flanking Windows */}
          {Array.from({ length: 9 }, (_, rIdx) => (
            <group key={rIdx} position={[-b.w / 2 - 0.1, -b.h / 2 + 12 + rIdx * 8, 0]} rotation={[0, -Math.PI / 2, 0]}>
              {[-6, 0, 6].map((wx, cIdx) => (
                <mesh key={cIdx} position={[wx, 0, 0]}>
                  <planeGeometry args={[3.8, 3.2]} />
                  <meshBasicMaterial
                    color={cIdx % 2 === 0 ? "#fef08a" : "#93c5fd"}
                    transparent
                    opacity={0.8}
                    toneMapped={false}
                  />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function SnowMountainBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;

  return (
    <group>
      {/* European Sky Canvas (Clear Azure Alpine Sky behind Screen) */}
      <mesh position={[0, 48, baseZ - 65]}>
        <planeGeometry args={[320, 160]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>

      {/* Atmospheric Alpine Horizon Glow */}
      <mesh position={[0, 18, baseZ - 64]}>
        <planeGeometry args={[320, 60]} />
        <meshBasicMaterial
          color="#bae6fd"
          transparent
          opacity={0.65}
          toneMapped={false}
        />
      </mesh>

      {/* High Alpine Radiant Sun */}
      <mesh position={[42, 62, baseZ - 60]}>
        <sphereGeometry args={[7.5, 32, 32]} />
        <meshBasicMaterial color="#fffbe1" toneMapped={false} />
      </mesh>
      {/* Sun Atmosphere Corona Halo */}
      <mesh position={[42, 62, baseZ - 60.5]}>
        <sphereGeometry args={[14, 24, 24]} />
        <meshBasicMaterial
          color="#fef08a"
          transparent
          opacity={0.35}
          toneMapped={false}
        />
      </mesh>

      {/* Floating Alpine Clouds */}
      <group position={[-38, 54, baseZ - 56]}>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[8, 16, 16]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.88} roughness={0.9} />
        </mesh>
        <mesh position={[6, 2, 0]}>
          <sphereGeometry args={[6.5, 16, 16]} />
          <meshStandardMaterial color="#f8fafc" transparent opacity={0.85} roughness={0.9} />
        </mesh>
        <mesh position={[-6, -1, 0]}>
          <sphereGeometry args={[5.5, 16, 16]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.85} roughness={0.9} />
        </mesh>
      </group>

      <group position={[52, 48, baseZ - 54]}>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[7, 16, 16]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.85} roughness={0.9} />
        </mesh>
        <mesh position={[-5, 1, 0]}>
          <sphereGeometry args={[5.5, 16, 16]} />
          <meshStandardMaterial color="#f8fafc" transparent opacity={0.82} roughness={0.9} />
        </mesh>
      </group>

      {/* === European Highest Snow Mountain (Mont Blanc / 勃朗峰巨型连绵雪山群) === */}

      {/* Center Main Peak: Mont Blanc Summit (勃朗峰主峰) */}
      <group position={[0, 32, baseZ - 52]}>
        {/* Granite Rock Mountain Base Body */}
        <mesh>
          <coneGeometry args={[48, 72, 10]} />
          <meshStandardMaterial color="#334155" roughness={0.85} metalness={0.05} />
        </mesh>
        {/* Massive Majestic Glistering Snow Cap & Ice Cliff Top */}
        <mesh position={[0, 22, 0]}>
          <coneGeometry args={[36, 42, 10]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.25}
            metalness={0.05}
            emissive="#e0f2fe"
            emissiveIntensity={0.35}
          />
        </mesh>
        {/* Secondary Glacier Ice Ridges */}
        <mesh position={[0, 10, 2]}>
          <coneGeometry args={[28, 28, 8]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.3} emissive="#bae6fd" emissiveIntensity={0.2} />
        </mesh>
      </group>

      {/* Left Alpine Summit Peak (Aiguille du Midi / 南针峰群) */}
      <group position={[-46, 24, baseZ - 46]}>
        <mesh>
          <coneGeometry args={[38, 56, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
        <mesh position={[0, 16, 0]}>
          <coneGeometry args={[28, 32, 8]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.3}
            emissive="#e0f2fe"
            emissiveIntensity={0.25}
          />
        </mesh>
      </group>

      {/* Right Alpine Summit Peak (Grandes Jorasses / 大茹拉峰群) */}
      <group position={[48, 26, baseZ - 48]}>
        <mesh>
          <coneGeometry args={[40, 58, 8]} />
          <meshStandardMaterial color="#334155" roughness={0.88} />
        </mesh>
        <mesh position={[0, 18, 0]}>
          <coneGeometry args={[30, 32, 8]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.3}
            emissive="#e0f2fe"
            emissiveIntensity={0.25}
          />
        </mesh>
      </group>

      {/* Foreground Glacier Foothills & Snow Ridges */}
      <mesh position={[0, 4, baseZ - 36]}>
        <boxGeometry args={[190, 18, 16]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.7} metalness={0.02} />
      </mesh>
      <mesh position={[-30, 8, baseZ - 38]}>
        <coneGeometry args={[22, 22, 6]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[35, 9, baseZ - 39]}>
        <coneGeometry args={[24, 24, 6]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>

      {/* Flanking Ancient Greek Marble Columns */}
      {[-auditorium.screenWidth / 2 - 1.2, auditorium.screenWidth / 2 + 1.2].map((x, sideIdx) => (
        <group key={sideIdx} position={[x, auditorium.screenBottom + auditorium.screenHeight / 2, baseZ + 0.1]}>
          <mesh>
            <cylinderGeometry args={[0.45, 0.55, auditorium.screenHeight + 3, 16]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.05} />
          </mesh>
          <mesh position={[0, (auditorium.screenHeight + 3) / 2 + 0.3, 0]}>
            <boxGeometry args={[1.3, 0.6, 1.3]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.3} />
          </mesh>
          <mesh position={[0, -(auditorium.screenHeight + 3) / 2 - 0.3, 0]}>
            <boxGeometry args={[1.4, 0.6, 1.4]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Sun Light Source for Snow Mountain Peaks */}
      <directionalLight
        position={[40, 60, baseZ - 10]}
        intensity={1.8}
        color="#fffbeb"
      />
    </group>
  );
}

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 9999 + 1) * 10000;
  return x - Math.floor(x);
}



function SpaceStationBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;

  return (
    <group>
      <group position={[42, 38, baseZ - 52]}>
        <mesh>
          <sphereGeometry args={[28, 32, 32]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.6} metalness={0.2} emissive="#0284c7" emissiveIntensity={0.15} />
        </mesh>
        <mesh scale={[1.08, 1.08, 1.08]}>
          <sphereGeometry args={[28, 24, 24]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.25} toneMapped={false} />
        </mesh>
      </group>

      {[-12, 12].map((x, idx) => (
        <mesh key={idx} position={[x, 0.01, baseZ + 20]}>
          <boxGeometry args={[0.3, 0.02, 120]} />
          <meshBasicMaterial color="#06b6d4" toneMapped={false} />
        </mesh>
      ))}

      {[-auditorium.screenWidth / 2 - 1.2, auditorium.screenWidth / 2 + 1.2].map((x, sideIdx) => (
        <mesh key={sideIdx} position={[x, auditorium.screenBottom + auditorium.screenHeight / 2, baseZ + 0.1]}>
          <boxGeometry args={[0.8, auditorium.screenHeight + 3.2, 0.8]} />
          <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function AlpineDesertBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;

  return (
    <group>
      {/* Sky Canvas (Clear Azure Alpine Desert Sky) */}
      <mesh position={[0, 52, baseZ - 75]}>
        <planeGeometry args={[360, 180]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>

      {/* Warm Desert Horizon Atmospheric Glow */}
      <mesh position={[0, 20, baseZ - 74]}>
        <planeGeometry args={[360, 70]} />
        <meshBasicMaterial
          color="#bae6fd"
          transparent
          opacity={0.65}
          toneMapped={false}
        />
      </mesh>

      {/* Clear Bright Desert Sun */}
      <mesh position={[50, 72, baseZ - 68]}>
        <sphereGeometry args={[8.5, 32, 32]} />
        <meshBasicMaterial color="#fffae0" toneMapped={false} />
      </mesh>

      {/* Sun Atmosphere Corona Halo */}
      <mesh position={[50, 72, baseZ - 68.5]}>
        <sphereGeometry args={[16, 24, 24]} />
        <meshBasicMaterial
          color="#fef08a"
          transparent
          opacity={0.3}
          toneMapped={false}
        />
      </mesh>

      {/* === CENTRAL ICONIC SNOW-CAPPED MATTERHORN MOUNTAIN PEAK === */}
      {/* Standout Pyramid Snow Peak directly behind and centered above the giant cinema screen */}
      <group position={[0, 36, baseZ - 58]}>
        {/* Mountain Base Body (Brownish Slate Rock) */}
        <mesh>
          <coneGeometry args={[52, 90, 12]} />
          <meshStandardMaterial color="#4a3f35" roughness={0.88} metalness={0.05} />
        </mesh>
        
        {/* Pure Snow Cap Summit */}
        <mesh position={[0, 26, 0]}>
          <coneGeometry args={[38, 48, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.25}
            metalness={0.05}
            emissive="#e0f2fe"
            emissiveIntensity={0.32}
          />
        </mesh>
        
        {/* Secondary Glacier Ice Ridges down the peak face */}
        <mesh position={[0, 12, 2]}>
          <coneGeometry args={[30, 32, 8]} />
          <meshStandardMaterial
            color="#f1f5f9"
            roughness={0.35}
            emissive="#bae6fd"
            emissiveIntensity={0.2}
          />
        </mesh>
      </group>

      {/* === FLANKING DESERT MOUNTAIN RANGES & PLATEAU HILLS === */}
      {/* Left Desert Mountain Range */}
      <group position={[-65, 24, baseZ - 62]}>
        <mesh>
          <coneGeometry args={[55, 65, 10]} />
          <meshStandardMaterial color="#8c6747" roughness={0.9} />
        </mesh>
        <mesh position={[0, 18, 0]}>
          <coneGeometry args={[32, 30, 10]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.4} />
        </mesh>
      </group>
      
      {/* Far Left Rolling Desert Hills */}
      <mesh position={[-115, 14, baseZ - 65]}>
        <coneGeometry args={[65, 48, 8]} />
        <meshStandardMaterial color="#7a5a3e" roughness={0.95} />
      </mesh>

      {/* Right Desert Mountain Range */}
      <group position={[65, 26, baseZ - 62]}>
        <mesh>
          <coneGeometry args={[58, 68, 10]} />
          <meshStandardMaterial color="#96704d" roughness={0.9} />
        </mesh>
        <mesh position={[0, 20, 0]}>
          <coneGeometry args={[34, 32, 10]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.4} />
        </mesh>
      </group>

      {/* Far Right Rolling Desert Hills */}
      <mesh position={[115, 16, baseZ - 65]}>
        <coneGeometry args={[70, 52, 8]} />
        <meshStandardMaterial color="#805d40" roughness={0.95} />
      </mesh>

      {/* === DESERT GRAVEL PLATEAU GROUND EXTENSION === */}
      <mesh position={[0, -0.4, baseZ - 20]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[360, 120]} />
        <meshStandardMaterial color="#ab8c6a" roughness={0.92} />
      </mesh>

      {/* === GIANT OUTDOOR CINEMA SCREEN FRAME & SUPPORT PILLARS === */}
      {/* Left & Right Vertical Black Steel Posts holding the screen */}
      {[-auditorium.screenWidth / 2 - 0.8, auditorium.screenWidth / 2 + 0.8].map((x, sideIdx) => (
        <group key={sideIdx} position={[x, auditorium.screenBottom + auditorium.screenHeight / 2 - 0.5, baseZ + 0.1]}>
          <mesh>
            <boxGeometry args={[0.8, auditorium.screenHeight + 4.5, 0.8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
      
      {/* Bottom Heavy Steel Base Frame across the desert ground */}
      <mesh position={[0, auditorium.screenBottom - 0.8, baseZ + 0.1]}>
        <boxGeometry args={[auditorium.screenWidth + 2.8, 1.2, 1.2]} />
        <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.25} />
      </mesh>
      
      {/* Top Outer Border Frame */}
      <mesh position={[0, auditorium.screenBottom + auditorium.screenHeight + 0.5, baseZ + 0.1]}>
        <boxGeometry args={[auditorium.screenWidth + 2.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}

function BaroqueOperaBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;
  const lastRowZ =
    auditorium.firstRowZ +
    (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 14;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
  const roomHeight = Math.max(
    16,
    auditorium.screenBottom + auditorium.screenHeight + 4,
  );
  const roomWidth = Math.max(36, auditorium.seatingWidth + 8);
  const halfWidth = roomWidth / 2;

  const goldMaterialProps = {
    color: "#eab308",
    roughness: 0.25,
    metalness: 0.85,
  };

  const darkGoldProps = {
    color: "#ca8a04",
    roughness: 0.3,
    metalness: 0.8,
  };

  const redVelvetProps = {
    color: "#881337",
    roughness: 0.9,
    metalness: 0.05,
  };

  return (
    <group>
      {/* Warm Ambient Opera House Chandelier Light */}
      <pointLight
        color="#fef08a"
        intensity={180}
        distance={50}
        decay={1.8}
        position={[0, roomHeight - 2, roomCenterZ]}
      />

      {/* Ornate Coffered Ceiling (金边格栅奢华天花穹顶) */}
      <mesh position={[0, roomHeight, roomCenterZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color="#451a03" roughness={0.7} />
      </mesh>

      {/* Ceiling Gold Moldings Grid */}
      {[0.2, 0.5, 0.8].map((factor, idx) => {
        const cz = auditorium.screenZ + roomDepth * factor;
        return (
          <group key={`c-grid-${idx}`} position={[0, roomHeight - 0.2, cz]}>
            <mesh>
              <boxGeometry args={[roomWidth, 0.3, 0.4]} />
              <meshStandardMaterial {...goldMaterialProps} />
            </mesh>
          </group>
        );
      })}

      {/* Rear Opera Wall */}
      <mesh position={[0, roomHeight / 2, lastRowZ + 6]}>
        <planeGeometry args={[roomWidth, roomHeight]} />
        <meshStandardMaterial {...redVelvetProps} />
      </mesh>

      {/* Side Walls - Deep Red Damask Velvet */}
      {[-halfWidth, halfWidth].map((xPos, sideIdx) => {
        const isRight = sideIdx === 1;
        return (
          <group key={`side-wall-${sideIdx}`}>
            {/* Wall base plane */}
            <mesh
              position={[xPos, roomHeight / 2, roomCenterZ]}
              rotation={[0, isRight ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              <planeGeometry args={[roomDepth, roomHeight]} />
              <meshStandardMaterial {...redVelvetProps} />
            </mesh>

            {/* === MULTI-TIER OPERA BALCONY BOXES (双层弧形金色歌剧院包厢) === */}
            {[0.38, 0.68].map((tierFactor, tierIdx) => {
              const tierY = roomHeight * tierFactor;
              return (
                <group key={`tier-${tierIdx}`}>
                  {/* Continuous Balcony Deck Projection */}
                  <mesh
                    position={[
                      isRight ? xPos - 1.8 : xPos + 1.8,
                      tierY,
                      roomCenterZ,
                    ]}
                    rotation={[0, isRight ? -Math.PI / 2 : Math.PI / 2, 0]}
                  >
                    <boxGeometry args={[roomDepth * 0.85, 0.35, 3.2]} />
                    <meshStandardMaterial {...goldMaterialProps} />
                  </mesh>

                  {/* Front Gold Ornate Carved Railing (金雕排线栏杆) */}
                  <mesh
                    position={[
                      isRight ? xPos - 3.3 : xPos + 3.3,
                      tierY + 0.5,
                      roomCenterZ,
                    ]}
                    rotation={[0, isRight ? -Math.PI / 2 : Math.PI / 2, 0]}
                  >
                    <boxGeometry args={[roomDepth * 0.85, 0.65, 0.25]} />
                    <meshStandardMaterial {...darkGoldProps} />
                  </mesh>

                  {/* Individual Box Partition Arches & Velvet Drapery (个别包厢隔间与红色丝绒帷幔) */}
                  {[0.25, 0.48, 0.71].map((boxZFactor, boxIdx) => {
                    const boxZ = auditorium.screenZ + roomDepth * boxZFactor;
                    return (
                      <group key={`box-${boxIdx}`} position={[xPos, tierY, boxZ]}>
                        {/* Velvet Draped Curtain Sides */}
                        <mesh position={[isRight ? -1.2 : 1.2, 1.2, 0]}>
                          <cylinderGeometry args={[0.35, 0.45, 1.8, 12]} />
                          <meshStandardMaterial color="#991b1b" roughness={0.88} />
                        </mesh>
                        {/* Box Sconce Light */}
                        <mesh position={[isRight ? -1.8 : 1.8, 1.4, 0]}>
                          <sphereGeometry args={[0.15, 12, 12]} />
                          <meshBasicMaterial color="#fef08a" toneMapped={false} />
                        </mesh>
                      </group>
                    );
                  })}
                </group>
              );
            })}
          </group>
        );
      })}

      {/* === GRAND GOLD BAROQUE PROSCENIUM ARCH (金碧辉煌台口雕花拱门) === */}
      <group position={[0, 0, baseZ - 0.2]}>
        {/* Left Fluted Gold Column */}
        <mesh position={[-auditorium.screenWidth / 2 - 1.2, auditorium.screenBottom + auditorium.screenHeight / 2, 0]}>
          <cylinderGeometry args={[0.9, 1.1, auditorium.screenHeight + 3, 24]} />
          <meshStandardMaterial {...goldMaterialProps} />
        </mesh>

        {/* Right Fluted Gold Column */}
        <mesh position={[auditorium.screenWidth / 2 + 1.2, auditorium.screenBottom + auditorium.screenHeight / 2, 0]}>
          <cylinderGeometry args={[0.9, 1.1, auditorium.screenHeight + 3, 24]} />
          <meshStandardMaterial {...goldMaterialProps} />
        </mesh>

        {/* Top Carved Proscenium Archway Header */}
        <mesh position={[0, auditorium.screenBottom + auditorium.screenHeight + 1.8, 0]}>
          <boxGeometry args={[auditorium.screenWidth + 5.2, 2.2, 1.4]} />
          <meshStandardMaterial {...goldMaterialProps} />
        </mesh>

        {/* Central Crown Crest Pediment above Proscenium */}
        <mesh position={[0, auditorium.screenBottom + auditorium.screenHeight + 3.4, 0.2]}>
          <coneGeometry args={[2.8, 1.8, 4]} rotation={[0, 0, Math.PI / 4]} />
          <meshStandardMaterial {...goldMaterialProps} />
        </mesh>

        {/* Bottom Stage Base Rail */}
        <mesh position={[0, auditorium.screenBottom - 0.9, 0]}>
          <boxGeometry args={[auditorium.screenWidth + 4.8, 1.2, 1.5]} />
          <meshStandardMaterial color="#451a03" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function SuzhouGardenBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;
  const lastRowZ =
    auditorium.firstRowZ +
    (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 14;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
  const roomHeight = Math.max(
    16,
    auditorium.screenBottom + auditorium.screenHeight + 4,
  );
  const roomWidth = Math.max(36, auditorium.seatingWidth + 8);
  const halfWidth = roomWidth / 2;

  const wallColor = "#ede8e0";
  const wallRoughness = 0.92;
  const tileColor = "#3a3a3e";
  const woodColor = "#6b4226";
  const stoneColor = "#9e9e9e";

  return (
    <group>
      {/* Soft warm ambient for Jiangnan garden atmosphere */}
      <hemisphereLight color="#d7ccc8" groundColor="#3e2723" intensity={0.45} />
      <pointLight
        color="#fff3e0"
        intensity={30}
        distance={45}
        decay={1.6}
        position={[0, roomHeight - 3, baseZ - 5]}
      />

      {/* === REAR WHITE COURTYARD WALL (粉墙) === */}
      <mesh position={[0, roomHeight / 2, baseZ - 6]}>
        <planeGeometry args={[roomWidth + 6, roomHeight]} />
        <meshStandardMaterial color={wallColor} roughness={wallRoughness} />
      </mesh>

      {/* Wall base plinth (青石勒脚) */}
      <mesh position={[0, 0.6, baseZ - 5.9]}>
        <boxGeometry args={[roomWidth + 6, 1.2, 0.3]} />
        <meshStandardMaterial color={stoneColor} roughness={0.85} />
      </mesh>

      {/* === DARK TILE ROOF CAP (黛瓦坡顶) === */}
      <group position={[0, roomHeight, baseZ - 6]}>
        {/* Main roof slope */}
        <mesh rotation={[0.15, 0, 0]} position={[0, 0.8, 0.6]}>
          <boxGeometry args={[roomWidth + 6, 0.4, 3]} />
          <meshStandardMaterial color={tileColor} roughness={0.7} metalness={0.1} />
        </mesh>
        {/* Ridge tile */}
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[roomWidth + 6, 0.25, 0.4]} />
          <meshStandardMaterial color="#2a2a2e" roughness={0.6} />
        </mesh>
        {/* Upturned eave ends (飞檐翘角) */}
        {[-(roomWidth / 2 + 2), roomWidth / 2 + 2].map((x, i) => (
          <mesh
            key={`eave-${i}`}
            position={[x, 1.0, 0.5]}
            rotation={[0.15, 0, i === 0 ? 0.35 : -0.35]}
          >
            <boxGeometry args={[2.5, 0.3, 1.8]} />
            <meshStandardMaterial color={tileColor} roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* === MOON GATE (月洞门) behind screen === */}
      <group position={[0, roomHeight * 0.42, baseZ - 5.5]}>
        {/* Moon gate frame ring */}
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[3.2, 0.35, 16, 48]} />
          <meshStandardMaterial color="#e8e0d4" roughness={0.88} />
        </mesh>
        {/* Inner dark reveal suggesting garden beyond */}
        <mesh position={[0, 0, -0.15]}>
          <circleGeometry args={[3.05, 48]} />
          <meshStandardMaterial color="#2d3a2e" roughness={0.95} />
        </mesh>
        {/* Decorative inner trim */}
        <mesh position={[0, 0, 0.05]}>
          <torusGeometry args={[3.0, 0.08, 12, 48]} />
          <meshStandardMaterial color="#c0a880" roughness={0.5} metalness={0.3} />
        </mesh>
      </group>

      {/* === SIDE COURTYARD WALLS (两侧粉墙) === */}
      {[-halfWidth - 0.5, halfWidth + 0.5].map((xPos, sideIdx) => {
        const isRight = sideIdx === 1;
        return (
          <group key={`side-wall-${sideIdx}`}>
            <mesh
              position={[xPos, roomHeight / 2, roomCenterZ]}
              rotation={[0, isRight ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              <planeGeometry args={[roomDepth, roomHeight]} />
              <meshStandardMaterial color={wallColor} roughness={wallRoughness} />
            </mesh>
            {/* Wall base */}
            <mesh
              position={[xPos, 0.6, roomCenterZ]}
              rotation={[0, isRight ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              <boxGeometry args={[roomDepth, 1.2, 0.2]} />
              <meshStandardMaterial color={stoneColor} roughness={0.85} />
            </mesh>
            {/* Lattice window (花窗) */}
            <mesh
              position={[
                isRight ? xPos - 0.15 : xPos + 0.15,
                roomHeight * 0.5,
                roomCenterZ + 4,
              ]}
              rotation={[0, isRight ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              <ringGeometry args={[1.2, 1.5, 6]} />
              <meshStandardMaterial color="#8d6e63" roughness={0.7} />
            </mesh>
          </group>
        );
      })}

      {/* === TAIHU ROCKS (太湖石假山) === */}
      {/* Left rock cluster */}
      <group position={[-halfWidth + 4, 0, baseZ - 2]}>
        <mesh position={[0, 1.5, 0]} castShadow>
          <dodecahedronGeometry args={[1.8, 0]} />
          <meshStandardMaterial color="#bfbfbf" roughness={0.95} flatShading />
        </mesh>
        <mesh position={[1.2, 0.8, 0.5]} castShadow>
          <icosahedronGeometry args={[1.1, 0]} />
          <meshStandardMaterial color="#a8a8a8" roughness={0.95} flatShading />
        </mesh>
        <mesh position={[-0.8, 2.8, 0.3]} castShadow>
          <dodecahedronGeometry args={[0.9, 0]} />
          <meshStandardMaterial color="#c4c4c4" roughness={0.95} flatShading />
        </mesh>
      </group>

      {/* Right rock cluster */}
      <group position={[halfWidth - 4, 0, baseZ - 2]}>
        <mesh position={[0, 1.8, 0]} castShadow>
          <dodecahedronGeometry args={[2.0, 0]} />
          <meshStandardMaterial color="#b0b0b0" roughness={0.95} flatShading />
        </mesh>
        <mesh position={[-1.0, 0.7, 0.6]} castShadow>
          <icosahedronGeometry args={[1.0, 0]} />
          <meshStandardMaterial color="#a0a0a0" roughness={0.95} flatShading />
        </mesh>
        <mesh position={[0.8, 3.0, -0.2]} castShadow>
          <dodecahedronGeometry args={[0.8, 0]} />
          <meshStandardMaterial color="#c0c0c0" roughness={0.95} flatShading />
        </mesh>
      </group>

      {/* === BAMBOO GROVE (竹林) === */}
      {/* Left bamboo cluster */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const r = 1.2 + pseudoRandom(i * 7) * 1.5;
        const bx = -halfWidth + 2 + Math.cos(angle) * r;
        const bz = baseZ - 1 + Math.sin(angle) * r;
        const bh = 6 + pseudoRandom(i * 11) * 4;
        return (
          <group key={`bamboo-l-${i}`} position={[bx, 0, bz]}>
            <mesh position={[0, bh / 2, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.12, bh, 6]} />
              <meshStandardMaterial color="#7c9c5a" roughness={0.6} />
            </mesh>
            {/* Bamboo leaves */}
            <mesh position={[0, bh, 0]}>
              <coneGeometry args={[0.6, 1.5, 6]} />
              <meshStandardMaterial color="#558b2f" roughness={0.7} flatShading />
            </mesh>
            {/* Bamboo node lines */}
            {[0.3, 0.55, 0.8].map((f, j) => (
              <mesh key={j} position={[0, bh * f, 0]}>
                <torusGeometry args={[0.1, 0.03, 6, 12]} />
                <meshStandardMaterial color="#5a7c3a" roughness={0.6} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Right bamboo cluster */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const r = 1.2 + pseudoRandom(i * 13 + 3) * 1.5;
        const bx = halfWidth - 2 + Math.cos(angle) * r;
        const bz = baseZ - 1 + Math.sin(angle) * r;
        const bh = 6 + pseudoRandom(i * 17 + 5) * 4;
        return (
          <group key={`bamboo-r-${i}`} position={[bx, 0, bz]}>
            <mesh position={[0, bh / 2, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.12, bh, 6]} />
              <meshStandardMaterial color="#7c9c5a" roughness={0.6} />
            </mesh>
            <mesh position={[0, bh, 0]}>
              <coneGeometry args={[0.6, 1.5, 6]} />
              <meshStandardMaterial color="#558b2f" roughness={0.7} flatShading />
            </mesh>
            {[0.3, 0.55, 0.8].map((f, j) => (
              <mesh key={j} position={[0, bh * f, 0]}>
                <torusGeometry args={[0.1, 0.03, 6, 12]} />
                <meshStandardMaterial color="#5a7c3a" roughness={0.6} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* === WATER POOL (水池) in front of screen === */}
      <mesh
        position={[0, -0.3, baseZ + 3]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[roomWidth - 8, 6]} />
        <meshStandardMaterial
          color="#1a3a3a"
          roughness={0.1}
          metalness={0.6}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Pool stone rim */}
      {[-1, 1].map((side) => (
        <mesh
          key={`pool-rim-${side}`}
          position={[(roomWidth / 2 - 4) * side, -0.25, baseZ + 3]}
        >
          <boxGeometry args={[0.4, 0.3, 6.2]} />
          <meshStandardMaterial color={stoneColor} roughness={0.85} />
        </mesh>
      ))}

      {/* === STONE PATH (青石板路) === */}
      <mesh
        position={[0, -0.35, lastRowZ + 1]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[4, 5]} />
        <meshStandardMaterial color="#8a8a8a" roughness={0.88} />
      </mesh>

      {/* === RED LANTERNS (红灯笼) === */}
      {[-halfWidth + 3, halfWidth - 3].map((x, i) => (
        <group key={`lantern-${i}`} position={[x, roomHeight - 4, baseZ + 2]}>
          {/* Hanging string */}
          <mesh position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 2.4, 6]} />
            <meshStandardMaterial color="#4a2c2a" roughness={0.8} />
          </mesh>
          {/* Lantern body */}
          <mesh position={[0, -0.2, 0]}>
            <sphereGeometry args={[0.7, 16, 12]} />
            <meshStandardMaterial
              color="#c0392b"
              emissive="#e74c3c"
              emissiveIntensity={0.6}
              roughness={0.5}
            />
          </mesh>
          {/* Lantern top cap */}
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.3, 0.5, 0.2, 12]} />
            <meshStandardMaterial color="#8b3a2e" roughness={0.6} />
          </mesh>
          {/* Lantern bottom tassel */}
          <mesh position={[0, -0.9, 0]}>
            <cylinderGeometry args={[0.05, 0.02, 0.5, 6]} />
            <meshStandardMaterial color="#e74c3c" roughness={0.7} />
          </mesh>
          {/* Lantern light glow */}
          <pointLight
            position={[0, -0.2, 0]}
            color="#ff6b35"
            intensity={5}
            distance={8}
            decay={2}
          />
        </group>
      ))}

      {/* === PAVILION CORNER (亭子) — left rear === */}
      <group position={[-halfWidth + 6, 0, baseZ - 3]}>
        {/* Stone pillar bases */}
        {[-1, 1].map((px) => (
          <mesh key={`pav-pillar-${px}`} position={[px * 0.8, 0.5, 0.5]}>
            <boxGeometry args={[0.35, 1.0, 0.35]} />
            <meshStandardMaterial color={stoneColor} roughness={0.85} />
          </mesh>
        ))}
        {/* Wooden pillars */}
        {[-1, 1].map((px) => (
          <mesh key={`pav-wood-${px}`} position={[px * 0.8, 2.5, 0.5]}>
            <cylinderGeometry args={[0.12, 0.14, 4, 8]} />
            <meshStandardMaterial color={woodColor} roughness={0.7} />
          </mesh>
        ))}
        {/* Pavilion roof */}
        <mesh position={[0, 5.0, 0.5]} rotation={[0, 0, 0]}>
          <coneGeometry args={[2.2, 1.5, 4]} />
          <meshStandardMaterial color={tileColor} roughness={0.7} flatShading />
        </mesh>
        {/* Upturned eaves */}
        {[-1, 1].map((px) => (
          <mesh
            key={`pav-eave-${px}`}
            position={[px * 1.6, 4.8, 0.5]}
            rotation={[0, 0, px * 0.4]}
          >
            <boxGeometry args={[1.0, 0.2, 0.8]} />
            <meshStandardMaterial color="#2a2a2e" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* === SCREEN SUPPORT FRAME (银幕木质支架) === */}
      {[-auditorium.screenWidth / 2 - 0.6, auditorium.screenWidth / 2 + 0.6].map((x, i) => (
        <group key={`screen-post-${i}`} position={[x, 0, baseZ]}>
          {/* Wooden post */}
          <mesh position={[0, auditorium.screenBottom + auditorium.screenHeight / 2, 0]}>
            <boxGeometry args={[0.5, auditorium.screenHeight + 3, 0.5]} />
            <meshStandardMaterial color={woodColor} roughness={0.75} />
          </mesh>
          {/* Stone base */}
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.8, 0.6, 0.8]} />
            <meshStandardMaterial color={stoneColor} roughness={0.85} />
          </mesh>
        </group>
      ))}

      {/* Bottom wooden beam */}
      <mesh position={[0, auditorium.screenBottom - 0.5, baseZ]}>
        <boxGeometry args={[auditorium.screenWidth + 1.8, 0.6, 0.6]} />
        <meshStandardMaterial color={woodColor} roughness={0.75} />
      </mesh>

      {/* Top wooden lintel */}
      <mesh position={[0, auditorium.screenBottom + auditorium.screenHeight + 0.3, baseZ]}>
        <boxGeometry args={[auditorium.screenWidth + 1.8, 0.5, 0.5]} />
        <meshStandardMaterial color={woodColor} roughness={0.75} />
      </mesh>
    </group>
  );
}

function WarmWoodLoungeBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;
  const lastRowZ =
    auditorium.firstRowZ +
    (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 12;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
  const roomHeight = Math.max(
    14,
    auditorium.screenBottom + auditorium.screenHeight + 2.5,
  );
  const roomWidth = Math.max(34, auditorium.seatingWidth + 6);
  const halfRoomWidth = roomWidth / 2;

  return (
    <group>
      {/* Single Key Room Soft Warm Fill Light instead of 25+ individual point/spot lights */}
      <pointLight
        color="#fef08a"
        intensity={120}
        distance={45}
        decay={1.8}
        position={[0, roomHeight - 2, roomCenterZ]}
      />

      {/* Heavy Wooden Ceiling Beams (横向重型原木天花大梁) with Concealed Warm LED Strip */}
      {[0.15, 0.45, 0.75].map((factor, idx) => {
        const beamZ = auditorium.screenZ + roomDepth * factor;
        return (
          <group key={`beam-${idx}`} position={[0, roomHeight - 0.4, beamZ]}>
            {/* Main Oak Beam */}
            <mesh receiveShadow castShadow>
              <boxGeometry args={[roomWidth + 2, 0.8, 1.2]} />
              <meshStandardMaterial
                color="#7c522e"
                roughness={0.55}
                metalness={0.05}
              />
            </mesh>
            {/* Concealed Cove Light Strip Above Beam */}
            <mesh position={[0, 0.42, 0]}>
              <boxGeometry args={[roomWidth, 0.06, 0.8]} />
              <meshBasicMaterial color="#fef08a" toneMapped={false} />
            </mesh>
          </group>
        );
      })}

      {/* Ceiling Surface (高雅米白天花板) */}
      <mesh position={[0, roomHeight + 0.1, roomCenterZ]} receiveShadow>
        <boxGeometry args={[roomWidth + 2, 0.2, roomDepth]} />
        <meshStandardMaterial color="#f5f0e6" roughness={0.9} />
      </mesh>

      {/* Acoustic Fabric Side Wall Panels & Solid Wood Pillars (吸音织物软包墙面与坚实原木柱) */}
      {[-halfRoomWidth, halfRoomWidth].map((x, sideIdx) => {
        const isRight = sideIdx === 1;
        return (
          <group key={`wall-${sideIdx}`}>
            {/* Main Beige Linen Fabric Wall Panel */}
            <mesh position={[x, roomHeight / 2, roomCenterZ]} receiveShadow>
              <boxGeometry args={[0.4, roomHeight, roomDepth]} />
              <meshStandardMaterial color="#c8b8a2" roughness={0.92} />
            </mesh>

            {/* Vertical Solid Oak Pillars along Side Wall */}
            {[0.1, 0.38, 0.68, 0.92].map((f, pIdx) => {
              const pZ = auditorium.screenZ + roomDepth * f;
              const posX = isRight ? halfRoomWidth - 0.35 : -halfRoomWidth + 0.35;
              return (
                <group key={`pillar-${pIdx}`} position={[posX, roomHeight / 2, pZ]}>
                  <mesh receiveShadow castShadow>
                    <boxGeometry args={[0.6, roomHeight, 0.8]} />
                    <meshStandardMaterial color="#784e2a" roughness={0.5} metalness={0.08} />
                  </mesh>

                  {/* Vertical Cove Light Strip behind pillar */}
                  <mesh position={[isRight ? -0.32 : 0.32, 0, 0]}>
                    <boxGeometry args={[0.04, roomHeight * 0.88, 0.12]} />
                    <meshBasicMaterial color="#fbbf24" toneMapped={false} />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}

      {/* Back Wall Acoustic Fabric & Trim */}
      <mesh
        position={[0, roomHeight / 2, lastRowZ + 6]}
        receiveShadow
      >
        <boxGeometry args={[roomWidth, roomHeight, 0.4]} />
        <meshStandardMaterial color="#bdae99" roughness={0.92} />
      </mesh>

      {/* Under-step LED Footlight Strips on Platform Risers (隐形下沉阶梯金光脚灯) */}
      {Array.from({ length: auditorium.rowCount }, (_, row) => {
        const y = cinemaSeatGeometry.rowFloorBaseY + row * auditorium.rowRise;
        const z = auditorium.firstRowZ + row * auditorium.rowSpacing;
        return (
          <group key={`step-light-${row}`}>
            {/* Glowing Golden LED Strip along step riser */}
            <mesh position={[0, y - 0.72, z - auditorium.rowSpacing / 2 + 0.02]}>
              <boxGeometry args={[auditorium.seatingWidth + 12, 0.05, 0.08]} />
              <meshBasicMaterial color="#f59e0b" toneMapped={false} />
            </mesh>
          </group>
        );
      })}

      {/* Step Stairs on Side Aisle (阶梯小脚灯) */}
      {[-auditorium.seatingWidth / 2 - 2, auditorium.seatingWidth / 2 + 2].map((x, aIdx) => (
        <group key={`stair-${aIdx}`} position={[x, 0.3, auditorium.firstRowZ - 2]}>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[2.2, 0.3, 1.2]} />
            <meshStandardMaterial color="#8c5e34" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, -0.58]}>
            <boxGeometry args={[2.0, 0.03, 0.06]} />
            <meshBasicMaterial color="#f59e0b" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Right Foreground Console Cabinet & Snack Canisters (右前精装木质茶水柜与玻璃罐) */}
      <group position={[halfRoomWidth - 3.2, 1.1, auditorium.firstRowZ - 3.8]}>
        {/* Fluted Wood Cabinet Body */}
        <mesh receiveShadow castShadow>
          <boxGeometry args={[2.6, 2.2, 1.4]} />
          <meshStandardMaterial color="#6e4423" roughness={0.55} metalness={0.05} />
        </mesh>
        {/* White Marble Countertop */}
        <mesh position={[0, 1.12, 0]} receiveShadow castShadow>
          <boxGeometry args={[2.7, 0.1, 1.5]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.25} metalness={0.02} />
        </mesh>
        {/* Gold Handles */}
        {[-0.5, 0.5].map((hx, hIdx) => (
          <mesh key={hIdx} position={[hx, 0.2, 0.72]}>
            <cylinderGeometry args={[0.03, 0.03, 0.6, 12]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.9} roughness={0.15} />
          </mesh>
        ))}
        {/* Glass Snack Jars on Top */}
        {[
          { x: -0.6, z: -0.2, h: 0.42, r: 0.18, foodColor: "#fde047" },
          { x: 0.2, z: 0.1, h: 0.5, r: 0.22, foodColor: "#d97706" },
        ].map((jar, jIdx) => (
          <group key={jIdx} position={[jar.x, 1.35, jar.z]}>
            {/* Lightweight Translucent Glass Container */}
            <mesh>
              <cylinderGeometry args={[jar.r, jar.r, jar.h, 12]} />
              <meshStandardMaterial
                color="#fef08a"
                roughness={0.2}
                transparent
                opacity={0.45}
              />
            </mesh>
            {/* Snacks inside */}
            <mesh position={[0, -0.05, 0]}>
              <cylinderGeometry args={[jar.r - 0.03, jar.r - 0.03, jar.h - 0.1, 10]} />
              <meshStandardMaterial color={jar.foodColor} roughness={0.7} />
            </mesh>
            {/* Lid */}
            <mesh position={[0, jar.h / 2 + 0.04, 0]}>
              <cylinderGeometry args={[jar.r + 0.02, jar.r + 0.02, 0.06, 12]} />
              <meshStandardMaterial color="#8c5e34" roughness={0.4} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function MinimalistCreamBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const lastRowZ =
    auditorium.firstRowZ +
    (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 12;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
  const roomHeight = Math.max(
    14,
    auditorium.screenBottom + auditorium.screenHeight + 2.5,
  );
  const roomWidth = Math.max(34, auditorium.seatingWidth + 6);
  const halfRoomWidth = roomWidth / 2;
  const baseZ = auditorium.screenZ;

  return (
    <group>
      {/* Multitiered Angled Cream Ceiling with Concealed Cove Light */}
      <group position={[0, roomHeight, roomCenterZ]}>
        {/* Main Upper Slanted Ceiling Plane */}
        <mesh position={[0, 0.2, 0]} rotation={[0.04, 0, 0]} receiveShadow>
          <boxGeometry args={[roomWidth + 2, 0.3, roomDepth + 4]} />
          <meshStandardMaterial color="#e8dfd1" roughness={0.92} />
        </mesh>

        {/* Lower Angled Step Ceiling Section */}
        <mesh position={[0, -0.4, -roomDepth * 0.2]} rotation={[-0.08, 0, 0]} receiveShadow>
          <boxGeometry args={[roomWidth + 0.8, 0.25, roomDepth * 0.55]} />
          <meshStandardMaterial color="#ded4c5" roughness={0.9} />
        </mesh>

        {/* Concealed Linear Cove Light Strip between ceiling steps */}
        <mesh position={[0, -0.52, -roomDepth * 0.45]}>
          <boxGeometry args={[roomWidth - 1, 0.05, 0.2]} />
          <meshBasicMaterial color="#fef08a" toneMapped={false} />
        </mesh>
        <pointLight
          position={[0, -0.6, -roomDepth * 0.45]}
          color="#fde047"
          intensity={110}
          distance={18}
          decay={1.8}
        />
      </group>

      {/* Acoustic Fabric Side Walls with Geometric Diagonal Slash Cuts & Hidden Warm LED Strips */}
      {[-halfRoomWidth, halfRoomWidth].map((x, sideIdx) => {
        const isRight = sideIdx === 1;
        const xMult = isRight ? 1 : -1;

        return (
          <group key={`cream-side-${sideIdx}`}>
            {/* Main Background Cream Wall */}
            <mesh position={[x, roomHeight / 2, roomCenterZ]} receiveShadow>
              <boxGeometry args={[0.4, roomHeight, roomDepth + 4]} />
              <meshStandardMaterial color="#e2d7c7" roughness={0.92} />
            </mesh>

            {/* Angular Faceted Acoustic Wall Panels */}
            {[-roomDepth * 0.3, 0, roomDepth * 0.3].map((zOffset, pIdx) => {
              const panelZ = roomCenterZ + zOffset;
              const angleRotZ = isRight ? -0.06 : 0.06;
              const angleRotY = isRight ? -0.05 : 0.05;

              return (
                <group key={`panel-${pIdx}`} position={[x - xMult * 0.15, roomHeight * 0.52, panelZ]}>
                  {/* Facet panel */}
                  <mesh
                    rotation={[0.08, angleRotY, angleRotZ]}
                    receiveShadow
                    castShadow
                  >
                    <boxGeometry args={[0.25, roomHeight * 0.88, roomDepth * 0.28]} />
                    <meshStandardMaterial color="#ece3d5" roughness={0.88} />
                  </mesh>

                  {/* Diagonal Glowing LED Light Strip along the panel seam */}
                  <mesh
                    position={[-xMult * 0.14, 0, isRight ? 1.2 : -1.2]}
                    rotation={[0.35, 0, isRight ? -0.15 : 0.15]}
                  >
                    <boxGeometry args={[0.05, roomHeight * 0.85, 0.08]} />
                    <meshBasicMaterial color="#fef08a" toneMapped={false} />
                  </mesh>

                  {/* Soft Light Point for Warm Wall Reflection */}
                  <pointLight
                    position={[-xMult * 0.4, 0, 0]}
                    color="#fde047"
                    intensity={65}
                    distance={12}
                    decay={2}
                  />
                </group>
              );
            })}
          </group>
        );
      })}

      {/* Recessed Screen Surround Back Wall */}
      <group position={[0, roomHeight / 2, baseZ - 0.4]}>
        {/* Front Recessed Frame */}
        <mesh receiveShadow>
          <boxGeometry args={[roomWidth + 1, roomHeight + 1, 0.4]} />
          <meshStandardMaterial color="#dbcfbe" roughness={0.92} />
        </mesh>
        {/* Soft Glowing Frame Border */}
        <mesh position={[0, 0, 0.22]}>
          <boxGeometry args={[auditorium.screenWidth + 1.8, auditorium.screenHeight + 1.8, 0.04]} />
          <meshBasicMaterial color="#fef08a" toneMapped={false} transparent opacity={0.3} />
        </mesh>
      </group>

      {/* Dark Carpet Floor Front Stage Area */}
      <mesh position={[0, 0.01, baseZ + 3]} receiveShadow>
        <planeGeometry args={[roomWidth, 8]} rotation={[-Math.PI / 2, 0, 0]} />
        <meshStandardMaterial color="#222428" roughness={0.92} metalness={0.02} />
      </mesh>
    </group>
  );
}

function ImaxGiantBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const lastRowZ =
    auditorium.firstRowZ +
    (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 12;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
  const roomHeight = Math.max(
    15,
    auditorium.screenBottom + auditorium.screenHeight + 3,
  );
  const roomWidth = Math.max(36, auditorium.seatingWidth + 8);
  const halfRoomWidth = roomWidth / 2;
  const baseZ = auditorium.screenZ;

  return (
    <group>
      {/* Dark Ceiling Grid & Industrial Truss System (黑色网格天花与金属悬吊桁架) */}
      <group position={[0, roomHeight, roomCenterZ]}>
        {/* Main Ceiling Slab */}
        <mesh receiveShadow>
          <boxGeometry args={[roomWidth + 2, 0.2, roomDepth + 4]} />
          <meshStandardMaterial color="#0a0c10" roughness={0.9} />
        </mesh>

        {/* Hanging Ceiling Grid */}
        {Array.from({ length: 6 }).map((_, i) => {
          const gz = -roomDepth / 2 + (roomDepth / 5) * i;
          return (
            <mesh key={`cgrid-z-${i}`} position={[0, -0.3, gz]}>
              <boxGeometry args={[roomWidth, 0.05, 0.05]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
            </mesh>
          );
        })}
        {Array.from({ length: 7 }).map((_, i) => {
          const gx = -roomWidth / 2 + (roomWidth / 6) * i;
          return (
            <mesh key={`cgrid-x-${i}`} position={[gx, -0.3, 0]}>
              <boxGeometry args={[0.05, 0.05, roomDepth]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
            </mesh>
          );
        })}

        {/* Ceiling Track Lights */}
        {[-halfRoomWidth * 0.6, 0, halfRoomWidth * 0.6].map((tx, tIdx) => (
          <group key={`track-${tIdx}`} position={[tx, -0.42, 0]}>
            <mesh>
              <boxGeometry args={[0.08, 0.08, roomDepth * 0.8]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
            </mesh>
            {[0.2, 0.4, 0.6, 0.8].map((f, sIdx) => {
              const sz = -roomDepth * 0.4 + roomDepth * 0.8 * f;
              return (
                <mesh key={`spot-${sIdx}`} position={[0, -0.15, sz]} rotation={[0.4, 0, 0]}>
                  <cylinderGeometry args={[0.12, 0.15, 0.3, 16]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.8} />
                </mesh>
              );
            })}
          </group>
        ))}
      </group>

      {/* Side Acoustic Wall Panels with Vertical Bronze Trim Strips */}
      {[-halfRoomWidth, halfRoomWidth].map((x, sideIdx) => {
        const isRight = sideIdx === 1;
        return (
          <group key={`imax-side-${sideIdx}`}>
            {/* Main Dark Charcoal Wall */}
            <mesh position={[x, roomHeight / 2, roomCenterZ]} receiveShadow>
              <boxGeometry args={[0.4, roomHeight, roomDepth + 4]} />
              <meshStandardMaterial color="#0f1115" roughness={0.95} />
            </mesh>

            {/* Vertical Bronze Trim Strips */}
            <mesh position={[isRight ? halfRoomWidth - 0.35 : -halfRoomWidth + 0.35, roomHeight / 2, baseZ + 2]}>
              <boxGeometry args={[0.06, roomHeight, 0.06]} />
              <meshStandardMaterial color="#b45309" metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh position={[isRight ? halfRoomWidth - 0.35 : -halfRoomWidth + 0.35, roomHeight / 2, lastRowZ - 2]}>
              <boxGeometry args={[0.06, roomHeight, 0.06]} />
              <meshStandardMaterial color="#b45309" metalness={0.85} roughness={0.25} />
            </mesh>

            {/* Wall-Mounted Surround Speakers */}
            {[0.25, 0.55, 0.82].map((f, spIdx) => {
              const spZ = baseZ + roomDepth * f;
              const spY = roomHeight * 0.62;
              const posX = isRight ? halfRoomWidth - 0.6 : -halfRoomWidth + 0.6;
              const rotY = isRight ? -0.35 : 0.35;
              return (
                <group key={`spk-${spIdx}`} position={[posX, spY, spZ]} rotation={[0.15, rotY, 0]}>
                  <mesh position={[isRight ? 0.2 : -0.2, -0.1, 0]}>
                    <boxGeometry args={[0.25, 0.08, 0.25]} />
                    <meshStandardMaterial color="#1e293b" metalness={0.8} />
                  </mesh>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.5, 0.75, 0.4]} />
                    <meshStandardMaterial color="#090a0f" roughness={0.4} metalness={0.3} />
                  </mesh>
                  <mesh position={[0, 0, 0.21]}>
                    <planeGeometry args={[0.44, 0.68]} />
                    <meshStandardMaterial color="#1e293b" roughness={0.9} />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}

      {/* Front Stage Carpet & Illuminated Logo Plate */}
      <group position={[0, 0.02, baseZ + 3.5]}>
        <mesh receiveShadow>
          <planeGeometry args={[roomWidth - 2, 6]} rotation={[-Math.PI / 2, 0, 0]} />
          <meshStandardMaterial color="#0d0e12" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.2, 1.2]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.18} />
        </mesh>
      </group>

      {/* Green Emergency / Exit Floor Indicator Lights */}
      {[-halfRoomWidth + 1.2, halfRoomWidth - 1.2].map((ex, eIdx) => (
        <group key={`exit-${eIdx}`} position={[ex, 0.4, baseZ + 1]}>
          <mesh>
            <boxGeometry args={[0.3, 0.5, 0.15]} />
            <meshStandardMaterial color="#090a0f" />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <planeGeometry args={[0.24, 0.4]} />
            <meshBasicMaterial color="#22c55e" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ParCinemaBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const lastRowZ =
    auditorium.firstRowZ + (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 12;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
  const roomHeight = Math.max(
    14,
    auditorium.screenBottom + auditorium.screenHeight + 2.5,
  );
  const roomWidth = Math.max(34, auditorium.seatingWidth + 6);
  const halfRoomWidth = roomWidth / 2;
  const baseZ = auditorium.screenZ;

  const tileSize = 1.2;

  return (
    <group>
      {/* 黑色网格吊顶 + 嵌入式筒灯 */}
      <group position={[0, roomHeight, roomCenterZ]}>
        <mesh
          position={[0, 0, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[roomWidth + 2, roomDepth + 4]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.85} />
        </mesh>

        {/* 横向白色网格线（沿 X 轴走线） */}
        {Array.from({ length: 10 }).map((_, i) => (
          <mesh
            key={`cx-${i}`}
            position={[
              -roomWidth / 2 + (i + 0.5) * (roomWidth / 10),
              -0.04,
              0,
            ]}
          >
            <boxGeometry args={[0.04, 0.04, roomDepth + 4]} />
            <meshStandardMaterial
              color="#d4d4d8"
              emissive="#9ca3af"
              emissiveIntensity={0.18}
            />
          </mesh>
        ))}
        {/* 纵向白色网格线（沿 Z 轴走线） */}
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh
            key={`cz-${i}`}
            position={[
              0,
              -0.04,
              -roomDepth / 2 + (i + 0.5) * (roomDepth / 7),
            ]}
          >
            <boxGeometry args={[roomWidth + 2, 0.04, 0.04]} />
            <meshStandardMaterial
              color="#d4d4d8"
              emissive="#9ca3af"
              emissiveIntensity={0.18}
            />
          </mesh>
        ))}

        {/* 嵌入式筒灯 - 稀疏分布 6 个 */}
        {[
          [-roomWidth * 0.35, -roomDepth * 0.25],
          [0, -roomDepth * 0.25],
          [roomWidth * 0.35, -roomDepth * 0.25],
          [-roomWidth * 0.35, roomDepth * 0.2],
          [0, roomDepth * 0.2],
          [roomWidth * 0.35, roomDepth * 0.2],
        ].map(([lx, lz], i) => (
          <group key={`lt-${i}`} position={[lx, -0.08, lz]}>
            <mesh>
              <boxGeometry args={[0.55, 0.03, 0.55]} />
              <meshBasicMaterial color="#fff8d6" toneMapped={false} />
            </mesh>
            <pointLight
              color="#fff4cc"
              intensity={22}
              distance={8}
              decay={2}
            />
          </group>
        ))}
      </group>

      {/* 两侧白色方格瓷砖墙 + 黑色勾缝 + 黑色壁挂音箱 */}
      {[-1, 1].map((dir) => (
        <group
          key={`par-side-${dir}`}
          position={[dir * halfRoomWidth, roomHeight / 2, roomCenterZ]}
        >
          {/* 主白墙 */}
          <mesh receiveShadow>
            <boxGeometry args={[0.4, roomHeight, roomDepth + 4]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.78} />
          </mesh>

          {/* 黑色横向勾缝 */}
          {Array.from({ length: 6 }).map((_, i) => (
            <mesh
              key={`vy-${dir}-${i}`}
              position={[
                dir * 0.22,
                (i - 2.5) * (roomHeight / 6),
                0,
              ]}
            >
              <boxGeometry args={[0.03, 0.06, roomDepth + 4]} />
              <meshStandardMaterial color="#1a1a1a" />
            </mesh>
          ))}
          {/* 黑色纵向勾缝 */}
          {Array.from({ length: 7 }).map((_, i) => (
            <mesh
              key={`vz-${dir}-${i}`}
              position={[
                dir * 0.22,
                0,
                -roomDepth / 2 + (i + 0.5) * (roomDepth / 6),
              ]}
            >
              <boxGeometry args={[0.03, roomHeight, 0.06]} />
              <meshStandardMaterial color="#1a1a1a" />
            </mesh>
          ))}

          {/* 黑色壁挂音箱 - 每侧 2 个 */}
          {[-roomDepth * 0.18, roomDepth * 0.2].map((zo, si) => (
            <group
              key={`sp-${dir}-${si}`}
              position={[dir * 0.36, roomHeight * 0.55, zo]}
            >
              <mesh castShadow>
                <boxGeometry args={[0.18, 0.7, 0.5]} />
                <meshStandardMaterial
                  color="#0a0a0a"
                  roughness={0.55}
                  metalness={0.35}
                />
              </mesh>
              {/* 喇叭格栅圆 */}
              <mesh position={[0, 0, 0.095]}>
                <circleGeometry args={[0.085, 18]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* 银幕后墙 - 纯黑 */}
      <mesh position={[0, roomHeight / 2, baseZ - 0.4]} receiveShadow>
        <boxGeometry args={[roomWidth + 1, roomHeight + 1, 0.4]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
      </mesh>

      {/* 地板：白色方格 + 黑色勾缝 */}
      <group position={[0, 0, roomCenterZ - 1]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[roomWidth, roomDepth + 4]} />
          <meshStandardMaterial
            color="#ededed"
            roughness={0.7}
            metalness={0.05}
          />
        </mesh>
        {/* 地板 X 方向勾缝 */}
        {Array.from({ length: 10 }).map((_, i) => (
          <mesh
            key={`fx-${i}`}
            position={[
              -roomWidth / 2 + (i + 0.5) * (roomWidth / 10),
              0.005,
              0,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.04, roomDepth + 4]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
        {/* 地板 Z 方向勾缝 */}
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh
            key={`fz-${i}`}
            position={[
              0,
              0.005,
              -roomDepth / 2 + (i + 0.5) * (roomDepth / 7),
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[roomWidth, 0.04]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
      </group>

      {/* 暖色木格栅舞台区 - 银幕前方 */}
      <group position={[0, 0.015, baseZ + 3]}>
        {/* 木地板底色 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[roomWidth * 0.45, 5.5]} />
          <meshStandardMaterial color="#b8884a" roughness={0.82} />
        </mesh>
        {/* 横向木条（沿 Z 方向延伸） */}
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh
            key={`ws-${i}`}
            position={[
              (i - 5.5) * (roomWidth * 0.45 / 12),
              0.008,
              0,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry
              args={[roomWidth * 0.45 / 12 - 0.06, 5.5]}
            />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#c9a567" : "#9c6f3a"}
              roughness={0.78}
            />
          </mesh>
        ))}
        {/* 木格栅两端深色边框 */}
        <mesh position={[0, 0.012, 2.78]}>
          <boxGeometry args={[roomWidth * 0.46, 0.08, 0.08]} />
          <meshStandardMaterial color="#4a3014" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.012, -2.78]}>
          <boxGeometry args={[roomWidth * 0.46, 0.08, 0.08]} />
          <meshStandardMaterial color="#4a3014" roughness={0.85} />
        </mesh>
      </group>

      {/* 应急疏散指示灯 - 银幕下方两侧地面 */}
      {[-halfRoomWidth + 1.2, halfRoomWidth - 1.2].map((ex, eIdx) => (
        <group
          key={`par-exit-${eIdx}`}
          position={[ex, 0.35, baseZ + 1]}
        >
          <mesh>
            <boxGeometry args={[0.28, 0.45, 0.14]} />
            <meshStandardMaterial color="#090a0f" />
          </mesh>
          <mesh position={[0, 0, 0.075]}>
            <planeGeometry args={[0.22, 0.36]} />
            <meshBasicMaterial color="#22c55e" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function WhiteTileCinemaBackdrop({
  auditorium,
}: {
  auditorium: Auditorium;
}) {
  const lastRowZ =
    auditorium.firstRowZ + (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 12;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
  const roomHeight = Math.max(
    14,
    auditorium.screenBottom + auditorium.screenHeight + 2.5,
  );
  const roomWidth = Math.max(34, auditorium.seatingWidth + 6);
  const halfRoomWidth = roomWidth / 2;
  const baseZ = auditorium.screenZ;

  // 白色大格瓷砖纹理（用于左右侧墙 + 银幕后墙）：复用 createWhiteFloorTexture 改色为白
  const floorTextures = useMemo(() => {
    if (typeof document === "undefined") return null;
    return createWhiteFloorTexture();
  }, []);
  const ceilingTex = useMemo(() => {
    if (typeof document === "undefined") return null;
    return createWhiteCeilingTexture();
  }, []);

  const wallTexture = useMemo(() => {
    if (!floorTextures) return null;
    const t = floorTextures.baseMap.clone();
    t.repeat.set(roomDepth / 6, roomHeight / 6);
    t.needsUpdate = true;
    return { map: t };
  }, [floorTextures, roomDepth, roomHeight]);

  const wallBackTexture = useMemo(() => {
    if (!floorTextures) return null;
    const t = floorTextures.baseMap.clone();
    t.repeat.set(roomWidth / 6, roomHeight / 6);
    t.needsUpdate = true;
    return { map: t };
  }, [floorTextures, roomWidth, roomHeight]);

  const ceilingMaterialTexture = useMemo(() => {
    if (!ceilingTex) return null;
    const t = ceilingTex.clone();
    t.repeat.set(roomWidth / 8, (roomDepth + 4) / 8);
    t.needsUpdate = true;
    return t;
  }, [ceilingTex, roomWidth, roomDepth]);

  // 白色细密方格地板纹理（4×4 大格，每大格内 16 个小格）
  const floorFineTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const tex = createWhiteFineGridTexture();
    const t = tex.baseMap.clone();
    t.repeat.set(roomWidth / 8, (roomDepth + 4) / 8);
    t.needsUpdate = true;
    return { map: t };
  }, [roomWidth, roomDepth]);

  return (
    <group>
      {/* 左墙 - 白色大格瓷砖（复用 createWhiteFloorTexture 改色为白） */}
      {wallTexture && (
        <mesh
          position={[-halfRoomWidth, roomHeight / 2, roomCenterZ]}
          rotation={[0, Math.PI / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={[roomDepth + 4, roomHeight]} />
          <meshStandardMaterial
            map={wallTexture.map}
            color="#ffffff"
            roughness={1}
            metalness={0}
            side={2}
          />
        </mesh>
      )}

      {/* 右墙 - 白色大格瓷砖 */}
      {wallTexture && (
        <mesh
          position={[halfRoomWidth, roomHeight / 2, roomCenterZ]}
          rotation={[0, -Math.PI / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={[roomDepth + 4, roomHeight]} />
          <meshStandardMaterial
            map={wallTexture.map}
            color="#ffffff"
            roughness={1}
            metalness={0}
            side={2}
          />
        </mesh>
      )}

      {/* 银幕后墙 - 白色大格瓷砖 */}
      {wallBackTexture && (
        <mesh position={[0, roomHeight / 2, baseZ - 0.3]} receiveShadow>
          <planeGeometry args={[roomWidth + 2, roomHeight]} />
          <meshStandardMaterial
            map={wallBackTexture.map}
            color="#ffffff"
            roughness={1}
            metalness={0}
            side={2}
          />
        </mesh>
      )}

      {/* 天花板 - 米色纯色 + 极淡纹理 */}
      {ceilingMaterialTexture && (
        <mesh
          position={[0, roomHeight + 0.05, roomCenterZ]}
          rotation={[Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[roomWidth, roomDepth + 4, 1, 1]} />
          <meshStandardMaterial
            map={ceilingMaterialTexture}
            color="#efe5d0"
            roughness={0.95}
            metalness={0.0}
            side={2}
          />
        </mesh>
      )}

      {/* 地板 - 白色细密方格瓷砖（仿帕尔影城视觉） */}
      {floorFineTexture && (
        <mesh
          position={[0, 0.005, roomCenterZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[roomWidth, roomDepth + 4, 32, 32]} />
          <meshStandardMaterial
            map={floorFineTexture.map}
            color="#ffffff"
            roughness={1}
            metalness={0}
            side={2}
          />
        </mesh>
      )}

      {/* 黑色饰带 - 银幕底部 */}
      <mesh position={[0, auditorium.screenBottom + 0.3, baseZ - 0.25]}>
        <boxGeometry args={[auditorium.screenWidth + 1, 0.7, 0.15]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.6} />
      </mesh>

      {/* 柔和白色环境光 */}
      <hemisphereLight
        args={["#ffffff", "#e8e6dd", 1.8]}
        position={[0, roomHeight + 2, roomCenterZ]}
      />
      <directionalLight
        position={[0, roomHeight + 4, baseZ + 2]}
        intensity={0.9}
        color="#fffaf0"
        castShadow={false}
      />
    </group>
  );
}

function SkySphere({
  sceneStyle,
  filmMode,
  auditorium,
}: {
  sceneStyle: string;
  filmMode: boolean;
  auditorium: Auditorium;
}) {
  const lastRowZ =
    auditorium.firstRowZ +
    (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 10;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2;

  const texture = useMemo(() => {
    if (typeof window === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const w = canvas.width;
    const h = canvas.height;

    if (!filmMode) {
      // === DAYTIME / LIGHTS ON SKY ===
      if (sceneStyle === "snowy_greek") {
        // Clear Alpine Azure Sky
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#0284c7");
        grad.addColorStop(0.4, "#38bdf8");
        grad.addColorStop(0.8, "#bae6fd");
        grad.addColorStop(1, "#f0f9ff");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Sun disc
        const sun = ctx.createRadialGradient(w * 0.7, h * 0.25, 5, w * 0.7, h * 0.25, 120);
        sun.addColorStop(0, "#ffffff");
        sun.addColorStop(0.25, "#fef08a");
        sun.addColorStop(1, "rgba(254, 240, 138, 0)");
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, w, h);
      } else if (sceneStyle === "space_station") {
        // Space Orbit Curve
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#020617");
        grad.addColorStop(0.45, "#0f172a");
        grad.addColorStop(0.75, "#0284c7");
        grad.addColorStop(1, "#7dd3fc");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      } else if (sceneStyle === "suzhou_garden") {
        // Jiangnan soft overcast sky
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#78909c");
        grad.addColorStop(0.35, "#b0bec5");
        grad.addColorStop(0.7, "#d7dee2");
        grad.addColorStop(1, "#eceff1");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      } else {
        // General Day Sky (urban_plaza)
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#0369a1");
        grad.addColorStop(0.45, "#38bdf8");
        grad.addColorStop(0.8, "#fef08a");
        grad.addColorStop(1, "#f97316");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Fluffy clouds wrapped 360 degrees
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      for (let i = 0; i < 40; i++) {
        const cx = (i * 87) % w;
        const cy = h * 0.25 + ((i * 37) % (h * 0.35));
        const cr = 20 + (i % 6) * 14;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // === NIGHTTIME STARRY SKY DOME (360 DEGREES) ===
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      if (sceneStyle === "space_station") {
        grad.addColorStop(0, "#010206");
        grad.addColorStop(0.6, "#030712");
        grad.addColorStop(1, "#0369a1");
      } else if (sceneStyle === "suzhou_garden") {
        grad.addColorStop(0, "#0d1117");
        grad.addColorStop(0.5, "#161b22");
        grad.addColorStop(1, "#21262d");
      } else {
        grad.addColorStop(0, "#020617");
        grad.addColorStop(0.6, "#0b132b");
        grad.addColorStop(1, "#1e293b");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Cosmic Nebula / Milky Way Glow overhead
      const neb = ctx.createRadialGradient(w * 0.5, h * 0.2, 10, w * 0.5, h * 0.2, 350);
      neb.addColorStop(0, "rgba(56, 189, 248, 0.28)");
      neb.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, w, h);

      // Moon
      const mx = w * 0.3;
      const my = h * 0.25;
      const moonGlow = ctx.createRadialGradient(mx, my, 4, mx, my, 70);
      moonGlow.addColorStop(0, "#ffffff");
      moonGlow.addColorStop(0.2, "#fef08a");
      moonGlow.addColorStop(1, "rgba(254, 240, 138, 0)");
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(mx, my, 70, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fffbe1";
      ctx.beginPath();
      ctx.arc(mx, my, 14, 0, Math.PI * 2);
      ctx.fill();

      // Twinkling Stars distributed across entire 360° sky dome overhead & behind seats
      const colors = ["#ffffff", "#fef08a", "#bae6fd", "#e0e7ff", "#fbcfe8"];
      for (let i = 0; i < 1200; i++) {
        const sx = pseudoRandom(i * 3) * w;
        const sy = pseudoRandom(i * 3 + 1) * h * 0.85;
        const sr = 0.5 + pseudoRandom(i * 3 + 2) * 2.2;
        const a = 0.35 + pseudoRandom(i * 7) * 0.65;
        ctx.fillStyle = colors[i % colors.length];
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    return tex;
  }, [sceneStyle, filmMode, auditorium]);

  if (sceneStyle === "classic" || !texture) return null;

  return (
    <mesh position={[0, -2, roomCenterZ]}>
      <sphereGeometry args={[350, 64, 64]} />
      <meshBasicMaterial map={texture} side={BackSide} toneMapped={false} />
    </mesh>
  );
}

function AuditoriumArchitecture({
  auditorium,
  filmMode,
  sceneStyle = "classic",
}: Pick<CinemaSceneProps, "auditorium" | "filmMode" | "sceneStyle">) {
  const [aisleLightMaterial] = useState(
    () =>
      new MeshBasicMaterial({
        color: filmMode ? "#8c3e28" : "#e5a66e",
        toneMapped: false,
      }),
  );
  const aisleLightColor = useMemo(() => new Color("#e5a66e"), []);
  const aisleDarkColor = useMemo(() => new Color("#8c3e28"), []);
  const lastRowZ =
    auditorium.firstRowZ +
    (auditorium.rowCount - 1) * auditorium.rowSpacing;
  const roomDepth = lastRowZ - auditorium.screenZ + 10;
  const roomCenterZ = auditorium.screenZ + roomDepth / 2 - 2;
  const roomHeight = Math.max(
    15,
    auditorium.screenBottom + auditorium.screenHeight + 2.2,
  );
  const roomWidth = Math.max(34, auditorium.seatingWidth + 5);
  const halfRoomWidth = roomWidth / 2;
  const platformWidth = roomWidth - 5;
  const aisleLightX = Math.max(14.5, halfRoomWidth - 2.5);
  const acousticPanelX = halfRoomWidth - 1.4;

  useEffect(
    () => () => aisleLightMaterial.dispose(),
    [aisleLightMaterial],
  );
  useFrame((_, delta) => {
    aisleLightMaterial.color.lerp(
      filmMode ? aisleDarkColor : aisleLightColor,
      smoothFactor(delta),
    );
  });

  const platformColor = useMemo(() => {
    if (sceneStyle === "minimalist_cream") return "#222428";
    if (sceneStyle === "imax_giant") return "#111318";
    if (sceneStyle === "warm_wood_lounge") return "#8c5e34";
    if (sceneStyle === "snowy_greek") return "#f1f5f9";
    if (sceneStyle === "alpine_desert") return "#b89874";
    if (sceneStyle === "baroque_opera") return "#881337";
    if (sceneStyle === "space_station") return "#1e293b";
    if (sceneStyle === "urban_plaza") return "#475569";
    if (sceneStyle === "suzhou_garden") return "#5d6d5e";
    if (sceneStyle === "par_cinema") return "#ededed";
    if (sceneStyle === "white_tile_cinema") return "#f5f4ee";
    return "#202329";
  }, [sceneStyle]);

  const platformRoughness = useMemo(() => {
    if (sceneStyle === "minimalist_cream") return 0.92;
    if (sceneStyle === "imax_giant") return 0.85;
    if (sceneStyle === "warm_wood_lounge") return 0.45;
    if (sceneStyle === "snowy_greek") return 0.4;
    if (sceneStyle === "alpine_desert") return 0.92;
    if (sceneStyle === "space_station") return 0.3;
    if (sceneStyle === "suzhou_garden") return 0.8;
    if (sceneStyle === "par_cinema") return 0.7;
    if (sceneStyle === "white_tile_cinema") return 0.45;
    return 0.9;
  }, [sceneStyle]);

  const groundColor = useMemo(() => {
    if (sceneStyle === "minimalist_cream") return "#222428";
    if (sceneStyle === "imax_giant") return "#090a0e";
    if (sceneStyle === "warm_wood_lounge") return "#784e2a";
    if (sceneStyle === "snowy_greek") return "#cbd5e1";
    if (sceneStyle === "alpine_desert") return "#9c7c5c";
    if (sceneStyle === "baroque_opera") return "#451a03";
    if (sceneStyle === "space_station") return "#0f172a";
    if (sceneStyle === "urban_plaza") return "#1e293b";
    if (sceneStyle === "suzhou_garden") return "#4a5a4b";
    if (sceneStyle === "par_cinema") return "#ededed";
    if (sceneStyle === "white_tile_cinema") return "#f4f3ed";
    return "#191b1f";
  }, [sceneStyle]);

  return (
    <group>
      <SkySphere sceneStyle={sceneStyle} filmMode={filmMode} auditorium={auditorium} />

      {/* Render theme backdrop */}
      {sceneStyle === "minimalist_cream" && <MinimalistCreamBackdrop auditorium={auditorium} />}
      {sceneStyle === "imax_giant" && <ImaxGiantBackdrop auditorium={auditorium} />}
      {sceneStyle === "warm_wood_lounge" && <WarmWoodLoungeBackdrop auditorium={auditorium} />}
      {sceneStyle === "urban_plaza" && <UrbanPlazaBackdrop auditorium={auditorium} />}
      {sceneStyle === "snowy_greek" && <SnowMountainBackdrop auditorium={auditorium} />}
      {sceneStyle === "space_station" && <SpaceStationBackdrop auditorium={auditorium} />}
      {sceneStyle === "alpine_desert" && <AlpineDesertBackdrop auditorium={auditorium} />}
      {sceneStyle === "baroque_opera" && <BaroqueOperaBackdrop auditorium={auditorium} />}
      {sceneStyle === "suzhou_garden" && <SuzhouGardenBackdrop auditorium={auditorium} />}
      {sceneStyle === "par_cinema" && <ParCinemaBackdrop auditorium={auditorium} />}
      {sceneStyle === "white_tile_cinema" && <WhiteTileCinemaBackdrop auditorium={auditorium} />}

      {/* Ground plane */}
      <mesh position={[0, -0.5, roomCenterZ]} receiveShadow>
        <boxGeometry args={[roomWidth, 1, roomDepth]} />
        <meshStandardMaterial color={groundColor} roughness={0.9} />
      </mesh>

      {/* Tiered Seating Platforms for ALL themes */}
      {Array.from({ length: auditorium.rowCount }, (_, row) => {
        const y = cinemaSeatGeometry.rowFloorBaseY + row * auditorium.rowRise;
        const z = auditorium.firstRowZ + row * auditorium.rowSpacing;
        return (
          <group key={row}>
            <mesh position={[0, y - 0.37, z + 0.1]} receiveShadow>
              <boxGeometry args={[platformWidth, 0.72, auditorium.rowSpacing + 0.08]} />
              <meshStandardMaterial color={platformColor} roughness={platformRoughness} />
            </mesh>

            {/* Glowing Edge Strips for Space Station */}
            {sceneStyle === "space_station" && (
              <mesh position={[0, y - 0.01, z - auditorium.rowSpacing / 2 + 0.05]}>
                <boxGeometry args={[platformWidth, 0.04, 0.08]} />
                <meshBasicMaterial color="#38bdf8" toneMapped={false} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Indoor walls & panels only for Classic theme */}
      {sceneStyle === "classic" && (
        <>
          <mesh position={[-halfRoomWidth, roomHeight / 2, roomCenterZ]} receiveShadow>
            <boxGeometry args={[1.2, roomHeight, roomDepth]} />
            <meshStandardMaterial color="#23262b" roughness={0.92} />
          </mesh>
          <mesh position={[halfRoomWidth, roomHeight / 2, roomCenterZ]} receiveShadow>
            <boxGeometry args={[1.2, roomHeight, roomDepth]} />
            <meshStandardMaterial color="#23262b" roughness={0.92} />
          </mesh>
          <mesh position={[0, roomHeight + 0.6, roomCenterZ]} receiveShadow>
            <boxGeometry args={[roomWidth + 1.2, 1.2, roomDepth]} />
            <meshStandardMaterial color="#101114" roughness={0.96} />
          </mesh>
          <mesh position={[0, roomHeight / 2, lastRowZ + 5]} receiveShadow>
            <boxGeometry args={[roomWidth, roomHeight, 1]} />
            <meshStandardMaterial color="#202227" roughness={0.96} />
          </mesh>

          {[-aisleLightX, aisleLightX].map((x) =>
            Array.from({ length: 8 }, (_, index) => (
              <mesh
                key={`${x}-${index}`}
                position={[
                  x,
                  1 + index * 0.72,
                  auditorium.firstRowZ + index * auditorium.rowSpacing + 0.85,
                ]}
              >
                <boxGeometry args={[0.8, 0.06, 0.34]} />
                <primitive object={aisleLightMaterial} attach="material" />
              </mesh>
            )),
          )}

          {[-acousticPanelX, acousticPanelX].map((x) => (
            <group key={x}>
              <mesh position={[x, 6.8, -5]}>
                <boxGeometry args={[0.08, 7.8, 17]} />
                <meshStandardMaterial color="#27282b" roughness={0.98} />
              </mesh>
              <mesh position={[x, 6.8, 12]}>
                <boxGeometry args={[0.08, 7.8, 14]} />
                <meshStandardMaterial color="#27282b" roughness={0.98} />
              </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  );
}

function Seats({
  seats,
  selectedSeat,
  filmMode,
  sceneStyle = "classic",
}: Pick<
  CinemaSceneProps,
  "seats" | "selectedSeat" | "filmMode" | "sceneStyle"
>) {
  const cushionRef = useRef<InstancedMesh>(null);
  const backRef = useRef<InstancedMesh>(null);
  const backShellRef = useRef<InstancedMesh>(null);
  const sidePanelRef = useRef<InstancedMesh>(null);
  const cushionMaterialRef = useRef<MeshPhysicalMaterial>(null);
  const backMaterialRef = useRef<MeshPhysicalMaterial>(null);
  const backShellMaterialRef = useRef<MeshPhysicalMaterial>(null);
  const sidePanelMaterialRef = useRef<MeshPhysicalMaterial>(null);
  const armCapRef = useRef<InstancedMesh>(null);
  const cupHolderRef = useRef<InstancedMesh>(null);
  const legRef = useRef<InstancedMesh>(null);
  const footRef = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => new Matrix4(), []);
  const seatObject = useMemo(() => new Object3D(), []);
  const cushionGeometry = useMemo(
    () => new RoundedBoxGeometry(0.58, 0.18, 0.54, 3, 0.08),
    [],
  );
  const backGeometry = useMemo(
    () => createCinemaSeatBackGeometry(),
    [],
  );
  const sidePanelGeometry = useMemo(
    () => new RoundedBoxGeometry(0.12, 0.56, 0.63, 3, 0.05),
    [],
  );
  const armCapGeometry = useMemo(
    () => new RoundedBoxGeometry(0.14, 0.08, 0.62, 3, 0.035),
    [],
  );
  const seatColors = useMemo(() => {
    if (sceneStyle === "minimalist_cream") {
      return {
        available: {
          upholstery: new Color("#181a1f"),
          shell: new Color("#0f1013"),
          panel: new Color("#252830"),
        },
        selected: {
          upholstery: new Color("#0284c7"),
          shell: new Color("#0369a1"),
          panel: new Color("#38bdf8"),
        },
        occupied: {
          upholstery: new Color("#0b0c0e"),
          shell: new Color("#060708"),
          panel: new Color("#121417"),
        },
      };
    }
    if (sceneStyle === "imax_giant") {
      return {
        available: {
          upholstery: new Color("#1c222b"),
          shell: new Color("#11151c"),
          panel: new Color("#2a323d"),
        },
        selected: {
          upholstery: new Color("#0284c7"),
          shell: new Color("#0369a1"),
          panel: new Color("#38bdf8"),
        },
        occupied: {
          upholstery: new Color("#0f1217"),
          shell: new Color("#0a0c0f"),
          panel: new Color("#161a21"),
        },
      };
    }
    if (sceneStyle === "warm_wood_lounge") {
      return {
        available: {
          upholstery: new Color("#1c3d2e"),
          shell: new Color("#663e20"),
          panel: new Color("#7a4b26"),
        },
        selected: {
          upholstery: new Color("#2f6d50"),
          shell: new Color("#8a5328"),
          panel: new Color("#d97706"),
        },
        occupied: {
          upholstery: new Color("#112419"),
          shell: new Color("#3d2412"),
          panel: new Color("#2d1a0d"),
        },
      };
    }
    if (sceneStyle === "snowy_greek") {
      return {
        available: {
          upholstery: new Color("#cbd5e1"),
          shell: new Color("#e2e8f0"),
          panel: new Color("#94a3b8"),
        },
        selected: {
          upholstery: new Color("#38bdf8"),
          shell: new Color("#0284c7"),
          panel: new Color("#7dd3fc"),
        },
        occupied: {
          upholstery: new Color("#64748b"),
          shell: new Color("#475569"),
          panel: new Color("#334155"),
        },
      };
    }
    if (sceneStyle === "space_station") {
      return {
        available: {
          upholstery: new Color("#1e293b"),
          shell: new Color("#0f172a"),
          panel: new Color("#38bdf8"),
        },
        selected: {
          upholstery: new Color("#0284c7"),
          shell: new Color("#0369a1"),
          panel: new Color("#7dd3fc"),
        },
        occupied: {
          upholstery: new Color("#334155"),
          shell: new Color("#1e293b"),
          panel: new Color("#475569"),
        },
      };
    }
    if (sceneStyle === "alpine_desert") {
      return {
        available: {
          upholstery: new Color("#dc2626"),
          shell: new Color("#991b1b"),
          panel: new Color("#7f1d1d"),
        },
        selected: {
          upholstery: new Color("#38bdf8"),
          shell: new Color("#0284c7"),
          panel: new Color("#7dd3fc"),
        },
        occupied: {
          upholstery: new Color("#450a0a"),
          shell: new Color("#290606"),
          panel: new Color("#1c0404"),
        },
      };
    }
    if (sceneStyle === "baroque_opera") {
      return {
        available: {
          upholstery: new Color("#991b1b"),
          shell: new Color("#451a03"),
          panel: new Color("#eab308"),
        },
        selected: {
          upholstery: new Color("#f59e0b"),
          shell: new Color("#ca8a04"),
          panel: new Color("#fef08a"),
        },
        occupied: {
          upholstery: new Color("#450a0a"),
          shell: new Color("#1a0702"),
          panel: new Color("#854d0e"),
        },
      };
    }
    if (sceneStyle === "suzhou_garden") {
      return {
        available: {
          upholstery: new Color("#4a5a4b"),
          shell: new Color("#6b4226"),
          panel: new Color("#8d6e63"),
        },
        selected: {
          upholstery: new Color("#d4a017"),
          shell: new Color("#b8860b"),
          panel: new Color("#ffd700"),
        },
        occupied: {
          upholstery: new Color("#2d3a2e"),
          shell: new Color("#3e2723"),
          panel: new Color("#4e342e"),
        },
      };
    }
    if (sceneStyle === "par_cinema") {
      return {
        available: {
          upholstery: new Color("#1f2126"),
          shell: new Color("#0a0b0d"),
          panel: new Color("#2a2d33"),
        },
        selected: {
          upholstery: new Color("#0ea5e9"),
          shell: new Color("#0369a1"),
          panel: new Color("#7dd3fc"),
        },
        occupied: {
          upholstery: new Color("#0a0b0d"),
          shell: new Color("#050507"),
          panel: new Color("#15171c"),
        },
      };
    }
    if (sceneStyle === "white_tile_cinema") {
      return {
        available: {
          upholstery: new Color("#c1272d"),
          shell: new Color("#1a1a1a"),
          panel: new Color("#0a0a0a"),
        },
        selected: {
          upholstery: new Color("#ef4444"),
          shell: new Color("#27272a"),
          panel: new Color("#3f3f46"),
        },
        occupied: {
          upholstery: new Color("#7f1d1d"),
          shell: new Color("#0a0a0a"),
          panel: new Color("#18181b"),
        },
      };
    }
    return {
      available: {
        upholstery: new Color("#b52b52"),
        shell: new Color("#8f1e3e"),
        panel: new Color("#781832"),
      },
      selected: {
        upholstery: new Color("#df5274"),
        shell: new Color("#ad3152"),
        panel: new Color("#922542"),
      },
      occupied: {
        upholstery: new Color("#65162f"),
        shell: new Color("#4f1025"),
        panel: new Color("#420c1e"),
      },
    };
  }, [sceneStyle]);

  useLayoutEffect(() => {
    if (
      !cushionRef.current ||
      !backRef.current ||
      !backShellRef.current ||
      !sidePanelRef.current ||
      !armCapRef.current ||
      !cupHolderRef.current ||
      !legRef.current ||
      !footRef.current
    ) {
      return;
    }

    const placePart = (
      mesh: InstancedMesh,
      instanceIndex: number,
      position: [number, number, number],
      rotation: [number, number, number],
      scale: [number, number, number],
    ) => {
      seatObject.position.set(...position);
      seatObject.rotation.set(...rotation);
      seatObject.scale.set(...scale);
      seatObject.updateMatrix();
      matrix.copy(seatObject.matrix);
      mesh.setMatrixAt(instanceIndex, matrix);
    };

    const isGreek = sceneStyle === "snowy_greek";
    const isMinimalistCream = sceneStyle === "minimalist_cream";
    const isFlatFloor = sceneStyle === "urban_plaza";

    seats.forEach((seat, index) => {
      const actualY = isFlatFloor ? 0 : seat.y;
      if (isGreek) {
        // Ancient Greek Stone Bench Seat Pad
        placePart(
          cushionRef.current!,
          index,
          [seat.x, seat.y + 0.38, seat.z + 0.04],
          [0, 0, 0],
          [0.85, 0.45, 0.85],
        );
        // Stone Bench Back Cushion
        placePart(
          backRef.current!,
          index,
          [seat.x, seat.y + 0.62, seat.z + 0.28],
          [0, 0, 0],
          [0.85, 0.45, 0.4],
        );
        // Hide modern backshell
        placePart(
          backShellRef.current!,
          index,
          [seat.x, seat.y, seat.z],
          [0, 0, 0],
          [0, 0, 0],
        );

        [-0.35, 0.35].forEach((xOffset, sideIndex) => {
          placePart(
            sidePanelRef.current!,
            index * 2 + sideIndex,
            [seat.x, seat.y, seat.z],
            [0, 0, 0],
            [0, 0, 0],
          );
          placePart(
            armCapRef.current!,
            index * 2 + sideIndex,
            [seat.x, seat.y, seat.z],
            [0, 0, 0],
            [0, 0, 0],
          );
          placePart(
            legRef.current!,
            index * 2 + sideIndex,
            [seat.x, seat.y, seat.z],
            [0, 0, 0],
            [0, 0, 0],
          );
          placePart(
            footRef.current!,
            index * 2 + sideIndex,
            [seat.x, seat.y, seat.z],
            [0, 0, 0],
            [0, 0, 0],
          );
        });

        placePart(
          cupHolderRef.current!,
          index,
          [seat.x, seat.y, seat.z],
          [0, 0, 0],
          [0, 0, 0],
        );
      } else if (isMinimalistCream) {
        // 极简米色艺术影厅 - 完美复刻图片：黑色悬臂 Z型/S型流线雕塑椅
        placePart(
          cushionRef.current!,
          index,
          [seat.x, actualY + 0.42, seat.z - 0.02],
          [-0.14, 0, 0],
          [0.82, 0.65, 0.9],
        );
        placePart(
          backRef.current!,
          index,
          [seat.x, actualY + 0.86, seat.z + 0.25],
          [0.1, 0, 0],
          [0.78, 0.62, 1.05],
        );
        // 隐藏传统塑料背壳
        placePart(
          backShellRef.current!,
          index,
          [seat.x, actualY, seat.z],
          [0, 0, 0],
          [0, 0, 0],
        );

        // 黑色悬臂 Z 型支柱底座：从底部斜向前上方倾斜拉出，支撑整体雕塑身形
        placePart(
          legRef.current!,
          index * 2,
          [seat.x, actualY + 0.2, seat.z - 0.08],
          [-0.72, 0, 0],
          [0.65, 0.48, 0.85],
        );
        placePart(
          legRef.current!,
          index * 2 + 1,
          [seat.x, actualY, seat.z],
          [0, 0, 0],
          [0, 0, 0],
        );

        // 隐藏两侧传统扶手、侧面板与脚架，形成高雅的无界独栋悬臂椅
        [-0.35, 0.35].forEach((xOffset, sideIndex) => {
          placePart(
            sidePanelRef.current!,
            index * 2 + sideIndex,
            [seat.x, actualY, seat.z],
            [0, 0, 0],
            [0, 0, 0],
          );
          placePart(
            armCapRef.current!,
            index * 2 + sideIndex,
            [seat.x, actualY, seat.z],
            [0, 0, 0],
            [0, 0, 0],
          );
          placePart(
            footRef.current!,
            index * 2 + sideIndex,
            [seat.x, actualY, seat.z],
            [0, 0, 0],
            [0, 0, 0],
          );
        });

        placePart(
          cupHolderRef.current!,
          index,
          [seat.x, actualY, seat.z],
          [0, 0, 0],
          [0, 0, 0],
        );
      } else {
        placePart(
          cushionRef.current!,
          index,
          [
            seat.x,
            actualY + cinemaSeatGeometry.cushionCenterAboveFloor,
            seat.z - 0.03,
          ],
          [-0.08, 0, 0],
          [1, 1, 1],
        );
        placePart(
          backShellRef.current!,
          index,
          [
            seat.x,
            actualY + cinemaSeatGeometry.backCenterAboveFloor,
            seat.z + 0.32,
          ],
          [cinemaSeatGeometry.backrestReclineRadians, 0, 0],
          [0.71, 0.57, 1.02],
        );
        placePart(
          backRef.current!,
          index,
          [
            seat.x,
            actualY + cinemaSeatGeometry.backCenterAboveFloor,
            seat.z + 0.23,
          ],
          [cinemaSeatGeometry.backrestReclineRadians, 0, 0],
          [0.68, 0.54, 0.9],
        );

        [-0.35, 0.35].forEach((xOffset, sideIndex) => {
          placePart(
            sidePanelRef.current!,
            index * 2 + sideIndex,
            [seat.x + xOffset, actualY + 0.34, seat.z + 0.06],
            [-0.055, 0, 0],
            [1, 1, 1],
          );
          placePart(
            armCapRef.current!,
            index * 2 + sideIndex,
            [
              seat.x + xOffset,
              actualY + cinemaSeatGeometry.armrestAboveFloor,
              seat.z + 0.05,
            ],
            [-0.055, 0, 0],
            [1, 1, 1],
          );
          placePart(
            legRef.current!,
            index * 2 + sideIndex,
            [seat.x + xOffset * 0.72, actualY + 0.2, seat.z + 0.16],
            [0, 0, 0],
            [1, 1, 1],
          );
          placePart(
            footRef.current!,
            index * 2 + sideIndex,
            [seat.x + xOffset * 0.72, actualY + 0.03, seat.z + 0.12],
            [0, 0, 0],
            [1, 1, 1],
          );
        });

        placePart(
          cupHolderRef.current!,
          index,
          [
            seat.x + 0.35,
            actualY + cinemaSeatGeometry.armrestAboveFloor + 0.015,
            seat.z - 0.2,
          ],
          [Math.PI / 2, 0, 0],
          [1, 1, 1],
        );
      }
    });

    [
      cushionRef.current,
      backRef.current,
      backShellRef.current,
      sidePanelRef.current,
      armCapRef.current,
      cupHolderRef.current,
      legRef.current,
      footRef.current,
    ].forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [matrix, seatObject, seats, sceneStyle]);

  useLayoutEffect(() => {
    if (
      !cushionRef.current ||
      !backRef.current ||
      !backShellRef.current ||
      !sidePanelRef.current
    ) {
      return;
    }

    seats.forEach((seat, index) => {
      const colors =
        seat.id === selectedSeat.id
          ? seatColors.selected
          : seat.status === "occupied"
            ? seatColors.occupied
            : seatColors.available;
      cushionRef.current?.setColorAt(index, colors.upholstery);
      backRef.current?.setColorAt(index, colors.upholstery);
      backShellRef.current?.setColorAt(index, colors.shell);
      sidePanelRef.current?.setColorAt(index * 2, colors.panel);
      sidePanelRef.current?.setColorAt(index * 2 + 1, colors.panel);
    });

    [
      cushionRef.current,
      backRef.current,
      backShellRef.current,
      sidePanelRef.current,
    ].forEach((mesh) => {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [seatColors, seats, selectedSeat.id]);

  useFrame((_, delta) => {
    const factor = smoothFactor(delta);
    tuneSeatMaterial(
      cushionMaterialRef.current,
      factor,
      filmMode ? 0.09 : 0.3,
      filmMode ? 0.09 : 0.14,
      filmMode ? 0.017 : 0.025,
    );
    tuneSeatMaterial(
      backMaterialRef.current,
      factor,
      filmMode ? 0.09 : 0.3,
      filmMode ? 0.1 : 0.16,
      filmMode ? 0.017 : 0.025,
    );
    tuneSeatMaterial(
      backShellMaterialRef.current,
      factor,
      filmMode ? 0.045 : 0.27,
      filmMode ? 0.035 : 0.05,
      filmMode ? 0.014 : 0.02,
    );
    tuneSeatMaterial(
      sidePanelMaterialRef.current,
      factor,
      filmMode ? 0.045 : 0.27,
      filmMode ? 0.055 : 0.08,
      filmMode ? 0.014 : 0.02,
    );
  });

  return (
    <group>
      <instancedMesh
        ref={cushionRef}
        args={[undefined, undefined, seats.length]}
        castShadow
      >
        <primitive object={cushionGeometry} attach="geometry" />
        <meshPhysicalMaterial
          ref={cushionMaterialRef}
          vertexColors
          roughness={0.93}
          metalness={0}
          emissive="#7a1236"
          emissiveIntensity={0.3}
          specularIntensity={0.025}
          specularColor="#6f1732"
          sheen={0.14}
          sheenColor="#a53252"
          sheenRoughness={0.98}
        />
      </instancedMesh>
      <instancedMesh
        ref={backShellRef}
        args={[undefined, undefined, seats.length]}
        castShadow
      >
        <primitive object={backGeometry} attach="geometry" />
        <meshPhysicalMaterial
          ref={backShellMaterialRef}
          vertexColors
          roughness={0.95}
          metalness={0}
          emissive="#65102e"
          emissiveIntensity={0.27}
          specularIntensity={0.02}
          specularColor="#5c122a"
          sheen={0.05}
          sheenColor="#862642"
          sheenRoughness={1}
        />
      </instancedMesh>
      <instancedMesh
        ref={backRef}
        args={[undefined, undefined, seats.length]}
        castShadow
      >
        <primitive object={backGeometry} attach="geometry" />
        <meshPhysicalMaterial
          ref={backMaterialRef}
          vertexColors
          roughness={0.93}
          metalness={0}
          emissive="#7a1236"
          emissiveIntensity={0.3}
          specularIntensity={0.025}
          specularColor="#6f1732"
          sheen={0.16}
          sheenColor="#a53252"
          sheenRoughness={0.98}
        />
      </instancedMesh>
      <instancedMesh
        ref={sidePanelRef}
        args={[undefined, undefined, seats.length * 2]}
      >
        <primitive object={sidePanelGeometry} attach="geometry" />
        <meshPhysicalMaterial
          ref={sidePanelMaterialRef}
          vertexColors
          roughness={0.95}
          metalness={0}
          emissive="#65102e"
          emissiveIntensity={0.27}
          specularIntensity={0.02}
          specularColor="#5c122a"
          sheen={0.08}
          sheenColor="#862642"
          sheenRoughness={1}
        />
      </instancedMesh>
      <instancedMesh
        ref={armCapRef}
        args={[undefined, undefined, seats.length * 2]}
      >
        <primitive object={armCapGeometry} attach="geometry" />
        <meshStandardMaterial
          color="#09090b"
          roughness={0.86}
          metalness={0.01}
        />
      </instancedMesh>
      <instancedMesh
        ref={cupHolderRef}
        args={[undefined, undefined, seats.length]}
      >
        <torusGeometry args={[0.055, 0.018, 6, 12]} />
        <meshBasicMaterial color="#050506" toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={legRef}
        args={[undefined, undefined, seats.length * 2]}
      >
        <boxGeometry args={[0.08, 0.36, 0.1]} />
        <meshStandardMaterial
          color="#111216"
          roughness={0.56}
          metalness={0.48}
        />
      </instancedMesh>
      <instancedMesh
        ref={footRef}
        args={[undefined, undefined, seats.length * 2]}
      >
        <boxGeometry args={[0.22, 0.04, 0.32]} />
        <meshStandardMaterial
          color="#101115"
          roughness={0.5}
          metalness={0.52}
        />
      </instancedMesh>

      {/* Soft Draped Knitted Throw Blankets for Warm Wood Lounge Theme */}
      {sceneStyle === "warm_wood_lounge" &&
        seats.map((seat, idx) => {
          if (idx === 0 || idx === 2 || idx === 4) {
            return (
              <group
                key={`blanket-${seat.id}`}
                position={[seat.x + 0.12, seat.y + 0.48, seat.z - 0.02]}
                rotation={[-0.15, 0.1, -0.08]}
              >
                {/* Main blanket draped over seat cushion & armrest */}
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[0.38, 0.35, 0.42]} />
                  <meshStandardMaterial
                    color="#dfdad8"
                    roughness={0.92}
                    metalness={0.02}
                  />
                </mesh>
                <mesh
                  position={[-0.12, -0.15, 0.18]}
                  rotation={[0.3, -0.1, 0.2]}
                  castShadow
                >
                  <boxGeometry args={[0.32, 0.28, 0.18]} />
                  <meshStandardMaterial
                    color="#c8c2c0"
                    roughness={0.92}
                  />
                </mesh>
              </group>
            );
          }
          return null;
        })}
    </group>
  );
}

function SceneLighting({
  filmMode,
  isMobile,
  sceneStyle = "classic",
}: Pick<CinemaSceneProps, "filmMode" | "isMobile" | "sceneStyle">) {
  const backgroundRef = useRef<Color>(null);
  const fogRef = useRef<Fog>(null);
  const ambientRef = useRef<AmbientLight>(null);
  const hemisphereRef = useRef<HemisphereLight>(null);
  const houseSpotRefs = useRef<Array<SpotLight | null>>([]);
  const housePointRef = useRef<PointLight>(null);
  const litBackground = useMemo(() => {
    if (sceneStyle === "minimalist_cream") return new Color("#30281e");
    if (sceneStyle === "imax_giant") return new Color("#0b0d12");
    if (sceneStyle === "warm_wood_lounge") return new Color("#18110a");
    if (sceneStyle === "snowy_greek") return new Color("#0a1128");
    if (sceneStyle === "space_station") return new Color("#02040a");
    if (sceneStyle === "par_cinema") return new Color("#0d0f12");
    if (sceneStyle === "white_tile_cinema") return new Color("#fbfaf6");
    return new Color("#111317");
  }, [sceneStyle]);

  const darkBackground = useMemo(() => {
    if (sceneStyle === "minimalist_cream") return new Color("#16120d");
    if (sceneStyle === "imax_giant") return new Color("#040507");
    if (sceneStyle === "warm_wood_lounge") return new Color("#0c0804");
    if (sceneStyle === "snowy_greek") return new Color("#060b1b");
    if (sceneStyle === "space_station") return new Color("#010205");
    if (sceneStyle === "par_cinema") return new Color("#05070a");
    if (sceneStyle === "white_tile_cinema") return new Color("#e7e5dc");
    return new Color("#07080a");
  }, [sceneStyle]);

  const litFog = useMemo(() => {
    if (sceneStyle === "minimalist_cream") return new Color("#3a3126");
    if (sceneStyle === "imax_giant") return new Color("#0e1118");
    if (sceneStyle === "warm_wood_lounge") return new Color("#21180e");
    if (sceneStyle === "snowy_greek") return new Color("#0c1535");
    if (sceneStyle === "space_station") return new Color("#030712");
    if (sceneStyle === "par_cinema") return new Color("#10131a");
    if (sceneStyle === "white_tile_cinema") return new Color("#f0eee5");
    return new Color("#15171b");
  }, [sceneStyle]);

  const darkFog = useMemo(() => {
    if (sceneStyle === "minimalist_cream") return new Color("#1a1510");
    if (sceneStyle === "imax_giant") return new Color("#050608");
    if (sceneStyle === "warm_wood_lounge") return new Color("#0d0804");
    if (sceneStyle === "snowy_greek") return new Color("#070d22");
    if (sceneStyle === "space_station") return new Color("#010308");
    if (sceneStyle === "par_cinema") return new Color("#06080c");
    if (sceneStyle === "white_tile_cinema") return new Color("#dad7cc");
    return new Color("#08090b");
  }, [sceneStyle]);

  const litAmbient = useMemo(() => {
    if (sceneStyle === "alpine_desert") return new Color("#fef3c7");
    if (sceneStyle === "imax_giant") return new Color("#cbd5e1");
    if (sceneStyle === "warm_wood_lounge") return new Color("#fde68a");
    if (sceneStyle === "snowy_greek") return new Color("#e2e8f0");
    if (sceneStyle === "space_station") return new Color("#e0f2fe");
    if (sceneStyle === "urban_plaza") return new Color("#dbeafe");
    if (sceneStyle === "par_cinema") return new Color("#fff8e1");
    if (sceneStyle === "white_tile_cinema") return new Color("#ffffff");
    return new Color("#fef08a");
  }, [sceneStyle]);

  const darkAmbient = useMemo(() => {
    if (sceneStyle === "alpine_desert") return new Color("#2a1210");
    if (sceneStyle === "minimalist_cream") return new Color("#713f12");
    if (sceneStyle === "imax_giant") return new Color("#334155");
    if (sceneStyle === "warm_wood_lounge") return new Color("#78350f");
    if (sceneStyle === "snowy_greek") return new Color("#1d4ed8");
    if (sceneStyle === "space_station") return new Color("#0284c7");
    if (sceneStyle === "urban_plaza") return new Color("#1e3a8a");
    if (sceneStyle === "par_cinema") return new Color("#1f2937");
    if (sceneStyle === "white_tile_cinema") return new Color("#f0eee5");
    return new Color("#881337");
  }, [sceneStyle]);

  const skyColor = useMemo(() => {
    if (sceneStyle === "alpine_desert") return new Color("#38bdf8");
    if (sceneStyle === "minimalist_cream") return new Color("#fde047");
    if (sceneStyle === "warm_wood_lounge") return new Color("#fef08a");
    if (sceneStyle === "snowy_greek") return new Color("#38bdf8");
    if (sceneStyle === "space_station") return new Color("#38bdf8");
    if (sceneStyle === "urban_plaza") return new Color("#60a5fa");
    if (sceneStyle === "par_cinema") return new Color("#e2e8f0");
    if (sceneStyle === "white_tile_cinema") return new Color("#fafaf6");
    return new Color("#fb7185");
  }, [sceneStyle]);

  const groundColor = useMemo(() => {
    if (sceneStyle === "alpine_desert") return new Color("#b89874");
    if (sceneStyle === "minimalist_cream") return new Color("#1f2024");
    if (sceneStyle === "warm_wood_lounge") return new Color("#452b14");
    if (sceneStyle === "snowy_greek") return new Color("#0f172a");
    if (sceneStyle === "space_station") return new Color("#0f172a");
    if (sceneStyle === "urban_plaza") return new Color("#0f172a");
    return new Color("#1c1917");
  }, [sceneStyle]);

  const [initialHouseLights] = useState(() => (filmMode ? 0 : 1));

  useFrame((_, delta) => {
    const factor = smoothFactor(delta);
    const houseLevel = filmMode ? 0 : 1;
    backgroundRef.current?.lerp(
      filmMode ? darkBackground : litBackground,
      factor,
    );
    fogRef.current?.color.lerp(filmMode ? darkFog : litFog, factor);

    if (ambientRef.current) {
      ambientRef.current.intensity +=
        ((filmMode ? 0.45 : 1.45) - ambientRef.current.intensity) * factor;
      ambientRef.current.color.lerp(
        filmMode ? darkAmbient : litAmbient,
        factor,
      );
    }
    if (hemisphereRef.current) {
      hemisphereRef.current.intensity +=
        ((filmMode ? 0.38 : 0.95) - hemisphereRef.current.intensity) * factor;
    }
    houseSpotRefs.current.forEach((light) => {
      if (light) {
        light.intensity += (820 * houseLevel - light.intensity) * factor;
      }
    });
    if (housePointRef.current) {
      housePointRef.current.intensity +=
        (260 * houseLevel - housePointRef.current.intensity) * factor;
    }
  });

  return (
    <>
      <color
        ref={backgroundRef}
        attach="background"
        args={[
          initialHouseLights
            ? sceneStyle === "snowy_greek"
              ? "#0a1128"
              : "#111317"
            : sceneStyle === "snowy_greek"
              ? "#060b1b"
              : "#07080a",
        ]}
      />
      <fog
        ref={fogRef}
        attach="fog"
        args={[
          initialHouseLights
            ? sceneStyle === "snowy_greek"
              ? "#0c1535"
              : "#15171b"
            : sceneStyle === "snowy_greek"
              ? "#070d22"
              : "#08090b",
          sceneStyle === "classic" ? 20 : 150,
          sceneStyle === "classic" ? (isMobile ? 65 : 90) : 480,
        ]}
      />
      <ambientLight
        ref={ambientRef}
        intensity={initialHouseLights ? 0.92 : 0.22}
        color={
          initialHouseLights
            ? sceneStyle === "snowy_greek"
              ? "#cbd5e1"
              : "#d7c7b8"
            : sceneStyle === "snowy_greek"
              ? "#64748b"
              : "#75808a"
        }
      />
      <hemisphereLight
        ref={hemisphereRef}
        args={[
          skyColor,
          groundColor,
          initialHouseLights ? 0.65 : 0.38,
        ]}
      />
      {[-12, 12].map((x, index) => (
        <spotLight
          key={x}
          ref={(light) => {
            houseSpotRefs.current[index] = light;
          }}
          position={[x, 13, 8]}
          target-position={[0, 2, -2]}
          angle={0.66}
          penumbra={0.9}
          intensity={820 * initialHouseLights}
          distance={54}
          color={sceneStyle === "snowy_greek" ? "#e0f2fe" : "#f0c6a7"}
          castShadow={!isMobile}
        />
      ))}
      <pointLight
        ref={housePointRef}
        position={[0, 12, 12]}
        color={sceneStyle === "snowy_greek" ? "#bae6fd" : "#f3c7a6"}
        intensity={260 * initialHouseLights}
        distance={48}
        decay={1.7}
      />
      <directionalLight
        position={[20, 55, 30]}
        intensity={filmMode ? 0.3 : 2.2}
        color={
          sceneStyle === "snowy_greek"
            ? "#e0f2fe"
            : sceneStyle === "space_station"
            ? "#bae6fd"
            : sceneStyle === "urban_plaza"
            ? "#bfdbfe"
            : "#fef08a"
        }
        castShadow={!isMobile}
      />
    </>
  );
}

function SceneContents(
  props: CinemaSceneProps & { onFilmReady: () => void },
) {
  const { auditorium, filmMode, isMobile, sceneStyle = "classic" } = props;

  return (
    <>
      <SceneLighting
        filmMode={filmMode}
        isMobile={isMobile}
        sceneStyle={sceneStyle}
      />
      {sceneStyle === "urban_plaza" && (
        <UrbanPlazaBackdrop auditorium={auditorium} />
      )}
      {sceneStyle === "snowy_greek" && (
        <SnowMountainBackdrop auditorium={auditorium} />
      )}
      {sceneStyle === "alpine_desert" && (
        <AlpineDesertBackdrop auditorium={auditorium} />
      )}
      {sceneStyle === "baroque_opera" && (
        <BaroqueOperaBackdrop auditorium={auditorium} />
      )}
      <Screen
        auditorium={auditorium}
        filmMode={filmMode}
        sceneStyle={sceneStyle}
        playing={props.playing}
        videoSrc={props.videoSrc}
        playbackRate={props.playbackRate}
        fitMode={props.fitMode}
        audioMode={props.audioMode}
        volume={props.volume}
        seekTime={props.seekTime}
        skipTailSeconds={props.skipTailSeconds}
        onTimeUpdate={props.onTimeUpdate}
        onFilmReady={props.onFilmReady}
      />
      <AuditoriumArchitecture
        auditorium={auditorium}
        filmMode={filmMode}
        sceneStyle={sceneStyle}
      />
      <Seats
        seats={props.seats}
        selectedSeat={props.selectedSeat}
        filmMode={filmMode}
        sceneStyle={sceneStyle}
      />
      <CameraRig
        auditorium={auditorium}
        selectedSeat={props.selectedSeat}
        viewCommand={props.viewCommand}
        cameraPreset={props.cameraPreset}
        freeMove={props.freeMove}
      />
    </>
  );
}

export function CinemaScene(props: CinemaSceneProps) {
  const screenMediaOverlayRef = useRef<HTMLDivElement>(null);
  const [readyPlaybackToken, setReadyPlaybackToken] = useState<number | null>(
    null,
  );
  const filmReady = readyPlaybackToken === props.playbackToken;
  const markFilmReady = useCallback(
    () => setReadyPlaybackToken(props.playbackToken),
    [props.playbackToken],
  );
  const screenMediaActive = props.playing;
  const initialCameraPosition: [number, number, number] = [
    props.selectedSeat.x,
    getSeatEyeY(props.selectedSeat),
    props.selectedSeat.z,
  ];

  return (
    <>
      <Canvas
        className="cinema-canvas"
        dpr={props.isMobile ? [0.85, 1.1] : [1, 1.5]}
        camera={{
          position: initialCameraPosition,
          fov: 60,
          near: 0.1,
          far: 120,
        }}
        gl={{
          antialias: !props.isMobile,
          alpha: false,
          powerPreference: props.isMobile ? "low-power" : "high-performance",
          precision: props.isMobile ? "mediump" : "highp",
        }}
        shadows={!props.isMobile}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.28;
        }}
      >
        <Suspense fallback={null}>
          <SceneContents {...props} onFilmReady={markFilmReady} />
          <ScreenMediaOverlayTracker
            auditorium={props.auditorium}
            active={screenMediaActive}
            overlayRef={screenMediaOverlayRef}
          />
        </Suspense>
      </Canvas>
      <div
        ref={screenMediaOverlayRef}
        className={`screen-media-overlay ${
          filmReady ? "is-ready" : "is-loading"
        }`}
        aria-hidden={!screenMediaActive}
      >
        {screenMediaActive && (
          <>
            <div
              className="film-loading-state"
              role="status"
              aria-live="polite"
              aria-hidden={filmReady}
            >
              <span className="film-loading-sweep" aria-hidden="true" />
              <span className="film-loading-copy">影片准备中</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
