"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Monitor, CaretDown, SlidersHorizontal, ArrowCounterClockwise, Check, Play, X } from "@phosphor-icons/react";

export interface CustomScreenConfig {
  enabled: boolean;
  width: number;
  height: number;
  distanceOffset: number;
}

export const DEFAULT_SCREEN_CONFIG: CustomScreenConfig = {
  enabled: false,
  width: 22,
  height: 12,
  distanceOffset: 0,
};

const STORAGE_KEY = "zuonaar-custom-screen-config";

export function loadCustomScreenConfig(): CustomScreenConfig {
  if (typeof window === "undefined") return DEFAULT_SCREEN_CONFIG;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        enabled: Boolean(parsed.enabled),
        width: typeof parsed.width === "number" ? parsed.width : 22,
        height: typeof parsed.height === "number" ? parsed.height : 12,
        distanceOffset: typeof parsed.distanceOffset === "number" ? parsed.distanceOffset : 0,
      };
    }
  } catch (e) {
    // Ignore storage parse errors
  }
  return DEFAULT_SCREEN_CONFIG;
}

export function saveCustomScreenConfig(config: CustomScreenConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    // Ignore storage errors
  }
}

interface ScreenPreset {
  name: string;
  badge: string;
  width: number;
  height: number;
  distanceOffset: number;
}

const PRESETS: ScreenPreset[] = [
  { name: "16:9 标准影厅", badge: "标准", width: 18, height: 10.1, distanceOffset: 0 },
  { name: "IMAX GT 胶片巨幕", badge: "28米巨幕", width: 28, height: 20, distanceOffset: 1.5 },
  { name: "杜比全景声巨幕", badge: "22米巨幕", width: 22, height: 12, distanceOffset: 0.5 },
  { name: "露天 2.39:1 超宽屏", badge: "宽银幕", width: 26, height: 10.8, distanceOffset: -1.0 },
  { name: "私人微影厅", badge: "微观视界", width: 12, height: 6.7, distanceOffset: -2.0 },
];

interface ScreenCustomizerControlProps {
  config: CustomScreenConfig;
  onChange: (newConfig: CustomScreenConfig) => void;
  variant?: "topbar" | "header_btn";
  defaultWidth?: number;
  defaultHeight?: number;
}

export function ScreenCustomizerControl({
  config,
  onChange,
  variant = "header_btn",
  defaultWidth = 22,
  defaultHeight = 12,
}: ScreenCustomizerControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const activeWidth = config.enabled ? config.width : defaultWidth;
  const activeHeight = config.enabled ? config.height : defaultHeight;
  const area = Math.round(activeWidth * activeHeight);
  const ratio = (activeWidth / activeHeight).toFixed(2);

  const handleUpdate = (updates: Partial<CustomScreenConfig>) => {
    const updated: CustomScreenConfig = {
      ...config,
      enabled: true,
      ...updates,
    };
    onChange(updated);
    saveCustomScreenConfig(updated);
  };

  const handleApplyPreset = (preset: ScreenPreset) => {
    const updated: CustomScreenConfig = {
      enabled: true,
      width: preset.width,
      height: preset.height,
      distanceOffset: preset.distanceOffset,
    };
    onChange(updated);
    saveCustomScreenConfig(updated);
  };

  const handleReset = () => {
    const resetConfig: CustomScreenConfig = {
      enabled: false,
      width: defaultWidth,
      height: defaultHeight,
      distanceOffset: 0,
    };
    onChange(resetConfig);
    saveCustomScreenConfig(resetConfig);
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 shadow-sm border ${
          config.enabled
            ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
            : variant === "topbar"
            ? "bg-slate-800/80 text-slate-200 border-slate-700/60 hover:bg-slate-700/80"
            : "bg-slate-900/90 text-slate-200 border-amber-500/30 hover:border-amber-400"
        }`}
        title="自定义银幕尺寸与视角远近"
      >
        <Monitor size={15} className={config.enabled ? "text-amber-400" : "text-slate-400"} />
        <span>
          {config.enabled
            ? `自定义银幕 ${activeWidth.toFixed(1)}×${activeHeight.toFixed(1)}m`
            : "自定义银幕尺寸与视距"}
        </span>
        <SlidersHorizontal size={13} className="ml-0.5 opacity-70" />
        <CaretDown size={12} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[90] sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="fixed inset-x-3 top-16 max-w-[calc(100vw-24px)] mx-auto z-[100] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-w-none rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl p-4 text-slate-200 text-xs animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <Monitor size={18} className="text-amber-400" />
                <strong className="text-sm font-semibold text-white">自定义银幕与视距</strong>
              </div>
              <div className="flex items-center gap-2">
                {config.enabled && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex items-center gap-1 text-slate-400 hover:text-amber-400 text-xs transition-colors"
                    title="恢复默认"
                  >
                    <ArrowCounterClockwise size={13} />
                    <span>重置</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-md sm:hidden"
                  aria-label="关闭"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="mb-4">
              <div className="text-slate-400 text-[11px] font-medium mb-2">快捷预设规格：</div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((preset) => {
                  const isSelected =
                    config.enabled &&
                    Math.abs(config.width - preset.width) < 0.2 &&
                    Math.abs(config.height - preset.height) < 0.2 &&
                    Math.abs(config.distanceOffset - preset.distanceOffset) < 0.2;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-left transition-all ${
                        isSelected
                          ? "bg-amber-500/20 border-amber-500/50 text-amber-200 font-medium"
                          : "bg-slate-800/60 border-slate-700/50 hover:bg-slate-800 text-slate-300"
                      }`}
                    >
                      <span className="truncate">{preset.name}</span>
                      <span className="text-[10px] opacity-75 px-1 py-0.5 rounded bg-slate-900/60 ml-1 shrink-0">
                        {preset.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Realtime Spec Badges */}
            <div className="flex items-center justify-around bg-slate-950/60 rounded-lg p-2 border border-slate-800/80 mb-3 text-center">
              <div>
                <div className="text-slate-400 text-[10px]">银幕宽度</div>
                <div className="text-amber-300 font-semibold">{activeWidth.toFixed(1)} m</div>
              </div>
              <div className="h-5 w-px bg-slate-800" />
              <div>
                <div className="text-slate-400 text-[10px]">银幕高度</div>
                <div className="text-amber-300 font-semibold">{activeHeight.toFixed(1)} m</div>
              </div>
              <div className="h-5 w-px bg-slate-800" />
              <div>
                <div className="text-slate-400 text-[10px]">银幕面积</div>
                <div className="text-emerald-400 font-semibold">{area} ㎡</div>
              </div>
              <div className="h-5 w-px bg-slate-800" />
              <div>
                <div className="text-slate-400 text-[10px]">宽高比例</div>
                <div className="text-sky-300 font-semibold">{ratio}:1</div>
              </div>
            </div>

            {/* Continuous Sliders */}
            <div className="space-y-3 mb-4">
              {/* Width Slider */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>银幕宽度 (Width)</span>
                  <span className="text-amber-300 font-medium">{activeWidth.toFixed(1)} 米</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={36}
                  step={0.5}
                  value={activeWidth}
                  onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>小型 (8m)</span>
                  <span>标准 (20m)</span>
                  <span>超巨幕 (36m)</span>
                </div>
              </div>

              {/* Height Slider */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>银幕高度 (Height)</span>
                  <span className="text-amber-300 font-medium">{activeHeight.toFixed(1)} 米</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={22}
                  step={0.5}
                  value={activeHeight}
                  onChange={(e) => handleUpdate({ height: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>低矮 (4m)</span>
                  <span>标准 (12m)</span>
                  <span>IMAX 70mm (22m)</span>
                </div>
              </div>

              {/* Distance Offset Slider */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>观众席与银幕视距微调</span>
                  <span className="text-sky-300 font-medium">
                    {config.distanceOffset > 0
                      ? `较远 (+${config.distanceOffset.toFixed(1)}m)`
                      : config.distanceOffset < 0
                      ? `较近 (${config.distanceOffset.toFixed(1)}m)`
                      : "影厅默认视距"}
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={0.5}
                  value={config.enabled ? config.distanceOffset : 0}
                  onChange={(e) => handleUpdate({ distanceOffset: parseFloat(e.target.value) })}
                  className="w-full accent-sky-400 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>近压感 (-6m)</span>
                  <span>居中 (0m)</span>
                  <span>包厢后移 (+6m)</span>
                </div>
              </div>
            </div>

            {/* Launch Custom Cinema Experience Button */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
              <Link
                href="/cinema/auditorium-1?custom=1"
                onClick={() => {
                  handleUpdate({ enabled: true });
                  setIsOpen(false);
                }}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg shadow-lg transition-all text-center flex items-center justify-center gap-2 text-xs sm:text-sm"
              >
                <Play weight="fill" size={16} />
                <span>进入自定义银幕影厅体验</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-1.5 text-slate-400 hover:text-white transition-colors text-center text-[11px]"
              >
                保存设置并关闭
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

