"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export interface SeatInfo {
  id: string;
  row: number; // 1-based from front to back
  col: number; // 1-based left to right
  rowLabel: string;
  colLabel: string;
  position: [number, number, number];
  isVIP: boolean;
  isTaken?: boolean;
}

interface CinemaCanvas3DProps {
  selectedSeatId: string | null;
  onSelectSeat: (seat: SeatInfo) => void;
  viewMode: "orbit" | "pov";
  lightingMode: "warm" | "dark" | "neon";
  aspectRatio: "2.39" | "1.90" | "1.43" | "16:9";
  isPlayingVideo: boolean;
  onSightlineCalculated?: (data: {
    verticalAngle: number;
    horizontalCoverage: number;
    centerOffset: number;
    rating: string;
  }) => void;
}

export default function CinemaCanvas3D({
  selectedSeatId,
  onSelectSeat,
  viewMode,
  lightingMode,
  aspectRatio,
  isPlayingVideo,
  onSightlineCalculated,
}: CinemaCanvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // References for Three.js state
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const seatObjectsRef = useRef<Map<string, THREE.Group>>(new Map());
  const screenMeshRef = useRef<THREE.Mesh | null>(null);
  const lightsGroupRef = useRef<THREE.Group | null>(null);
  const videoTextureRef = useRef<THREE.CanvasTexture | THREE.VideoTexture | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const canvasTextureElementRef = useRef<HTMLCanvasElement | null>(null);

  // Target camera positions for smooth interpolation
  const cameraTargetPos = useRef<THREE.Vector3>(new THREE.Vector3(0, 4, 12));
  const cameraTargetLookAt = useRef<THREE.Vector3>(new THREE.Vector3(0, 2, -6));
  const cameraCurrentLookAt = useRef<THREE.Vector3>(new THREE.Vector3(0, 2, -6));

  // Seats coordinates setup matching the luxury image layout
  // 3 rows:
  // Row 1 (Front, lower floor): 3 chairs
  // Row 2 (Middle, mid step): 4 chairs
  // Row 3 (Rear, high step): 5 chairs
  const seatsData: SeatInfo[] = [
    // Row A (Front)
    { id: "A2", row: 1, col: 2, rowLabel: "A", colLabel: "02", position: [-1.4, 0.45, 0], isVIP: false },
    { id: "A3", row: 1, col: 3, rowLabel: "A", colLabel: "03", position: [0.0, 0.45, 0], isVIP: true },
    { id: "A4", row: 1, col: 4, rowLabel: "A", colLabel: "04", position: [1.4, 0.45, 0], isVIP: false },

    // Row B (Middle)
    { id: "B1", row: 2, col: 1, rowLabel: "B", colLabel: "01", position: [-2.8, 0.95, 2.8], isVIP: false },
    { id: "B2", row: 2, col: 2, rowLabel: "B", colLabel: "02", position: [-1.2, 0.95, 2.8], isVIP: true },
    { id: "B3", row: 2, col: 3, rowLabel: "B", colLabel: "03", position: [0.0, 0.95, 2.8], isVIP: true },
    { id: "B4", row: 2, col: 4, rowLabel: "B", colLabel: "04", position: [1.2, 0.95, 2.8], isVIP: true },
    { id: "B5", row: 2, col: 5, rowLabel: "B", colLabel: "05", position: [2.8, 0.95, 2.8], isVIP: false },

    // Row C (Rear)
    { id: "C1", row: 3, col: 1, rowLabel: "C", colLabel: "01", position: [-3.5, 1.45, 5.6], isVIP: false },
    { id: "C2", row: 3, col: 2, rowLabel: "C", colLabel: "02", position: [-1.8, 1.45, 5.6], isVIP: false },
    { id: "C3", row: 3, col: 3, rowLabel: "C", colLabel: "03", position: [0.0, 1.45, 5.6], isVIP: true },
    { id: "C4", row: 3, col: 4, rowLabel: "C", colLabel: "04", position: [1.8, 1.45, 5.6], isVIP: false },
    { id: "C5", row: 3, col: 5, rowLabel: "C", colLabel: "05", position: [3.5, 1.45, 5.6], isVIP: false },
  ];

  // Helper: Create procedural wood texture
  const createWoodTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Warm wood base
    ctx.fillStyle = "#a86c3a";
    ctx.fillRect(0, 0, 512, 512);

    // Wood planks and grain
    for (let i = 0; i < 512; i += 32) {
      ctx.fillStyle = "rgba(60, 30, 10, 0.15)";
      ctx.fillRect(i, 0, 2, 512); // Plank lines
    }

    ctx.fillStyle = "rgba(80, 40, 15, 0.08)";
    for (let y = 0; y < 512; y += 4) {
      const offset = Math.sin(y * 0.05) * 10;
      ctx.fillRect(0, y, 512, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  };

  // Helper: Create procedural leather texture
  const createLeatherTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = "#2a4a34"; // Olive/Forest green leather
    ctx.fillRect(0, 0, 256, 256);

    // Noise/grain
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const val = Math.random() * 40 - 20;
      ctx.fillStyle = `rgba(${40 + val}, ${70 + val}, ${50 + val}, 0.25)`;
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  };

  // Helper: Dynamic Screen Canvas Animation (when video is not loaded or for custom movie scene)
  const setupScreenCanvas = (): { texture: THREE.CanvasTexture; drawFrame: (time: number) => void } => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 576;
    canvasTextureElementRef.current = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { texture, drawFrame: () => {} };
    }

    const drawFrame = (time: number) => {
      ctx.fillStyle = "#050814";
      ctx.fillRect(0, 0, 1024, 576);

      // Cinema Movie Scene Simulation (sunset / Sci-Fi space visual)
      const grad = ctx.createLinearGradient(0, 0, 1024, 576);
      grad.addColorStop(0, "#0e1a38");
      grad.addColorStop(0.4, "#8a3b14");
      grad.addColorStop(0.7, "#d97736");
      grad.addColorStop(1, "#fcd34d");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 576);

      // Sun / Core Light
      const sunX = 512 + Math.sin(time * 0.001) * 80;
      const sunY = 280 + Math.cos(time * 0.0015) * 30;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 220);
      sunGrad.addColorStop(0, "rgba(255, 255, 240, 0.95)");
      sunGrad.addColorStop(0.3, "rgba(251, 191, 36, 0.6)");
      sunGrad.addColorStop(1, "rgba(180, 83, 9, 0)");
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 220, 0, Math.PI * 2);
      ctx.fill();

      // Cinematic Text & Title
      ctx.font = "bold 38px 'Playfair Display', serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.textAlign = "center";
      ctx.fillText("CINEMA 3D VISION", 512, 200);

      ctx.font = "500 20px sans-serif";
      ctx.fillStyle = "rgba(255, 248, 235, 0.8)";
      ctx.fillText("4K HDR IMAX 激光影厅视线测试", 512, 245);

      // Dynamic waveform
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x < 1024; x += 10) {
        const y = 420 + Math.sin(x * 0.02 + time * 0.003) * 25;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (videoTextureRef.current) {
        videoTextureRef.current.needsUpdate = true;
      }
    };

    return { texture, drawFrame };
  };

  // Build the entire 3D Cinema Room
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c0a08");
    scene.fog = new THREE.FogExp2("#0c0a08", 0.035);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
    camera.position.set(0, 4.2, 11.5);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;

    // Textures
    const woodTexture = createWoodTexture();
    const leatherTexture = createLeatherTexture();
    const { texture: screenTexture, drawFrame } = setupScreenCanvas();
    videoTextureRef.current = screenTexture;

    // Materials
    const woodFloorMat = new THREE.MeshStandardMaterial({
      map: woodTexture,
      roughness: 0.35,
      metalness: 0.1,
    });

    const woodBeamMat = new THREE.MeshStandardMaterial({
      color: 0x6e4222,
      roughness: 0.6,
      metalness: 0.05,
    });

    const fabricWallMat = new THREE.MeshStandardMaterial({
      color: 0x221c17,
      roughness: 0.85,
    });

    const leatherMat = new THREE.MeshStandardMaterial({
      map: leatherTexture,
      color: 0x3d5e48, // Green leather chair color matching image
      roughness: 0.4,
      metalness: 0.1,
    });

    const chairWoodMat = new THREE.MeshStandardMaterial({
      color: 0x4a2a16,
      roughness: 0.4,
    });

    const blanketMat = new THREE.MeshStandardMaterial({
      color: 0xd6cbb8, // Beige wool blanket matching image
      roughness: 0.9,
    });

    const stepLedMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
    });

    // --- ROOM GEOMETRY ---
    const roomWidth = 13;
    const roomHeight = 6.5;
    const roomLength = 16;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomLength);
    const floorMesh = new THREE.Mesh(floorGeo, woodFloorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, 2);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(roomWidth, roomLength);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 });
    const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.set(0, roomHeight, 2);
    scene.add(ceilingMesh);

    // Ceiling Beams (3 longitudinal wood beams like in the image)
    const beamGeo = new THREE.BoxGeometry(0.8, 0.7, roomLength);
    [-3.8, 0, 3.8].forEach((x) => {
      const beam = new THREE.Mesh(beamGeo, woodBeamMat);
      beam.position.set(x, roomHeight - 0.35, 2);
      beam.castShadow = true;
      scene.add(beam);
    });

    // Side Walls & Back Wall
    const sideWallGeo = new THREE.PlaneGeometry(roomLength, roomHeight);
    // Left wall
    const leftWall = new THREE.Mesh(sideWallGeo, fabricWallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-roomWidth / 2, roomHeight / 2, 2);
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeo, fabricWallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(roomWidth / 2, roomHeight / 2, 2);
    scene.add(rightWall);

    // Front Wall behind Screen
    const frontWallGeo = new THREE.PlaneGeometry(roomWidth, roomHeight);
    const frontWall = new THREE.Mesh(frontWallGeo, new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.95 }));
    frontWall.position.set(0, roomHeight / 2, -6);
    scene.add(frontWall);

    // Back Wall
    const backWall = new THREE.Mesh(frontWallGeo, fabricWallMat);
    backWall.rotation.y = Math.PI;
    backWall.position.set(0, roomHeight / 2, 10);
    scene.add(backWall);

    // --- TIERED STEPS (WOODEN RISERS) ---
    const step1Geo = new THREE.BoxGeometry(10, 0.4, 4);
    const step1 = new THREE.Mesh(step1Geo, woodFloorMat);
    step1.position.set(0, 0.2, 2.8);
    step1.receiveShadow = true;
    step1.castShadow = true;
    scene.add(step1);

    const step2Geo = new THREE.BoxGeometry(10, 0.8, 4);
    const step2 = new THREE.Mesh(step2Geo, woodFloorMat);
    step2.position.set(0, 0.4, 5.6);
    step2.receiveShadow = true;
    step2.castShadow = true;
    scene.add(step2);

    // LED Step Lights
    const led1 = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.03, 0.05), stepLedMat);
    led1.position.set(0, 0.41, 0.81);
    scene.add(led1);

    const led2 = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.03, 0.05), stepLedMat);
    led2.position.set(0, 0.81, 3.61);
    scene.add(led2);

    // Side stairs LED on right step
    const stairLed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.03, 0.05), stepLedMat);
    stairLed.position.set(3.5, 0.41, 0.81);
    scene.add(stairLed);

    // --- MOVIE SCREEN ---
    const screenWidth = 9.2;
    const screenHeight = 4.2;
    const screenGeo = new THREE.PlaneGeometry(screenWidth, screenHeight);

    const screenMat = new THREE.MeshBasicMaterial({
      map: videoTextureRef.current,
      side: THREE.FrontSide,
    });

    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 3.2, -5.8);
    screenMeshRef.current = screenMesh;
    scene.add(screenMesh);

    // Screen Frame
    const frameGeo = new THREE.BoxGeometry(screenWidth + 0.3, screenHeight + 0.3, 0.1);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.8 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.set(0, 3.2, -5.88);
    scene.add(frameMesh);

    // --- RECLINER CHAIR GENERATOR ---
    const createArmchairGroup = (seatInfo: SeatInfo) => {
      const group = new THREE.Group();
      group.name = `SEAT_${seatInfo.id}`;

      // Cushion base
      const seatBaseGeo = new THREE.BoxGeometry(0.75, 0.22, 0.75);
      const seatBase = new THREE.Mesh(seatBaseGeo, leatherMat);
      seatBase.position.y = 0.35;
      seatBase.castShadow = true;
      group.add(seatBase);

      // Backrest
      const backGeo = new THREE.BoxGeometry(0.75, 0.85, 0.18);
      const back = new THREE.Mesh(backGeo, leatherMat);
      back.position.set(0, 0.85, 0.3);
      back.rotation.x = -0.15; // Slightly reclined
      back.castShadow = true;
      group.add(back);

      // Headrest pillow
      const headrestGeo = new THREE.BoxGeometry(0.6, 0.25, 0.15);
      const headrest = new THREE.Mesh(headrestGeo, leatherMat);
      headrest.position.set(0, 1.3, 0.24);
      headrest.castShadow = true;
      group.add(headrest);

      // Armrests (Wood frame + leather pad)
      [-0.42, 0.42].forEach((x) => {
        const armWood = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.8), chairWoodMat);
        armWood.position.set(x, 0.45, 0.05);
        armWood.castShadow = true;
        group.add(armWood);

        const armPad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.75), leatherMat);
        armPad.position.set(x, 0.68, 0.05);
        armPad.castShadow = true;
        group.add(armPad);
      });

      // Draped woolen blanket on seat back (like in image)
      if (seatInfo.id === "A2" || seatInfo.id === "B3" || seatInfo.id === "C4") {
        const blanketGeo = new THREE.BoxGeometry(0.4, 0.7, 0.05);
        const blanket = new THREE.Mesh(blanketGeo, blanketMat);
        blanket.position.set(0.1, 0.75, 0.33);
        blanket.rotation.x = -0.15;
        blanket.castShadow = true;
        group.add(blanket);
      }

      // Wooden chair legs
      [
        [-0.38, 0.18, -0.3],
        [0.38, 0.18, -0.3],
        [-0.38, 0.18, 0.35],
        [0.38, 0.18, 0.35],
      ].forEach(([x, y, z]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.35), chairWoodMat);
        leg.position.set(x, y, z);
        group.add(leg);
      });

      // Selection Highlight Ring under seat
      const ringGeo = new THREE.RingGeometry(0.55, 0.65, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      ring.name = "SELECT_RING";
      group.add(ring);

      group.position.set(...seatInfo.position);
      return group;
    };

    // Instantiate Seats
    seatObjectsRef.current.clear();
    seatsData.forEach((seat) => {
      const seatGroup = createArmchairGroup(seat);
      scene.add(seatGroup);
      seatObjectsRef.current.set(seat.id, seatGroup);
    });

    // --- SIDE CABINET / BAR (Bottom Right as seen in image) ---
    const cabinetGroup = new THREE.Group();
    const cabGeo = new THREE.BoxGeometry(1.4, 1.1, 2.2);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x543422, roughness: 0.4 });
    const cabinet = new THREE.Mesh(cabGeo, cabMat);
    cabinet.position.set(5.2, 0.55, 6.8);
    cabinet.castShadow = true;
    cabinetGroup.add(cabinet);

    // Marble top
    const topGeo = new THREE.BoxGeometry(1.45, 0.08, 2.25);
    const topMat = new THREE.MeshStandardMaterial({ color: 0xded8ce, roughness: 0.2 });
    const marbleTop = new THREE.Mesh(topGeo, topMat);
    marbleTop.position.set(5.2, 1.14, 6.8);
    cabinetGroup.add(marbleTop);
    scene.add(cabinetGroup);

    // --- LIGHTING SETUP (WARM COVE LIGHTING MATCHING IMAGE) ---
    const lightsGroup = new THREE.Group();
    lightsGroupRef.current = lightsGroup;

    // Ambient Warm Light
    const ambientLight = new THREE.AmbientLight(0xfff1e0, 0.4);
    lightsGroup.add(ambientLight);

    // Screen Bounce Glow Light
    const screenBounce = new THREE.PointLight(0xffaa55, 1.8, 14);
    screenBounce.position.set(0, 3.2, -4);
    lightsGroup.add(screenBounce);

    // Warm Vertical Wall Cove Spotlights (creates the golden wash arches on side wall)
    const createCoveLight = (x: number, y: number, z: number) => {
      const spot = new THREE.SpotLight(0xffb86c, 3.5, 9, Math.PI / 4, 0.8, 1);
      spot.position.set(x, y, z);
      spot.target.position.set(x, 0, z);
      spot.castShadow = true;
      lightsGroup.add(spot);
      lightsGroup.add(spot.target);

      // Light strip mesh visual
      const stripMat = new THREE.MeshBasicMaterial({ color: 0xffcd85 });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.5, 0.08), stripMat);
      strip.position.set(x > 0 ? x - 0.05 : x + 0.05, 3.2, z);
      scene.add(strip);
    };

    // Right wall cove spots
    createCoveLight(6.3, 5.8, -1);
    createCoveLight(6.3, 5.8, 2.5);
    createCoveLight(6.3, 5.8, 6.0);

    // Left wall cove spots
    createCoveLight(-6.3, 5.8, 0);
    createCoveLight(-6.3, 5.8, 4.0);

    scene.add(lightsGroup);

    // --- RAYCASTING & CLICK SELECTION ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleCanvasClick = (event: MouseEvent) => {
      if (!canvasRef.current || !cameraRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const intersect of intersects) {
        let parent: THREE.Object3D | null = intersect.object;
        while (parent && parent !== scene) {
          if (parent.name.startsWith("SEAT_")) {
            const seatId = parent.name.replace("SEAT_", "");
            const foundSeat = seatsData.find((s) => s.id === seatId);
            if (foundSeat) {
              onSelectSeat(foundSeat);
              return;
            }
          }
          parent = parent.parent;
        }
      }
    };

    const canvasElement = canvasRef.current;
    canvasElement.addEventListener("click", handleCanvasClick);

    // --- ANIMATION LOOP ---
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();

      // Dynamic screen content animation
      drawFrame(elapsedTime * 1000);

      // Smooth camera interpolation
      if (cameraRef.current) {
        cameraRef.current.position.lerp(cameraTargetPos.current, 0.06);
        cameraCurrentLookAt.current.lerp(cameraTargetLookAt.current, 0.06);
        cameraRef.current.lookAt(cameraCurrentLookAt.current);
      }

      renderer.render(scene, cameraRef.current!);
    };

    animate();

    // --- RESIZE HANDLER ---
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      canvasElement.removeEventListener("click", handleCanvasClick);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Screen Aspect Ratio
  useEffect(() => {
    if (!screenMeshRef.current) return;
    let width = 9.2;
    let height = 4.2;

    if (aspectRatio === "2.39") {
      height = width / 2.39;
    } else if (aspectRatio === "1.90") {
      height = width / 1.9;
    } else if (aspectRatio === "1.43") {
      height = width / 1.43;
    } else {
      height = width / (16 / 9);
    }

    screenMeshRef.current.scale.set(1, height / 4.2, 1);
  }, [aspectRatio]);

  // Update Lighting Mode
  useEffect(() => {
    if (!lightsGroupRef.current) return;
    const group = lightsGroupRef.current;

    group.children.forEach((child) => {
      if (child instanceof THREE.AmbientLight) {
        if (lightingMode === "dark") child.intensity = 0.08;
        else if (lightingMode === "neon") child.intensity = 0.2;
        else child.intensity = 0.4;
      } else if (child instanceof THREE.PointLight) {
        if (lightingMode === "dark") child.intensity = 2.8;
        else child.intensity = 1.8;
      } else if (child instanceof THREE.SpotLight) {
        if (lightingMode === "dark") child.intensity = 0.4;
        else if (lightingMode === "neon") {
          child.color.setHex(0x38bdf8);
          child.intensity = 4.0;
        } else {
          child.color.setHex(0xffb86c);
          child.intensity = 3.5;
        }
      }
    });
  }, [lightingMode]);

  // Highlight Selected Seat Ring and Update Camera POV / Orbit
  useEffect(() => {
    // Reset ring opacities
    seatObjectsRef.current.forEach((group, seatId) => {
      const ring = group.getObjectByName("SELECT_RING") as THREE.Mesh;
      if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
        ring.material.opacity = seatId === selectedSeatId ? 0.9 : 0;
      }
    });

    const activeSeat = seatsData.find((s) => s.id === selectedSeatId);

    if (viewMode === "pov" && activeSeat) {
      // Set camera to eye position of the seated viewer
      const [sx, sy, sz] = activeSeat.position;
      cameraTargetPos.current.set(sx, sy + 1.15, sz - 0.1); // Eye height
      cameraTargetLookAt.current.set(0, 3.2, -5.8); // Center of screen

      // Calculate Sightlines
      const dx = sx - 0;
      const dy = (sy + 1.15) - 3.2;
      const dz = (sz - 0.1) - (-5.8);
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Vertical viewing angle (degree relative to horizontal)
      const vertRad = Math.atan2(Math.abs(dy), dz);
      const verticalAngle = Math.round((vertRad * 180) / Math.PI);

      // Center offset percentage
      const centerOffset = Math.round((Math.abs(sx) / 4.5) * 100);

      // Horizontal FOV coverage estimate
      const screenW = 9.2;
      const fovRad = 2 * Math.atan((screenW / 2) / distance);
      const horizontalCoverage = Math.round((fovRad * 180 / Math.PI));

      let rating = "黄金观影位 (Golden Seat)";
      if (centerOffset > 45) rating = "侧方视角 (Side View)";
      else if (activeSeat.row === 1) rating = "前排包围感 (Immersive Front)";
      else if (activeSeat.row === 3) rating = "后排全景全貌 (Panoramic Back)";

      if (onSightlineCalculated) {
        onSightlineCalculated({
          verticalAngle,
          horizontalCoverage,
          centerOffset,
          rating,
        });
      }
    } else {
      // Orbit / Full Room View Camera
      cameraTargetPos.current.set(0, 4.2, 11.5);
      cameraTargetLookAt.current.set(0, 2.2, -2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeatId, viewMode, onSightlineCalculated]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[480px] rounded-2xl overflow-hidden shadow-2xl border border-amber-900/30">
      <canvas ref={canvasRef} className="w-full h-full cursor-pointer block" />

      {/* Screen Glowing Label Badge */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-amber-500/30 text-xs text-amber-200">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-mono tracking-wider">3D WEBGL REALTIME RENDER</span>
      </div>
    </div>
  );
}
