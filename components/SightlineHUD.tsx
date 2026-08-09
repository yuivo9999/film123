"use client";

import React from "react";
import { Compass, Eye, Maximize2, ShieldCheck } from "lucide-react";

interface SightlineHUDProps {
  selectedSeatId: string | null;
  sightlineData: {
    verticalAngle: number;
    horizontalCoverage: number;
    centerOffset: number;
    rating: string;
  } | null;
  aspectRatio: string;
  onChangeAspectRatio: (ratio: "2.39" | "1.90" | "1.43" | "16:9") => void;
  lightingMode: "warm" | "dark" | "neon";
  onChangeLightingMode: (mode: "warm" | "dark" | "neon") => void;
}

export default function SightlineHUD({
  selectedSeatId,
  sightlineData,
  aspectRatio,
  onChangeAspectRatio,
  lightingMode,
  onChangeLightingMode,
}: SightlineHUDProps) {
  return (
    <div className="bg-[#181410]/90 backdrop-blur-md border border-amber-900/40 rounded-2xl p-5 shadow-xl space-y-4 text-amber-100/90">
      <div className="flex items-center justify-between pb-3 border-b border-amber-900/30">
        <div className="flex items-center space-x-2">
          <Eye className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-base text-amber-100">
            视线与画面参数 (POV Analysis)
          </h3>
        </div>
        <span className="text-xs font-mono font-bold px-2.5 py-1 bg-amber-950 text-amber-300 rounded-lg border border-amber-800">
          {selectedSeatId ? `座位 ${selectedSeatId}` : "全景视角"}
        </span>
      </div>

      {sightlineData ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#241d17] p-3 rounded-xl border border-amber-900/30">
            <div className="text-[11px] text-amber-400/80 font-medium flex items-center space-x-1">
              <Compass className="w-3.5 h-3.5" />
              <span>仰角 (Vertical Angle)</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-100 mt-1">
              {sightlineData.verticalAngle}°
            </div>
            <div className="text-[10px] text-amber-300/60 mt-0.5">
              {sightlineData.verticalAngle <= 15 ? "舒适眼动区 (Standard)" : "偏高仰角 (Elevated)"}
            </div>
          </div>

          <div className="bg-[#241d17] p-3 rounded-xl border border-amber-900/30">
            <div className="text-[11px] text-amber-400/80 font-medium flex items-center space-x-1">
              <Maximize2 className="w-3.5 h-3.5" />
              <span>视野覆盖率 (FOV Coverage)</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-100 mt-1">
              {sightlineData.horizontalCoverage}°
            </div>
            <div className="text-[10px] text-amber-300/60 mt-0.5">
              {sightlineData.horizontalCoverage >= 36 ? "IMAX 级沉浸包围" : "中规中矩清晰视角"}
            </div>
          </div>

          <div className="col-span-2 bg-[#2d2218] p-3 rounded-xl border border-amber-800/40 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="text-xs text-amber-300/70">视线综合评价</div>
                <div className="text-sm font-bold text-amber-200">
                  {sightlineData.rating}
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-950/80 border border-emerald-700/50 px-2.5 py-1 rounded-md">
              推荐等级 A+
            </span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-amber-300/60 text-center py-4 bg-[#201913] rounded-xl border border-dashed border-amber-900/40">
          点击 2D 选座图或 3D 影厅中的椅面，进入第一人称视角实时查看视线偏角与画面包围感。
        </div>
      )}

      {/* Control Toggles */}
      <div className="space-y-3 pt-2 border-t border-amber-900/30">
        <div>
          <label className="text-xs text-amber-300/80 font-medium mb-1.5 block">
            银幕画幅比例 (Aspect Ratio)
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: "2.39", label: "2.39:1 宽银幕" },
              { id: "1.90", label: "1.90:1 IMAX" },
              { id: "1.43", label: "1.43:1 激光双机" },
              { id: "16:9", label: "16:9 标画" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onChangeAspectRatio(item.id as any)}
                className={`py-1.5 px-2 rounded-lg text-xs font-mono font-medium transition-all text-center border ${
                  aspectRatio === item.id
                    ? "bg-amber-600 text-amber-950 border-amber-300 font-bold shadow-md"
                    : "bg-[#241d17] text-amber-200/70 border-amber-900/40 hover:border-amber-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-amber-300/80 font-medium mb-1.5 block">
            环境氛围灯光 (Atmosphere Mode)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "warm", label: "暖色原木 (图片同款)" },
              { id: "dark", label: "沉浸关灯 (Movie)" },
              { id: "neon", label: "科幻 Dolby" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onChangeLightingMode(item.id as any)}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center border ${
                  lightingMode === item.id
                    ? "bg-amber-600 text-amber-950 border-amber-300 font-bold shadow-md"
                    : "bg-[#241d17] text-amber-200/70 border-amber-900/40 hover:border-amber-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
