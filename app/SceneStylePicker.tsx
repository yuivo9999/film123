"use client";

import React, { useState, useRef, useEffect } from "react";
import { Check, CaretDown, Sparkle } from "@phosphor-icons/react";

export type SceneStyle =
  | "classic"
  | "urban_plaza"
  | "snowy_greek"
  | "drive_in"
  | "cyberpunk"
  | "forest_camp"
  | "space_station"
  | "warm_wood_lounge";

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
    id: "drive_in",
    icon: "🌌",
    name: "星空露天汽车影院",
    subtitle: "旷野璀璨星河 · 复古汽车露天电影场",
    badge: "星光浪漫",
    themeColor: "#a855f7",
  },
  {
    id: "cyberpunk",
    icon: "⛩️",
    name: "赛博朋克霓虹影剧院",
    subtitle: "未来霓虹光轨 · 极客高能视听黑科技",
    badge: "赛博未来",
    themeColor: "#ec4899",
  },
  {
    id: "forest_camp",
    icon: "🌲",
    name: "森林营地露天影院",
    subtitle: "松林篝火晚风 · 萤火点缀自然巨幕",
    badge: "自然沉浸",
    themeColor: "#22c55e",
  },
  {
    id: "space_station",
    icon: "🚀",
    name: "空间站无重力影厅",
    subtitle: "地球轨道穹顶 · 浩瀚宇宙全景观测台",
    badge: "科幻极致",
    themeColor: "#f59e0b",
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
            切换 3D 影院主题（8大实景风格）：
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
            <span>选择 3D 影厅视觉风格 (8种)</span>
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
