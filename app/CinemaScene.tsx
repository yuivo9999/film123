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

type FitMode = "contain" | "fill" | "height" | "vertical" | "aspect_fit" | "cover" | "align_height";

type CinemaSceneProps = {
  auditorium: Auditorium;
  seats: Seat[];
  selectedSeat: Seat;
  filmMode: boolean;
  sceneStyle?:
    | "classic"
    | "urban_plaza"
    | "snowy_greek"
    | "drive_in"
    | "cyberpunk"
    | "forest_camp"
    | "space_station";
  playing: boolean;
  playbackToken: number;
  viewCommand: ViewCommand;
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
}: Pick<
  CinemaSceneProps,
  "auditorium" | "selectedSeat" | "viewCommand"
>) {
  const { camera, gl, size } = useThree();
  const desiredPosition = useRef(new Vector3());
  const desiredEuler = useRef(new Euler(0, 0, 0, "YXZ"));
  const desiredQuaternion = useRef(new Quaternion());
  const lastPointer = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);

  useEffect(() => {
    const position = new Vector3(
      selectedSeat.x,
      getSeatEyeY(selectedSeat),
      selectedSeat.z,
    );
    const target = new Vector3(
      0,
      auditorium.screenBottom + auditorium.screenHeight / 2,
      auditorium.screenZ,
    );
    const quaternion = quaternionLookingAt(position, target);

    desiredPosition.current.copy(position);
    desiredQuaternion.current.copy(quaternion);
    desiredEuler.current.setFromQuaternion(quaternion, "YXZ");

    if (camera instanceof PerspectiveCamera) {
      camera.fov = verticalFovForAspect(size.width / size.height);
      camera.updateProjectionMatrix();
    }
  }, [auditorium, camera, selectedSeat, size.height, size.width]);

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
    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
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

  const [uniforms] = useState(() => ({
    uMap: { value: texture },
    uScale: { value: [1.0, 1.0] as [number, number] },
    uOffset: { value: [0.0, 0.0] as [number, number] },
  }));

  const meshScale = useMemo<[number, number, number]>(() => {
    if (fitMode === "vertical") {
      return [0.42, 1.18, 1.0];
    }
    return [1, 1, 1];
  }, [fitMode]);

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
    } else if (fitMode === "4_9") {
      targetAspect = 4 / 9;
    } else if (fitMode === "9_16" || fitMode === "vertical") {
      targetAspect = 9 / 16;
    } else if (fitMode === "16_10") {
      targetAspect = 16 / 10;
    } else if (fitMode === "fill") {
      uniforms.uScale.value = [1.0, 1.0];
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

    uniforms.uScale.value = [scaleX, scaleY];
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

  return (
    <group>
      <mesh position={[0, centerY, auditorium.screenZ - 0.1]}>
        <boxGeometry
          args={[auditorium.screenWidth + 0.8, auditorium.screenHeight + 0.8, 0.3]}
        />
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

function DriveInBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;
  const starPositions = useMemo(() => {
    const pos = new Float32Array(250 * 3);
    for (let i = 0; i < 250; i++) {
      pos[i * 3] = (pseudoRandom(i * 3) - 0.5) * 280;
      pos[i * 3 + 1] = pseudoRandom(i * 3 + 1) * 90 + 10;
      pos[i * 3 + 2] = baseZ - 60 + (pseudoRandom(i * 3 + 2) - 0.5) * 30;
    }
    return pos;
  }, [baseZ]);

  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[starPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial size={1.2} color="#f8fafc" transparent opacity={0.85} sizeAttenuation toneMapped={false} />
      </points>

      <mesh position={[-60, 68, baseZ - 58]}>
        <sphereGeometry args={[6.5, 32, 32]} />
        <meshBasicMaterial color="#fef9c3" toneMapped={false} />
      </mesh>

      {[
        { x: -32, z: baseZ + 18, color: "#991b1b" },
        { x: -14, z: baseZ + 24, color: "#1e3a8a" },
        { x: 14, z: baseZ + 24, color: "#065f46" },
        { x: 32, z: baseZ + 18, color: "#854d0e" },
        { x: -48, z: baseZ + 32, color: "#374151" },
        { x: 48, z: baseZ + 32, color: "#581c87" },
      ].map((car, idx) => (
        <group key={idx} position={[car.x, 0.8, car.z]}>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[3.2, 1.1, 5.2]} />
            <meshStandardMaterial color={car.color} roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 1.1, -0.2]}>
            <boxGeometry args={[2.8, 0.8, 2.6]} />
            <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.8} />
          </mesh>
          {[-1.2, 1.2].map((hx, hIdx) => (
            <group key={hIdx} position={[hx, 0.4, -2.55]}>
              <mesh>
                <sphereGeometry args={[0.22, 16, 16]} />
                <meshBasicMaterial color="#fef08a" toneMapped={false} />
              </mesh>
            </group>
          ))}
          {[-1.5, 1.5].map((wx) =>
            [-1.6, 1.6].map((wz, wIdx) => (
              <mesh key={`${wx}-${wz}-${wIdx}`} position={[wx, -0.3, wz]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.45, 0.45, 0.3, 16]} />
                <meshStandardMaterial color="#111827" roughness={0.8} />
              </mesh>
            ))
          )}
        </group>
      ))}

      {[-auditorium.screenWidth / 2 - 1, auditorium.screenWidth / 2 + 1].map((x, sideIdx) => (
        <mesh key={sideIdx} position={[x, auditorium.screenBottom + auditorium.screenHeight / 2, baseZ + 0.1]}>
          <boxGeometry args={[0.6, auditorium.screenHeight + 3.5, 0.6]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function CyberpunkBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;

  return (
    <group>
      {[
        { x: -58, h: 90, w: 24, signColor: "#00f0ff" },
        { x: -35, h: 75, w: 20, signColor: "#ff007f" },
        { x: 35, h: 80, w: 22, signColor: "#ff007f" },
        { x: 60, h: 95, w: 26, signColor: "#00f0ff" },
      ].map((b, idx) => (
        <group key={idx} position={[b.x, b.h / 2 - 2, baseZ - 52]}>
          <mesh>
            <boxGeometry args={[b.w, b.h, 22]} />
            <meshStandardMaterial color="#0c0714" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0, 10, 11.2]}>
            <planeGeometry args={[b.w * 0.7, 18]} />
            <meshBasicMaterial color={b.signColor} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {[-auditorium.screenWidth / 2 - 0.4, auditorium.screenWidth / 2 + 0.4].map((x, sideIdx) => (
        <group key={sideIdx} position={[x, auditorium.screenBottom + auditorium.screenHeight / 2, baseZ + 0.1]}>
          <mesh>
            <boxGeometry args={[0.25, auditorium.screenHeight + 1.2, 0.25]} />
            <meshBasicMaterial color={sideIdx === 0 ? "#00f0ff" : "#ff007f"} toneMapped={false} />
          </mesh>
          <pointLight
            color={sideIdx === 0 ? "#00f0ff" : "#ff007f"}
            intensity={180}
            distance={22}
          />
        </group>
      ))}
      <mesh position={[0, auditorium.screenBottom + auditorium.screenHeight + 0.5, baseZ + 0.1]}>
        <boxGeometry args={[auditorium.screenWidth + 1.2, 0.25, 0.25]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>
    </group>
  );
}

function ForestCampBackdrop({ auditorium }: { auditorium: Auditorium }) {
  const baseZ = auditorium.screenZ;

  const sideFireflies = useMemo(() => {
    const list: [number, number, number][] = [];
    for (let i = 0; i < 20; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = (24 + pseudoRandom(i * 3) * 20) * side;
      const y = 1.5 + pseudoRandom(i * 3 + 1) * 6;
      const z = baseZ - 20 + pseudoRandom(i * 3 + 2) * 35;
      list.push([x, y, z]);
    }
    return list;
  }, [baseZ]);

  return (
    <group>
      {/* Pine Trees Surroundings */}
      {[
        { x: -38, z: baseZ - 20, s: 1.2 },
        { x: -28, z: baseZ - 30, s: 1.5 },
        { x: -45, z: baseZ + 10, s: 1.4 },
        { x: 38, z: baseZ - 20, s: 1.3 },
        { x: 28, z: baseZ - 30, s: 1.6 },
        { x: 45, z: baseZ + 10, s: 1.4 },
        { x: -55, z: baseZ + 25, s: 1.7 },
        { x: 55, z: baseZ + 25, s: 1.7 },
      ].map((tree, idx) => (
        <group key={idx} position={[tree.x, 0, tree.z]} scale={[tree.s, tree.s, tree.s]}>
          <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.5, 0.8, 6, 8]} />
            <meshStandardMaterial color="#3d2616" roughness={0.9} />
          </mesh>
          <mesh position={[0, 7, 0]}>
            <coneGeometry args={[4.5, 7, 8]} />
            <meshStandardMaterial color="#047857" roughness={0.7} />
          </mesh>
          <mesh position={[0, 11, 0]}>
            <coneGeometry args={[3.5, 6, 8]} />
            <meshStandardMaterial color="#059669" roughness={0.7} />
          </mesh>
          <mesh position={[0, 14.5, 0]}>
            <coneGeometry args={[2.4, 5, 8]} />
            <meshStandardMaterial color="#10b981" roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Central Campfire */}
      <group position={[0, 0.1, baseZ + 12]}>
        <mesh>
          <torusGeometry args={[1.2, 0.3, 8, 16]} />
          <meshStandardMaterial color="#475569" roughness={0.85} />
        </mesh>
        <mesh rotation={[0.4, 0.8, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 2.2, 8]} />
          <meshStandardMaterial color="#292524" roughness={0.9} />
        </mesh>
        <pointLight color="#f97316" intensity={220} distance={28} decay={1.8} />
      </group>

      {/* Side Gentle Firefly Orbs (Out of direct screen view) */}
      {sideFireflies.map(([fx, fy, fz], fIdx) => (
        <mesh key={fIdx} position={[fx, fy, fz]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#a3e635" toneMapped={false} />
        </mesh>
      ))}

      {/* Screen Timber Supporting Posts */}
      {[-auditorium.screenWidth / 2 - 0.8, auditorium.screenWidth / 2 + 0.8].map((x, sideIdx) => (
        <mesh key={sideIdx} position={[x, auditorium.screenBottom + auditorium.screenHeight / 2, baseZ + 0.1]}>
          <cylinderGeometry args={[0.4, 0.45, auditorium.screenHeight + 2.5, 12]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
      ))}

      {/* Sunlight for Forest Day / Lights On mode */}
      <directionalLight
        position={[25, 50, baseZ - 10]}
        intensity={1.8}
        color="#fef08a"
      />
    </group>
  );
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
      } else if (sceneStyle === "cyberpunk") {
        // Sunset Magenta & Neon Purple Horizon
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#1e1b4b");
        grad.addColorStop(0.35, "#581c87");
        grad.addColorStop(0.7, "#be185d");
        grad.addColorStop(1, "#0284c7");
        ctx.fillStyle = grad;
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
      } else {
        // General Day Sky (drive_in, forest_camp, urban_plaza)
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
      if (sceneStyle === "cyberpunk") {
        grad.addColorStop(0, "#030206");
        grad.addColorStop(0.65, "#0f0a1c");
        grad.addColorStop(1, "#2e1065");
      } else if (sceneStyle === "space_station") {
        grad.addColorStop(0, "#010206");
        grad.addColorStop(0.6, "#030712");
        grad.addColorStop(1, "#0369a1");
      } else {
        grad.addColorStop(0, "#020617");
        grad.addColorStop(0.6, "#0b132b");
        grad.addColorStop(1, "#1e293b");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Cosmic Nebula / Milky Way Glow overhead
      const neb = ctx.createRadialGradient(w * 0.5, h * 0.2, 10, w * 0.5, h * 0.2, 350);
      neb.addColorStop(0, sceneStyle === "cyberpunk" ? "rgba(236, 72, 153, 0.35)" : "rgba(56, 189, 248, 0.28)");
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
    if (sceneStyle === "snowy_greek") return "#f1f5f9";
    if (sceneStyle === "cyberpunk") return "#0f172a";
    if (sceneStyle === "forest_camp") return "#3d2616";
    if (sceneStyle === "drive_in") return "#334155";
    if (sceneStyle === "space_station") return "#1e293b";
    if (sceneStyle === "urban_plaza") return "#475569";
    return "#202329";
  }, [sceneStyle]);

  const platformRoughness = useMemo(() => {
    if (sceneStyle === "snowy_greek") return 0.4;
    if (sceneStyle === "cyberpunk") return 0.2;
    if (sceneStyle === "space_station") return 0.3;
    return 0.9;
  }, [sceneStyle]);

  const groundColor = useMemo(() => {
    if (sceneStyle === "snowy_greek") return "#cbd5e1";
    if (sceneStyle === "cyberpunk") return "#08070e";
    if (sceneStyle === "forest_camp") return "#14532d";
    if (sceneStyle === "drive_in") return "#1e293b";
    if (sceneStyle === "space_station") return "#0f172a";
    if (sceneStyle === "urban_plaza") return "#1e293b";
    return "#191b1f";
  }, [sceneStyle]);

  return (
    <group>
      <SkySphere sceneStyle={sceneStyle} filmMode={filmMode} auditorium={auditorium} />

      {/* Render theme backdrop */}
      {sceneStyle === "urban_plaza" && <UrbanPlazaBackdrop auditorium={auditorium} />}
      {sceneStyle === "snowy_greek" && <SnowMountainBackdrop auditorium={auditorium} />}
      {sceneStyle === "drive_in" && <DriveInBackdrop auditorium={auditorium} />}
      {sceneStyle === "cyberpunk" && <CyberpunkBackdrop auditorium={auditorium} />}
      {sceneStyle === "forest_camp" && <ForestCampBackdrop auditorium={auditorium} />}
      {sceneStyle === "space_station" && <SpaceStationBackdrop auditorium={auditorium} />}

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

            {/* Glowing Edge Strips for Cyberpunk & Space Station */}
            {sceneStyle === "cyberpunk" && (
              <mesh position={[0, y - 0.01, z - auditorium.rowSpacing / 2 + 0.05]}>
                <boxGeometry args={[platformWidth, 0.04, 0.08]} />
                <meshBasicMaterial color="#00f0ff" toneMapped={false} />
              </mesh>
            )}
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
    if (sceneStyle === "cyberpunk") {
      return {
        available: {
          upholstery: new Color("#0f172a"),
          shell: new Color("#0284c7"),
          panel: new Color("#00f0ff"),
        },
        selected: {
          upholstery: new Color("#ff007f"),
          shell: new Color("#d946ef"),
          panel: new Color("#f43f5e"),
        },
        occupied: {
          upholstery: new Color("#1e1b4b"),
          shell: new Color("#312e81"),
          panel: new Color("#1e293b"),
        },
      };
    }
    if (sceneStyle === "forest_camp") {
      return {
        available: {
          upholstery: new Color("#78350f"),
          shell: new Color("#451a03"),
          panel: new Color("#92400e"),
        },
        selected: {
          upholstery: new Color("#15803d"),
          shell: new Color("#166534"),
          panel: new Color("#22c55e"),
        },
        occupied: {
          upholstery: new Color("#27272a"),
          shell: new Color("#18181b"),
          panel: new Color("#3f3f46"),
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
    if (sceneStyle === "snowy_greek") return new Color("#0a1128");
    if (sceneStyle === "drive_in") return new Color("#040714");
    if (sceneStyle === "cyberpunk") return new Color("#07030e");
    if (sceneStyle === "forest_camp") return new Color("#030805");
    if (sceneStyle === "space_station") return new Color("#02040a");
    return new Color("#111317");
  }, [sceneStyle]);

  const darkBackground = useMemo(() => {
    if (sceneStyle === "snowy_greek") return new Color("#060b1b");
    if (sceneStyle === "drive_in") return new Color("#02040a");
    if (sceneStyle === "cyberpunk") return new Color("#030107");
    if (sceneStyle === "forest_camp") return new Color("#010402");
    if (sceneStyle === "space_station") return new Color("#010205");
    return new Color("#07080a");
  }, [sceneStyle]);

  const litFog = useMemo(() => {
    if (sceneStyle === "snowy_greek") return new Color("#0c1535");
    if (sceneStyle === "drive_in") return new Color("#060a1e");
    if (sceneStyle === "cyberpunk") return new Color("#0d051c");
    if (sceneStyle === "forest_camp") return new Color("#040f09");
    if (sceneStyle === "space_station") return new Color("#030712");
    return new Color("#15171b");
  }, [sceneStyle]);

  const darkFog = useMemo(() => {
    if (sceneStyle === "snowy_greek") return new Color("#070d22");
    if (sceneStyle === "drive_in") return new Color("#03050f");
    if (sceneStyle === "cyberpunk") return new Color("#05020a");
    if (sceneStyle === "forest_camp") return new Color("#020604");
    if (sceneStyle === "space_station") return new Color("#010308");
    return new Color("#08090b");
  }, [sceneStyle]);

  const litAmbient = useMemo(() => {
    if (sceneStyle === "snowy_greek") return new Color("#e2e8f0");
    if (sceneStyle === "drive_in") return new Color("#cbd5e1");
    if (sceneStyle === "cyberpunk") return new Color("#e0e7ff");
    if (sceneStyle === "forest_camp") return new Color("#a7f3d0");
    if (sceneStyle === "space_station") return new Color("#e0f2fe");
    if (sceneStyle === "urban_plaza") return new Color("#dbeafe");
    return new Color("#fef08a");
  }, [sceneStyle]);

  const darkAmbient = useMemo(() => {
    if (sceneStyle === "snowy_greek") return new Color("#1d4ed8");
    if (sceneStyle === "drive_in") return new Color("#384e68");
    if (sceneStyle === "cyberpunk") return new Color("#7e22ce");
    if (sceneStyle === "forest_camp") return new Color("#047857");
    if (sceneStyle === "space_station") return new Color("#0284c7");
    if (sceneStyle === "urban_plaza") return new Color("#1e3a8a");
    return new Color("#881337");
  }, [sceneStyle]);

  const skyColor = useMemo(() => {
    if (sceneStyle === "snowy_greek") return new Color("#38bdf8");
    if (sceneStyle === "drive_in") return new Color("#818cf8");
    if (sceneStyle === "cyberpunk") return new Color("#f0abfc");
    if (sceneStyle === "forest_camp") return new Color("#34d399");
    if (sceneStyle === "space_station") return new Color("#38bdf8");
    if (sceneStyle === "urban_plaza") return new Color("#60a5fa");
    return new Color("#fb7185");
  }, [sceneStyle]);

  const groundColor = useMemo(() => {
    if (sceneStyle === "snowy_greek") return new Color("#0f172a");
    if (sceneStyle === "drive_in") return new Color("#0f172a");
    if (sceneStyle === "cyberpunk") return new Color("#1e1b4b");
    if (sceneStyle === "forest_camp") return new Color("#064e3b");
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
            : sceneStyle === "forest_camp"
            ? "#a7f3d0"
            : sceneStyle === "cyberpunk"
            ? "#f472b6"
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
