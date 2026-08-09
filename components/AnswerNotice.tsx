"use client";

import React, { useState } from "react";
import { CheckCircle2, ChevronRight, Layers, Sparkles, X } from "lucide-react";

export default function AnswerNotice() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="bg-gradient-to-r from-amber-950/90 via-[#261d15]/90 to-amber-950/90 border border-amber-500/40 rounded-2xl p-4 shadow-2xl text-amber-100 relative backdrop-blur-md">
      <button
        onClick={() => setIsOpen(false)}
        className="absolute top-3 right-3 text-amber-400/60 hover:text-amber-200 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start space-x-3">
        <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
          <CheckCircle2 className="w-5 h-5" />
        </div>

        <div className="space-y-1.5 pr-6">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base text-amber-200">
              回答：是的，完全可以使用 Three.js 和 WebGL 制作出来！
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              100% 实时 3D 渲染
            </span>
          </div>

          <p className="text-xs text-amber-200/80 leading-relaxed">
            您看到的当前页面即是基于 Three.js 和 WebGL 实时构建的 3D 私人影厅场景。我们精准重构了图片中的全部核心设计要素：
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
            <div className="flex items-center space-x-1.5 text-amber-300/90 bg-black/30 px-2.5 py-1.5 rounded-lg border border-amber-900/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>原木悬浮横梁与壁龛暖光洗墙效果</span>
            </div>
            <div className="flex items-center space-x-1.5 text-amber-300/90 bg-black/30 px-2.5 py-1.5 rounded-lg border border-amber-900/30">
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>橄榄绿皮革沙发椅与木质骨架</span>
            </div>
            <div className="flex items-center space-x-1.5 text-amber-300/90 bg-black/30 px-2.5 py-1.5 rounded-lg border border-amber-900/30">
              <ChevronRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>错层阶梯地台与踢脚线暖黄 LED 柔光灯</span>
            </div>
            <div className="flex items-center space-x-1.5 text-amber-300/90 bg-black/30 px-2.5 py-1.5 rounded-lg border border-amber-900/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>动态 4K 巨幕播片与第一人称 (POV) 视角切换</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
