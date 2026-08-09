"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { Auditorium } from "./cinema-data";

export type FitMode =
  | "fit_screen"
  | "original"
  | "16_9"
  | "4_3"
  | "9_16"
  | "16_10"
  | "contain"
  | "fill";

interface CinemaSceneProps {
  auditorium: Auditorium;
  selectedSeatId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fitMode: FitMode;
  lightsOn: boolean;
  isPlaying: boolean;
}

// Custom Screen Shader for Aspect Ratio Fitting
const screenVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const screenFragmentShader = `
  uniform sampler2D uMap;
  uniform vec2 uScale;
  uniform vec2 uOffset;
  varying vec2 vUv;

  void main() {
    vec2 st = (vUv - 0.5) * uScale + 0.5 + uOffset;
    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) {
      gl_FragColor = vec4(0.02, 0.02, 0.02, 1.0); // Black letterbox bar
    } else {
      vec4 texColor = texture2D(uMap, st);
      gl_FragColor = texColor;
    }
  }
`;

function ScreenMesh({
  auditorium,
  videoRef,
  fitMode,
}: {
  auditorium: Auditorium;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fitMode: FitMode;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);

  const screenWidth = auditorium.screenWidth;
  const screenHeight = auditorium.screenHeight;
  const screenAspect = screenWidth / screenHeight;

  // Create VideoTexture when video element is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const videoTex = new THREE.VideoTexture(video);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    videoTex.minFilter = THREE.LinearFilter;
    videoTex.magFilter = THREE.LinearFilter;
    videoTex.generateMipmaps = false;
    setTexture(videoTex);

    return () => {
      videoTex.dispose();
    };
  }, [videoRef]);

  // Update uniforms when texture or video metadata or fitMode changes
  useFrame(() => {
    if (!materialRef.current) return;

    const video = videoRef.current;
    let videoAspect = 16 / 9;

    if (video && video.videoWidth && video.videoHeight) {
      videoAspect = video.videoWidth / video.videoHeight;
    }

    let targetAspect = videoAspect;

    if (fitMode === "fit_screen" || fitMode === "fill") {
      materialRef.current.uniforms.uScale.value.set(1.0, 1.0);
      materialRef.current.uniforms.uOffset.value.set(0.0, 0.0);
      materialRef.current.uniformsNeedUpdate = true;
      return;
    } else if (fitMode === "original") {
      targetAspect = videoAspect;
    } else if (fitMode === "16_9") {
      targetAspect = 16 / 9;
    } else if (fitMode === "4_3") {
      targetAspect = 4 / 3;
    } else if (fitMode === "9_16") {
      targetAspect = 9 / 16;
    } else if (fitMode === "16_10") {
      targetAspect = 16 / 10;
    } else if (fitMode === "contain") {
      targetAspect = videoAspect;
    }

    let scaleX = 1.0;
    let scaleY = 1.0;

    if (targetAspect > screenAspect) {
      // Video is wider than screen: fit width, letterbox top/bottom
      scaleY = targetAspect / screenAspect;
    } else {
      // Video is taller than screen: fit height, pillarbox left/right
      scaleX = screenAspect / targetAspect;
    }

    materialRef.current.uniforms.uScale.value.set(scaleX, scaleY);
    materialRef.current.uniforms.uOffset.value.set(0.0, 0.0);
    materialRef.current.uniformsNeedUpdate = true;

    if (texture) {
      texture.needsUpdate = true;
    }
  });

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uScale: { value: new THREE.Vector2(1.0, 1.0) },
      uOffset: { value: new THREE.Vector2(0.0, 0.0) },
    }),
    [texture],
  );

  return (
    <group position={[0, screenHeight / 2 + 0.8, -5.5]}>
      {/* Curved / Flat Screen Mesh */}
      <mesh ref={meshRef}>
        <planeGeometry args={[screenWidth, screenHeight, 32, 16]} />
        {texture ? (
          <shaderMaterial
            ref={materialRef}
            vertexShader={screenVertexShader}
            fragmentShader={screenFragmentShader}
            uniforms={uniforms}
            side={THREE.DoubleSide}
          />
        ) : (
          <meshBasicMaterial color="#1a1816" />
        )}
      </mesh>

      {/* Screen Frame Bezel */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[screenWidth + 0.3, screenHeight + 0.3, 0.1]} />
        <meshStandardMaterial color="#0d0b09" roughness={0.9} />
      </mesh>

      {/* Behind Screen Soft Backlight Glow */}
      <pointLight
        position={[0, 0, -0.2]}
        color="#ffe3bc"
        intensity={1.2}
        distance={8}
      />
    </group>
  );
}

// 3D Model Component for Japandi Warm Wood Private Cinema (日系原木私影)
function JapandiWoodAuditorium({ lightsOn }: { lightsOn: boolean }) {
  // Wood & Fabric Materials
  const woodBeamMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#78583c",
        roughness: 0.6,
        metalness: 0.1,
      }),
    [],
  );
  const wallPanelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#cbbba9",
        roughness: 0.85,
      }),
    [],
  );
  const floorWoodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#8a6645",
        roughness: 0.5,
      }),
    [],
  );
  const chairWoodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#422e1e",
        roughness: 0.4,
      }),
    [],
  );
  const chairGreenLeatherMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2c4535",
        roughness: 0.3,
        metalness: 0.1,
      }),
    [],
  );
  const throwBlanketMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d8cfc4",
        roughness: 0.95,
      }),
    [],
  );
  const brassMetalMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d4af37",
        roughness: 0.3,
        metalness: 0.8,
      }),
    [],
  );
  const marbleTopMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e8e4de",
        roughness: 0.2,
      }),
    [],
  );

  return (
    <group>
      {/* Main Floor (Oak Planks) */}
      <mesh position={[0, 0, 3]} receiveShadow>
        <boxGeometry args={[14, 0.2, 18]} />
        <primitive object={floorWoodMat} attach="material" />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, 6.2, 3]}>
        <boxGeometry args={[14, 0.2, 18]} />
        <meshStandardMaterial color="#d4c9bc" roughness={0.8} />
      </mesh>

      {/* 3 Heavy Timber Beams Running Diagonally/Longitudinally */}
      {[-3.8, 0, 3.8].map((x, idx) => (
        <group key={`beam-${idx}`} position={[x, 5.8, 3]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.75, 0.7, 18]} />
            <primitive object={woodBeamMat} attach="material" />
          </mesh>
          {/* LED Strip hidden in beam groove */}
          <pointLight
            position={[0, -0.3, 0]}
            color="#ffbe76"
            intensity={lightsOn ? 1.5 : 0.4}
            distance={7}
          />
        </group>
      ))}

      {/* Left Wall (Screen Wall on left / side) */}
      <mesh position={[-6.9, 3.1, 3]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[18, 6.2, 0.2]} />
        <primitive object={wallPanelMat} attach="material" />
      </mesh>

      {/* Right Wall with Wall Sconces & Wood Pillars */}
      <mesh position={[6.9, 3.1, 3]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[18, 6.2, 0.2]} />
        <primitive object={wallPanelMat} attach="material" />
      </mesh>

      {/* Vertical Wood Pillar Columns on Right Wall */}
      {[-2, 2, 6, 10].map((z, i) => (
        <group key={`pillar-${i}`} position={[6.75, 3.1, z]}>
          <mesh>
            <boxGeometry args={[0.15, 6.2, 0.6]} />
            <primitive object={woodBeamMat} attach="material" />
          </mesh>
          {/* Sconce Spotlight casting hourglass light onto wall */}
          <spotLight
            position={[-0.2, 2.5, 0]}
            target-position={[-0.2, 0, 0]}
            angle={0.7}
            penumbra={0.8}
            intensity={lightsOn ? 3.5 : 0.8}
            color="#ffaa44"
            distance={8}
          />
        </group>
      ))}

      {/* Front Wall (behind screen) */}
      <mesh position={[0, 3.1, -5.9]}>
        <boxGeometry args={[14, 6.2, 0.2]} />
        <primitive object={wallPanelMat} attach="material" />
      </mesh>

      {/* Back Wall with Projection Slot */}
      <mesh position={[0, 3.1, 11.9]}>
        <boxGeometry args={[14, 6.2, 0.2]} />
        <primitive object={wallPanelMat} attach="material" />
      </mesh>
      {/* Projection Glass Window */}
      <mesh position={[3.5, 4.2, 11.75]}>
        <boxGeometry args={[1.2, 0.8, 0.1]} />
        <meshStandardMaterial color="#0a0a0c" roughness={0.1} metalness={0.9} />
      </mesh>

      {/* Tiered Wooden Risers (Riser Platforms on Right Side / Back) */}
      {/* Tier 1 Riser (Row B) */}
      <mesh position={[0, 0.4, 6.2]} receiveShadow>
        <boxGeometry args={[13.8, 0.6, 3.5]} />
        <primitive object={floorWoodMat} attach="material" />
      </mesh>
      {/* Tier 2 Riser (Row C) */}
      <mesh position={[0, 0.9, 9.2]} receiveShadow>
        <boxGeometry args={[13.8, 1.2, 3.5]} />
        <primitive object={floorWoodMat} attach="material" />
      </mesh>

      {/* Tiered Stairs on Right Side with Embedded Step LED Strips */}
      {[
        { pos: [4.8, 0.2, 4.2], size: [2.2, 0.25, 0.8] },
        { pos: [4.8, 0.5, 5.0], size: [2.2, 0.25, 0.8] },
        { pos: [4.8, 0.8, 7.8], size: [2.2, 0.25, 0.8] },
        { pos: [4.8, 1.1, 8.6], size: [2.2, 0.25, 0.8] },
      ].map((st, idx) => (
        <group key={`step-${idx}`} position={st.pos as [number, number, number]}>
          <mesh receiveShadow>
            <boxGeometry args={st.size as [number, number, number]} />
            <primitive object={floorWoodMat} attach="material" />
          </mesh>
          {/* Step Lip Glow LED Strip */}
          <pointLight
            position={[0, -0.05, 0.4]}
            color="#ffa533"
            intensity={lightsOn ? 1.8 : 0.9}
            distance={2.5}
          />
        </group>
      ))}

      {/* Japandi Armchairs (Italian Green Leather Seats) */}
      {/* Row A (Ground level z=3.8) */}
      {[-2.2, 0, 2.2].map((x, i) => (
        <JapandiArmchair
          key={`rowA-${i}`}
          position={[x, 0.1, 3.8]}
          hasThrow={i === 1}
          chairWoodMat={chairWoodMat}
          chairGreenLeatherMat={chairGreenLeatherMat}
          throwBlanketMat={throwBlanketMat}
        />
      ))}

      {/* Row B (Riser Tier 1 z=6.2, y=0.7) */}
      {[-2.5, 0.3, 2.5].map((x, i) => (
        <JapandiArmchair
          key={`rowB-${i}`}
          position={[x, 0.7, 6.2]}
          hasThrow={i === 0}
          chairWoodMat={chairWoodMat}
          chairGreenLeatherMat={chairGreenLeatherMat}
          throwBlanketMat={throwBlanketMat}
        />
      ))}

      {/* Row C (Riser Tier 2 z=8.8, y=1.3) */}
      {[-2.5, 0.3, 2.5].map((x, i) => (
        <JapandiArmchair
          key={`rowC-${i}`}
          position={[x, 1.3, 8.8]}
          hasThrow={i === 2}
          chairWoodMat={chairWoodMat}
          chairGreenLeatherMat={chairGreenLeatherMat}
          throwBlanketMat={throwBlanketMat}
        />
      ))}

      {/* Right Corner Side Console / Cabinet */}
      <group position={[5.2, 0.5, 1.5]}>
        {/* Cabinet Wooden Body */}
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.8, 1.0]} />
          <primitive object={woodBeamMat} attach="material" />
        </mesh>
        {/* Marble Countertop */}
        <mesh position={[0, 0.82, 0]} castShadow>
          <boxGeometry args={[1.65, 0.05, 1.05]} />
          <primitive object={marbleTopMat} attach="material" />
        </mesh>
        {/* Brass Cabinet Legs */}
        {[-0.7, 0.7].map((lx) =>
          [-0.4, 0.4].map((lz) => (
            <mesh key={`leg-${lx}-${lz}`} position={[lx, 0, lz]}>
              <cylinderGeometry args={[0.03, 0.02, 0.2]} />
              <primitive object={brassMetalMat} attach="material" />
            </mesh>
          )),
        )}
        {/* Popcorn / Glassware Jars on Cabinet */}
        <mesh position={[-0.3, 1.0, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.3, 16]} />
          <meshStandardMaterial color="#f8eedb" roughness={0.1} transmission={0.6} />
        </mesh>
        <mesh position={[0.3, 0.95, 0.1]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.22, 16]} />
          <meshStandardMaterial color="#ebdcb9" roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

// Single Japandi Mid-Century Green Leather Armchair
function JapandiArmchair({
  position,
  hasThrow = false,
  chairWoodMat,
  chairGreenLeatherMat,
  throwBlanketMat,
}: {
  position: [number, number, number];
  hasThrow?: boolean;
  chairWoodMat: THREE.Material;
  chairGreenLeatherMat: THREE.Material;
  throwBlanketMat: THREE.Material;
}) {
  return (
    <group position={position}>
      {/* Seat Cushion */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.75, 0.18, 0.75]} />
        <primitive object={chairGreenLeatherMat} attach="material" />
      </mesh>

      {/* Backrest (Reclined slightly) */}
      <mesh
        position={[0, 0.75, -0.32]}
        rotation={[-0.2, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.75, 0.65, 0.15]} />
        <primitive object={chairGreenLeatherMat} attach="material" />
      </mesh>

      {/* Wooden Frame - Armrests Left & Right */}
      {[-0.42, 0.42].map((x, idx) => (
        <group key={`arm-${idx}`} position={[x, 0, 0]}>
          {/* Top Armrest Bar */}
          <mesh position={[0, 0.52, 0]} castShadow>
            <boxGeometry args={[0.08, 0.06, 0.85]} />
            <primitive object={chairWoodMat} attach="material" />
          </mesh>
          {/* Legs */}
          <mesh position={[0, 0.25, -0.35]} castShadow>
            <boxGeometry args={[0.06, 0.5, 0.06]} />
            <primitive object={chairWoodMat} attach="material" />
          </mesh>
          <mesh position={[0, 0.25, 0.35]} castShadow>
            <boxGeometry args={[0.06, 0.5, 0.06]} />
            <primitive object={chairWoodMat} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Folded Wool Throw Blanket Draped over Back / Arm */}
      {hasThrow && (
        <mesh
          position={[-0.2, 0.65, -0.22]}
          rotation={[0.1, -0.2, 0.3]}
          castShadow
        >
          <boxGeometry args={[0.35, 0.5, 0.22]} />
          <primitive object={throwBlanketMat} attach="material" />
        </mesh>
      )}
    </group>
  );
}

// Default Standard Auditorium Model (for Dolby / IMAX / Giant screen)
function StandardAuditorium({
  auditorium,
  lightsOn,
}: {
  auditorium: Auditorium;
  lightsOn: boolean;
}) {
  const isDolby = auditorium.category === "dolby";

  return (
    <group>
      {/* Floor */}
      <mesh position={[0, -0.1, 8]} receiveShadow>
        <boxGeometry args={[30, 0.2, 30]} />
        <meshStandardMaterial color={isDolby ? "#08090c" : "#12141a"} roughness={0.9} />
      </mesh>

      {/* Walls */}
      <mesh position={[-14, 6, 8]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[30, 12, 0.2]} />
        <meshStandardMaterial color={isDolby ? "#0a0b0f" : "#171a24"} roughness={0.95} />
      </mesh>
      <mesh position={[14, 6, 8]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[30, 12, 0.2]} />
        <meshStandardMaterial color={isDolby ? "#0a0b0f" : "#171a24"} roughness={0.95} />
      </mesh>

      {/* Riser Stepped Seating Rows */}
      {[0, 1, 2, 3, 4, 5].map((rowIdx) => (
        <mesh key={`row-step-${rowIdx}`} position={[0, rowIdx * 0.5, 6 + rowIdx * 2.5]}>
          <boxGeometry args={[26, 0.5, 2.2]} />
          <meshStandardMaterial color="#1a1c24" roughness={0.8} />
        </mesh>
      ))}

      {/* Subtle Step Accent Lights */}
      {[-10, 0, 10].map((x, i) => (
        <pointLight
          key={`light-${i}`}
          position={[x, 1.5, 10]}
          color={isDolby ? "#00c3ff" : "#3b82f6"}
          intensity={lightsOn ? 1.2 : 0.3}
          distance={10}
        />
      ))}
    </group>
  );
}

// Scene Camera Controller
function CameraController({
  auditorium,
  selectedSeatId,
}: {
  auditorium: Auditorium;
  selectedSeatId: string;
}) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const controlsRef = useRef<any>(null);

  const seat = useMemo(() => {
    return (
      auditorium.seats.find((s) => s.id === selectedSeatId) ?? auditorium.seats[0]
    );
  }, [auditorium, selectedSeatId]);

  useEffect(() => {
    if (!seat || !cameraRef.current) return;
    const [px, py, pz] = seat.pos;
    const [lx, ly, lz] = seat.lookAt;

    cameraRef.current.position.set(px, py, pz);
    cameraRef.current.fov = seat.fov;
    cameraRef.current.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(lx, ly, lz);
      controlsRef.current.update();
    }
  }, [seat]);

  return (
    <>
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={seat ? seat.pos : [0, 1.8, 6]}
        fov={seat ? seat.fov : 60}
        near={0.1}
        far={100}
      />
      <OrbitControls
        ref={controlsRef}
        enableZoom={true}
        enablePan={true}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={1}
        maxDistance={25}
        rotateSpeed={0.6}
      />
    </>
  );
}

export default function CinemaScene({
  auditorium,
  selectedSeatId,
  videoRef,
  fitMode,
  lightsOn,
}: CinemaSceneProps) {
  return (
    <div className="w-full h-full relative bg-black">
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <CameraController auditorium={auditorium} selectedSeatId={selectedSeatId} />

        {/* Lighting */}
        <ambientLight intensity={lightsOn ? 0.8 : 0.15} color="#fff6e8" />
        <directionalLight
          position={[0, 10, 5]}
          intensity={lightsOn ? 1.0 : 0.2}
          color="#ffeedd"
          castShadow
        />

        {/* Auditorium 3D Environment */}
        {auditorium.woodTheme ? (
          <JapandiWoodAuditorium lightsOn={lightsOn} />
        ) : (
          <StandardAuditorium auditorium={auditorium} lightsOn={lightsOn} />
        )}

        {/* Screen Mesh */}
        <ScreenMesh auditorium={auditorium} videoRef={videoRef} fitMode={fitMode} />
      </Canvas>
    </div>
  );
}
