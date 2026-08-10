"use client";

import React, { useState, useRef, useEffect } from "react";
import { Check, CaretDown, Sparkle } from "@phosphor-icons/react";

export type SceneStyle =
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

export interface SceneStyleOption {
  id: SceneStyle;
  icon: string;
  name: string;
  subtitle: string;
  badge: string;
  themeColor: string;
}

export const SCENE_STYLES: SceneStyleOption[] = [
  {
    id: "classic",
    icon: "🏛️",
    name: "经典现代影厅",
    subtitle: "顶级IMAX/杜比包厢 · 沉浸环绕声学环境",
    badge: "经典标配",
    themeColor: "#d04b43",
  },
  {
    id: "minimalist_cream",
    icon: "🤍",
    name: "极简米色艺术影厅",
    subtitle: "米白织物几何折面墙 · 隐形斜向线性暗光 · 黑色悬臂Z型雕塑椅",
    badge: "极简雅致",
    themeColor: "#e2d9cc",
  },
  {
    id: "imax_giant",
    icon: "🎞️",
    name: "IMAX巨幕正视角影厅",
    subtitle: "墙到墙微弧顶天立地巨幕 · 金属悬吊天花网格 · 侧壁高保真黑音箱",
    badge: "巨幕全景",
    themeColor: "#38bdf8",
  },
  {
    id: "warm_wood_lounge",
    icon: "🪵",
    name: "原木臻选私享影厅",
    subtitle: "温润木梁与织物吸音墙 · 墨绿皮革独栋软椅 · 隐形下沉阶梯脚灯",
    badge: "原木奢享",
    themeColor: "#d97706",
  },
  {
    id: "urban_plaza",
    icon: "🏙️",
    name: "都市露天广场影院",
    subtitle: "高楼公寓夜景环绕 · 金属桁架独立银幕 · 广场平整座席",
    badge: "都市摩天",
    themeColor: "#3b82f6",
  },
  {
    id: "snowy_greek",
    icon: "❄️",
    name: "古希腊雪山露天影院",
    subtitle: "欧洲最高雪山阿尔卑斯 · 千年大理石阶梯长凳",
    badge: "雪山史诗",
    themeColor: "#38bdf8",
  },
  {
    id: "space_station",
    icon: "🚀",
    name: "空间站无重力影厅",
    subtitle: "地球轨道穹顶 · 浩瀚宇宙全景观测台",
    badge: "科幻极致",
    themeColor: "#f59e0b",
  },
  {
    id: "alpine_desert",
    icon: "🏔️",
    name: "雪山荒野露天影院",
    subtitle: "巍峨雪山连绵荒漠 · 经典红色绒面剧院排椅 · 露天巨幕",
    badge: "雪漠巨幕",
    themeColor: "#ef4444",
  },
  {
    id: "baroque_opera",
    icon: "👑",
    name: "巴洛克皇家歌剧院影厅",
    subtitle: "金碧辉煌鎏金台口拱门 · 双层弧形雕花包厢 · 奢华红丝绒座椅",
    badge: "宫廷奢华",
    themeColor: "#eab308",
  },
  {
    id: "suzhou_garden",
    icon: "🏮",
    name: "苏州庭院户外影院",
    subtitle: "粉墙黛瓦月洞门 · 太湖石假山竹林 · 青石板庭院红灯笼",
    badge: "江南雅韵",
    themeColor: "#c0392b",
  },
];

interface SceneStylePickerProps {
  currentStyle: SceneStyle;
  onSelectStyle: (style: SceneStyle) => void;
  variant?: "topbar" | "card_grid";
}

export function SceneStylePicker({
  currentStyle,
  onSelectStyle,
  variant = "topbar",
}: SceneStylePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [clickedStyle, setClickedStyle] = useState<SceneStyle | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeOption =
    SCENE_STYLES.find((s) => s.id === currentStyle) ?? SCENE_STYLES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
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

  const handleChoose = (option: SceneStyleOption) => {
    setClickedStyle(option.id);
    onSelectStyle(option.id);
    setToastMessage(`已开启：${option.icon} ${option.name}`);
    setTimeout(() => {
      setClickedStyle(null);
    }, 400);
    setTimeout(() => {
      setIsOpen(false);
    }, 200);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  if (variant === "card_grid") {
    return (
      <div className="style-picker-grid-wrapper">
        <div className="style-picker-header">
          <span className="style-picker-label">
            <Sparkle size={18} className="text-amber-400 inline mr-1" />
            切换 3D 影院主题（10大实景风格）：
          </span>
          {toastMessage && (
            <span className="style-picker-toast-badge animate-bounce">
              {toastMessage}
            </span>
          )}
        </div>

        <div className="style-picker-grid">
          {SCENE_STYLES.map((option) => {
            const isActive = currentStyle === option.id;
            const isJustClicked = clickedStyle === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`style-card-btn ${isActive ? "is-active" : ""} ${
                  isJustClicked ? "is-clicked" : ""
                }`}
                onClick={() => handleChoose(option)}
                style={
                  isActive
                    ? ({
                        "--active-theme-color": option.themeColor,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <span className="style-card-icon">{option.icon}</span>
                <span className="style-card-name">{option.name}</span>
                <span className="style-card-badge">{option.badge}</span>
                {isActive && <Check size={16} className="style-card-check" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="style-picker-topbar-container" ref={dropdownRef}>
      {toastMessage && (
        <div className="style-picker-topbar-toast">{toastMessage}</div>
      )}

      <button
        type="button"
        className={`style-picker-trigger ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={`切换影厅风格，当前：${activeOption.name}`}
      >
        <span className="picker-trigger-icon">{activeOption.icon}</span>
        <span className="picker-trigger-title">{activeOption.name}</span>
        <CaretDown
          size={14}
          className={`picker-trigger-chevron ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="style-picker-dropdown-menu" role="menu">
          <div className="dropdown-menu-header">
            <span>选择 3D 影厅视觉风格 (10种)</span>
          </div>
          <div className="dropdown-menu-list">
            {SCENE_STYLES.map((option) => {
              const isActive = currentStyle === option.id;
              const isJustClicked = clickedStyle === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`dropdown-item ${isActive ? "is-active" : ""} ${
                    isJustClicked ? "is-clicked" : ""
                  }`}
                  role="menuitem"
                  onClick={() => handleChoose(option)}
                  style={{ "--item-theme-color": option.themeColor } as React.CSSProperties}
                >
                  <span className="item-icon">{option.icon}</span>
                  <div className="item-info">
                    <span className="item-name">{option.name}</span>
                  </div>
                  <span className="item-badge">{option.badge}</span>
                  {isActive ? (
                    <span className="item-active-check">
                      <Check size={16} weight="bold" />
                    </span>
                  ) : (
                    <span className="item-hover-indicator" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
