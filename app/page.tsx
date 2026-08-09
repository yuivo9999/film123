"use client";

import React, { useState } from "react";
import CinemaCanvas3D, { SeatInfo } from "@/components/CinemaCanvas3D";
import Seat2DMap from "@/components/Seat2DMap";
import SightlineHUD from "@/components/SightlineHUD";
import AnswerNotice from "@/components/AnswerNotice";
import { Film, Clapperboard, Sparkles, Monitor, Eye } from "lucide-react";

export default function HomePage() {
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>("B3");
  const [viewMode, setViewMode] = useState<"orbit" | "pov">("pov");
  const [lightingMode, setLightingMode] = useState<"warm" | "dark" | "neon">("warm");
  const [aspectRatio, setAspectRatio] = useState<"2.39" | "1.90" | "1.43" | "16:9">("1.90");
  const [isPlayingVideo, setIsPlayingVideo] = useState(true);

  const [sightlineData, setSightlineData] = useState<{
    verticalAngle: number;
    horizontalCoverage: number;
    centerOffset: number;
    rating: string;
  } | null>({
    verticalAngle: 12,
    horizontalCoverage: 42,
    centerOffset: 0,
    rating: "黄金观影区 (Golden IMAX View)",
  });

  // Seats list match 3D component seats
  const seats: SeatInfo[] = [
    { id: "A2", row: 1, col: 2, rowLabel: "A", colLabel: "02", position: [-1.4, 0.45, 0], isVIP: false },
    { id: "A3", row: 1, col: 3, rowLabel: "A", colLabel: "03", position: [0.0, 0.45, 0], isVIP: true },
    { id: "A4", row: 1, col: 4, rowLabel: "A", colLabel: "04", position: [1.4, 0.45, 0], isVIP: false },

    { id: "B1", row: 2, col: 1, rowLabel: "B", colLabel: "01", position: [-2.8, 0.95, 2.8], isVIP: false },
    { id: "B2", row: 2, col: 2, rowLabel: "B", colLabel: "02", position: [-1.2, 0.95, 2.8], isVIP: true },
    { id: "B3", row: 2, col: 3, rowLabel: "B", colLabel: "03", position: [0.0, 0.95, 2.8], isVIP: true },
    { id: "B4", row: 2, col: 4, rowLabel: "B", colLabel: "04", position: [1.2, 0.95, 2.8], isVIP: true },
    { id: "B5", row: 2, col: 5, rowLabel: "B", colLabel: "05", position: [2.8, 0.95, 2.8], isVIP: false },

    { id: "C1", row: 3, col: 1, rowLabel: "C", colLabel: "01", position: [-3.5, 1.45, 5.6], isVIP: false },
    { id: "C2", row: 3, col: 2, rowLabel: "C", colLabel: "02", position: [-1.8, 1.45, 5.6], isVIP: false },
    { id: "C3", row: 3, col: 3, rowLabel: "C", colLabel: "03", position: [0.0, 1.45, 5.6], isVIP: true },
    { id: "C4", row: 3, col: 4, rowLabel: "C", colLabel: "04", position: [1.8, 1.45, 5.6], isVIP: false },
    { id: "C5", row: 3, col: 5, rowLabel: "C", colLabel: "05", position: [3.5, 1.45, 5.6], isVIP: false },
  ];

  return (
    <main className="min-h-screen bg-[#0e0c0a] text-[#f2ede4] pb-12">
      {/* Header */}
      <header className="border-b border-amber-900/30 bg-[#14100c]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-600 to-amber-800 text-amber-950 shadow-lg">
              <Film className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-amber-100 flex items-center gap-2">
                坐哪儿 - Three.js 3D 影厅视线模拟器
                <span className="text-xs font-normal text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded-full">
                  WebGL 2.0
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <button
              onClick={() => setLightingMode("warm")}
              className={`hidden sm:flex items-center space-x-1 px-3 py-1.5 rounded-xl border transition-all ${
                lightingMode === "warm"
                  ? "bg-amber-600 text-amber-950 border-amber-300 font-bold"
                  : "bg-[#201a14] text-amber-300/80 border-amber-900/40 hover:border-amber-700"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>原木温暖氛围</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Direct Answer Banner */}
        <AnswerNotice />

        {/* 3D Visualizer & Control Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main 3D Canvas Box */}
          <div className="lg:col-span-8 space-y-4">
            <div className="relative h-[560px] w-full rounded-2xl overflow-hidden shadow-2xl bg-[#14110e]">
              <CinemaCanvas3D
                selectedSeatId={selectedSeatId}
                onSelectSeat={(seat) => setSelectedSeatId(seat.id)}
                viewMode={viewMode}
                lightingMode={lightingMode}
                aspectRatio={aspectRatio}
                isPlayingVideo={isPlayingVideo}
                onSightlineCalculated={setSightlineData}
              />
            </div>

            {/* Quick Feature Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#181410] border border-amber-900/30 p-3 rounded-xl flex items-center space-x-2 text-amber-200">
                <Clapperboard className="w-4 h-4 text-amber-400 shrink-0" />
                <span>实景材质: 哑光原木/高弹革</span>
              </div>
              <div className="bg-[#181410] border border-amber-900/30 p-3 rounded-xl flex items-center space-x-2 text-amber-200">
                <Monitor className="w-4 h-4 text-amber-400 shrink-0" />
                <span>银幕: 4K HDR IMAX 双机</span>
              </div>
              <div className="bg-[#181410] border border-amber-900/30 p-3 rounded-xl flex items-center space-x-2 text-amber-200">
                <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                <span>POV 瞳高: 1.15m (坐姿)</span>
              </div>
              <div className="bg-[#181410] border border-amber-900/30 p-3 rounded-xl flex items-center space-x-2 text-amber-200">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>光效: 线性软阴影 & 槽光</span>
              </div>
            </div>
          </div>

          {/* Right Controls Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <Seat2DMap
              seats={seats}
              selectedSeatId={selectedSeatId}
              onSelectSeat={(seat) => setSelectedSeatId(seat.id)}
              viewMode={viewMode}
              onToggleViewMode={setViewMode}
            />

            <SightlineHUD
              selectedSeatId={selectedSeatId}
              sightlineData={sightlineData}
              aspectRatio={aspectRatio}
              onChangeAspectRatio={setAspectRatio}
              lightingMode={lightingMode}
              onChangeLightingMode={setLightingMode}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
