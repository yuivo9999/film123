"use client";

import React from "react";
import { SeatInfo } from "./CinemaCanvas3D";
import { Sparkles, Eye, Armchair } from "lucide-react";

interface Seat2DMapProps {
  seats: SeatInfo[];
  selectedSeatId: string | null;
  onSelectSeat: (seat: SeatInfo) => void;
  viewMode: "orbit" | "pov";
  onToggleViewMode: (mode: "orbit" | "pov") => void;
}

export default function Seat2DMap({
  seats,
  selectedSeatId,
  onSelectSeat,
  viewMode,
  onToggleViewMode,
}: Seat2DMapProps) {
  // Group seats by row
  const rowLabels = ["A", "B", "C"];

  return (
    <div className="bg-[#181410]/90 backdrop-blur-md border border-amber-900/40 rounded-2xl p-5 shadow-xl text-amber-100/90">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-amber-900/30">
        <div className="flex items-center space-x-2">
          <Armchair className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-base text-amber-100">平面选座 & 视角选择</h3>
        </div>
        <div className="flex bg-[#261f18] p-1 rounded-xl border border-amber-900/40">
          <button
            onClick={() => onToggleViewMode("orbit")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              viewMode === "orbit"
                ? "bg-amber-600 text-amber-95 shadow-md"
                : "text-amber-300/70 hover:text-amber-200"
            }`}
          >
            全景巡检
          </button>
          <button
            onClick={() => onToggleViewMode("pov")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 ${
              viewMode === "pov"
                ? "bg-amber-600 text-amber-95 shadow-md"
                : "text-amber-300/70 hover:text-amber-200"
            }`}
          >
            <Eye className="w-3.5 h-3.5 mr-1" />
            第一人称 POV
          </button>
        </div>
      </div>

      {/* Screen Graphic Bar */}
      <div className="w-full mb-6 flex flex-col items-center">
        <div className="w-3/4 h-2 bg-gradient-to-r from-amber-700/20 via-amber-400 to-amber-700/20 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.5)]" />
        <span className="text-[10px] tracking-widest uppercase text-amber-400/60 mt-1 font-mono">
          银幕方向 MOVIE SCREEN
        </span>
      </div>

      {/* 2D Seats Grid */}
      <div className="space-y-3 my-2 max-w-xs mx-auto">
        {rowLabels.map((rowName) => {
          const rowSeats = seats.filter((s) => s.rowLabel === rowName);
          return (
            <div key={rowName} className="flex items-center justify-center space-x-2">
              <span className="w-5 text-xs font-mono font-bold text-amber-500 text-center">
                {rowName}
              </span>
              <div className="flex space-x-2">
                {rowSeats.map((seat) => {
                  const isSelected = seat.id === selectedSeatId;
                  return (
                    <button
                      key={seat.id}
                      onClick={() => {
                        onSelectSeat(seat);
                        if (viewMode !== "pov") onToggleViewMode("pov");
                      }}
                      className={`relative w-9 h-9 rounded-xl flex items-center justify-center font-mono text-xs font-semibold transition-all duration-200 border ${
                        isSelected
                          ? "bg-gradient-to-br from-amber-500 to-amber-700 text-amber-950 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.6)] scale-110 ring-2 ring-amber-400/50"
                          : seat.isVIP
                          ? "bg-[#2d4d38] text-emerald-200 border-emerald-600/50 hover:border-emerald-400 hover:scale-105"
                          : "bg-[#251e18] text-amber-200/80 border-amber-900/50 hover:bg-[#332a21] hover:border-amber-700 hover:scale-105"
                      }`}
                      title={`${seat.rowLabel}排${seat.colLabel}座 (${seat.isVIP ? "黄金特等座" : "标准座"})`}
                    >
                      {seat.colLabel}
                      {seat.isVIP && !isSelected && (
                        <Sparkles className="w-2.5 h-2.5 absolute top-0.5 right-0.5 text-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-5 pt-3 border-t border-amber-900/30 flex items-center justify-center space-x-4 text-xs text-amber-300/70">
        <div className="flex items-center space-x-1.5">
          <div className="w-3.5 h-3.5 rounded-md bg-[#251e18] border border-amber-900/50" />
          <span>标准配座</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3.5 h-3.5 rounded-md bg-[#2d4d38] border border-emerald-600/50" />
          <span>黄金观影区</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3.5 h-3.5 rounded-md bg-amber-500 border border-amber-300" />
          <span>当前选中位</span>
        </div>
      </div>
    </div>
  );
}
