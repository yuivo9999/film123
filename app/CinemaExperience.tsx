"use client";

import Link from "next/link";
import { CinemaScene, type CameraPreset, type FreeMoveCommand } from "./CinemaScene";
import { SceneStylePicker, type SceneStyle } from "./SceneStylePicker";
import {
  ScreenCustomizerControl,
  loadCustomScreenConfig,
  saveCustomScreenConfig,
  type CustomScreenConfig,
} from "./ScreenCustomizerControl";
import {
  ArrowLeft,
  ArrowsIn,
  ArrowsOut,
  Camera,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CornersIn,
  CornersOut,
  FastForward,
  FilmStrip,
  Lightbulb,
  Pause,
  Play,
  Rewind,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
  Upload,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  auditoriums,
  buildSeats,
  cinemas,
  getAuditoriumById,
  getSeatMetrics,
  type Auditorium,
  type Seat,
} from "./cinema-data";

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const idleViewCommand = { yaw: 0, pitch: 0, token: 0 };

export const CAMERA_PRESETS: {
  id: CameraPreset;
  icon: string;
  name: string;
  desc: string;
}[] = [
  {
    id: "seat",
    icon: "💺",
    name: "观影座位",
    desc: "第一人称视角（当前选择的座位）",
  },
  {
    id: "rear_center",
    icon: "🏛️",
    name: "后排全景",
    desc: "后排高视角，俯瞰全厅排座与完整银幕",
  },
  {
    id: "front_row",
    icon: "📐",
    name: "前排仰视",
    desc: "前排低角度仰视，感受震撼巨幕包围感",
  },
  {
    id: "stage_view",
    icon: "🎭",
    name: "银幕反向",
    desc: "舞台/银幕视角，反向观察全厅阶梯排座与空间结构",
  },
  {
    id: "birds_eye",
    icon: "🦅",
    name: "空间鸟瞰",
    desc: "顶部鸟瞰视角，直观呈现影厅空间纵深与长宽比例",
  },
  {
    id: "side_angle",
    icon: "📐",
    name: "侧翼斜角",
    desc: "侧向45度透视，全面展示影厅坡度与壁侧结构",
  },
  {
    id: "free",
    icon: "🧭",
    name: "自由视角",
    desc: "自由漫游，十字键前后左右移动，上下键升降高度",
  },
];
type MobilePanelTab = "seats" | "info";
type FitMode =
  | "fit_screen"
  | "original"
  | "16_9"
  | "4_3"
  | "4_9"
  | "9_16"
  | "16_10"
  | "contain"
  | "fill"
  | "cover"
  | "height"
  | "vertical";

function getPreferredAuditorium(initialAuditoriumId?: string) {
  const requestedAuditorium =
    getAuditoriumById(initialAuditoriumId ?? "") ?? auditoriums[0];

  return (
    auditoriums.find(
      (item) =>
        item.cinemaId === requestedAuditorium.cinemaId &&
        item.name.startsWith("IMAX"),
    ) ?? requestedAuditorium
  );
}

function getDefaultSeatId(auditoriumId: string) {
  const auditorium =
    auditoriums.find((item) => item.id === auditoriumId) ?? auditoriums[0];
  const seats = buildSeats(auditorium);
  const centerRow = Math.floor(auditorium.rowCount / 2);
  const centerSeat =
    seats
      .filter((seat) => seat.status === "available")
      .sort(
        (left, right) =>
          Math.abs(left.row - centerRow) * 2 +
          Math.abs(left.x) -
          (Math.abs(right.row - centerRow) * 2 + Math.abs(right.x)),
      )[0] ?? seats[0];

  return centerSeat.id;
}

function TopSeatPicker({
  auditorium,
  cinemaAuditoriums,
  seats,
  selectedSeat,
  metrics,
  customScreen,
  onUpdateCustomScreen,
  onSelectAuditorium,
  onSelectSeat,
}: {
  auditorium: Auditorium;
  cinemaAuditoriums: Auditorium[];
  seats: Seat[];
  selectedSeat: Seat;
  metrics: ReturnType<typeof getSeatMetrics>;
  customScreen: CustomScreenConfig;
  onUpdateCustomScreen: (config: CustomScreenConfig) => void;
  onSelectAuditorium: (id: string) => void;
  onSelectSeat: (seat: Seat) => void;
}) {
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const rows = useMemo(() => {
    const map = new Map<number, Seat[]>();
    seats.forEach((seat) => {
      const list = map.get(seat.row) || [];
      list.push(seat);
      map.set(seat.row, list);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [seats]);

  const currentSeatRow = selectedSeat.row;
  const currentSeatsInRow = useMemo(
    () => seats.filter((s) => s.row === (activeRow ?? currentSeatRow)),
    [activeRow, currentSeatRow, seats],
  );

  return (
    <div className="top-seat-picker-bar" data-dbd-zone="top-seat-picker">
      <div className="top-seat-picker-header">
        <div className="top-seat-left-group">
          {cinemaAuditoriums.length > 1 ? (
            <select
              className="top-auditorium-select"
              value={auditorium.id}
              onChange={(e) => onSelectAuditorium(e.target.value)}
            >
              {cinemaAuditoriums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="top-auditorium-name">{auditorium.name}</span>
          )}
          <span className="top-seat-badge">
            {selectedSeat.rowLabel}排{selectedSeat.number}座 ({metrics.verdict})
          </span>
        </div>

        <div className="top-seat-metrics-group">
          <span className="hidden sm:inline">
            视角: <strong>{metrics.horizontalFov.toFixed(0)}°</strong>
          </span>
          <span className="hidden md:inline">
            距银幕: <strong>{metrics.distance.toFixed(1)}m</strong>
          </span>
          <button
            type="button"
            className="top-seat-toggle-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            title="快捷更换座位"
          >
            <span>{isExpanded ? "收起选座" : "选座"}</span>
            {isExpanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="top-seat-picker-content">
          <div className="top-screen-indicator">▲ 银幕方向 ( SCREEN ) ▲</div>

          <div className="top-row-pills">
            {rows.map(([rowNum, rowSeats]) => {
              const rowLabel = rowSeats[0]?.rowLabel || `${rowNum + 1}`;
              const isCurrentRow = (activeRow ?? currentSeatRow) === rowNum;
              const hasSelected = selectedSeat.row === rowNum;
              return (
                <button
                  key={rowNum}
                  type="button"
                  className={`top-row-pill ${isCurrentRow ? "is-active" : ""} ${
                    hasSelected ? "has-selected" : ""
                  }`}
                  onClick={() => setActiveRow(rowNum)}
                >
                  {rowLabel}排
                </button>
              );
            })}
          </div>

          <div className="top-seats-strip">
            <span className="top-strip-row-label">
              {(activeRow ?? currentSeatRow) + 1}排座位:
            </span>
            <div className="top-seats-list">
              {currentSeatsInRow.map((seat) => {
                const isSelected = seat.id === selectedSeat.id;
                const isOccupied = seat.status === "occupied";
                return (
                  <button
                    key={seat.id}
                    type="button"
                    disabled={isOccupied}
                    className={`top-seat-btn ${isSelected ? "is-selected" : ""} ${
                      isOccupied ? "is-occupied" : ""
                    }`}
                    onClick={() => {
                      onSelectSeat(seat);
                    }}
                    title={`${seat.rowLabel}排${seat.number}座 ${
                      isOccupied ? "(已占)" : ""
                    }`}
                  >
                    {seat.number}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CinemaExperience({
  initialAuditoriumId,
}: {
  initialAuditoriumId?: string;
}) {
  const initialAuditorium = getPreferredAuditorium(initialAuditoriumId);
  const [auditoriumId, setAuditoriumId] = useState(initialAuditorium.id);
  const [selectedSeatId, setSelectedSeatId] = useState(() =>
    getDefaultSeatId(initialAuditorium.id),
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("seat");
  const [freeMove, setFreeMove] = useState<FreeMoveCommand>({
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });
  const [isFreePadVisible, setIsFreePadVisible] = useState(false);
  const freePadHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [filmMode, setFilmMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackToken, setPlaybackToken] = useState(0);
  const [isSeatPanelCollapsed, setIsSeatPanelCollapsed] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [mobilePanelTab, setMobilePanelTab] =
    useState<MobilePanelTab>("seats");
  const [isMobile, setIsMobile] = useState(false);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Local video & player state
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [videoTitle, setVideoTitle] = useState<string>("IMAX Countdown");
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [skipTailSeconds, setSkipTailSeconds] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zuonaar-cinema-skip-tail");
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val)) return val;
      }
    }
    return 0;
  });
  const [fitMode, setFitMode] = useState<FitMode>("fit_screen");

  const handleSetSkipTail = (sec: number) => {
    setSkipTailSeconds(sec);
    if (typeof window !== "undefined") {
      localStorage.setItem("zuonaar-cinema-skip-tail", sec.toString());
    }
  };
  const [audioMode, setAudioMode] = useState<"original" | "cinema_spatial">("original");
  const [volume, setVolume] = useState<number>(1.0); // 0.0 to 2.0 (0% - 200%)
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const prevVolumeRef = useRef<number>(1.0);

  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);
  const [isLandscapeMode, setIsLandscapeMode] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Mobile system time and battery for full-screen mode
  const [deviceTimeStr, setDeviceTimeStr] = useState<string>("");
  const [batteryLevel, setBatteryLevel] = useState<number | null>(88);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [sceneStyle, setSceneStyle] = useState<SceneStyle>(() => {
    if (typeof window !== "undefined") {
      const savedStyle = window.localStorage.getItem("zuonaar-cinema-theme-style");
      if (savedStyle) return savedStyle as SceneStyle;
    }
    return "classic";
  });

  const handleSelectSceneStyle = (style: SceneStyle) => {
    setSceneStyle(style);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("zuonaar-cinema-theme-style", style);
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const mins = String(now.getMinutes()).padStart(2, "0");
      setDeviceTimeStr(`${hours}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      (navigator as any)
        .getBattery()
        .then((battery: any) => {
          const updateBattery = () => {
            setBatteryLevel(Math.round(battery.level * 100));
            setIsCharging(battery.charging);
          };
          updateBattery();
          battery.addEventListener("levelchange", updateBattery);
          battery.addEventListener("chargingchange", updateBattery);
        })
        .catch(() => {});
    }
  }, []);

  const seatMapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Hide free-view pads whenever leaving free camera mode
  useEffect(() => {
    if (cameraPreset !== "free") {
      setIsFreePadVisible(false);
      setFreeMove({
        forward: false,
        back: false,
        left: false,
        right: false,
        up: false,
        down: false,
      });
    }
  }, [cameraPreset]);

  // Clean up free-pad auto-hide timer on unmount
  useEffect(() => {
    return () => {
      if (freePadHideTimerRef.current) {
        clearTimeout(freePadHideTimerRef.current);
      }
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        setIsLandscapeMode((prev) => !prev);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => undefined);
      }
    }
  }, []);

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(prevVolumeRef.current || 1.0);
    } else {
      prevVolumeRef.current = volume;
      setIsMuted(true);
      setVolume(0);
    }
  };

  const resetControlsTimer = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (playing) {
        setIsControlsVisible(false);
      }
    }, 3500);
  }, [playing]);

  useEffect(() => {
    if (playing) {
      const timer = setTimeout(() => {
        setIsControlsVisible(false);
      }, 3500);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setIsControlsVisible(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [playing]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setVideoSrc(objectUrl);
    setVideoTitle(file.name);
    setPlaying(true);
    setPlaybackToken((prev) => prev + 1);
    resetControlsTimer();
  };

  const handleTimeUpdate = useCallback((curr: number, dur: number) => {
    setCurrentTime(curr);
    setDuration(dur);
  }, []);

  const [customScreen, setCustomScreen] = useState<CustomScreenConfig>(() =>
    loadCustomScreenConfig(),
  );

  const [isCustomMode, setIsCustomMode] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("custom") === "1";
    }
    return false;
  });

  const rawAuditorium =
    auditoriums.find((item) => item.id === auditoriumId) ?? auditoriums[0];

  const auditorium = useMemo(() => {
    if (!isCustomMode) return rawAuditorium;
    const w = customScreen.width > 0 ? customScreen.width : 22;
    const h = customScreen.height > 0 ? customScreen.height : 12;
    const offset = typeof customScreen.distanceOffset === "number" ? customScreen.distanceOffset : 0;
    return {
      ...rawAuditorium,
      name: `自定义银幕影厅 (${w.toFixed(1)}×${h.toFixed(1)}m)`,
      screenWidth: w,
      screenHeight: h,
      firstRowZ: rawAuditorium.firstRowZ + offset,
    };
  }, [rawAuditorium, customScreen, isCustomMode]);

  const cinema =
    cinemas.find((item) => item.id === auditorium.cinemaId) ?? cinemas[0];
  const cinemaAuditoriums = auditoriums.filter(
    (item) => item.cinemaId === cinema.id,
  );
  const seats = useMemo(() => buildSeats(auditorium), [auditorium]);
  const selectedSeat =
    seats.find((seat) => seat.id === selectedSeatId) ??
    seats.find((seat) => seat.id === getDefaultSeatId(auditorium.id)) ??
    seats[0];
  const metrics = getSeatMetrics(auditorium, selectedSeat);
  const lightActionLabel = filmMode ? "开灯" : "关灯";

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => {
      const nextIsMobile = mediaQuery.matches;
      setIsMobile(nextIsMobile);
      if (nextIsMobile) setIsSeatPanelCollapsed(false);
    };
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const seatMap = seatMapRef.current;
      if (!seatMap) return;
      seatMap.scrollLeft = Math.max(
        0,
        (seatMap.scrollWidth - seatMap.clientWidth) / 2,
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [auditorium.id, isMobilePanelOpen, mobilePanelTab]);

  const switchAuditorium = (nextAuditoriumId: string) => {
    setAuditoriumId(nextAuditoriumId);
    setSelectedSeatId(getDefaultSeatId(nextAuditoriumId));
  };

  const selectSeat = (seat: Seat) => {
    if (seat.status === "occupied") return;
    setSelectedSeatId(seat.id);
    setCameraPreset("seat");
  };

  const toggleFilmMode = () => {
    setFilmMode((current) => !current);
  };

  const togglePlayback = () => {
    const nextPlaying = !playing;
    setPlaying(nextPlaying);
    if (nextPlaying) setPlaybackToken((current) => current + 1);
  };

  const resetFreePadTimer = useCallback(() => {
    if (freePadHideTimerRef.current) {
      clearTimeout(freePadHideTimerRef.current);
    }
    freePadHideTimerRef.current = setTimeout(() => {
      setIsFreePadVisible(false);
    }, 5000);
  }, []);

  const setFreeAxis = useCallback(
    (axis: keyof FreeMoveCommand, value: boolean) => {
      setFreeMove((current) => ({ ...current, [axis]: value }));
    },
    [],
  );

  const selectCameraPreset = useCallback(
    (presetId: CameraPreset) => {
      if (presetId === "free") {
        if (cameraPreset === "free") {
          // 再次点击自由视角：切换方向键显示/隐藏
          setIsFreePadVisible((visible) => !visible);
          if (freePadHideTimerRef.current) {
            clearTimeout(freePadHideTimerRef.current);
            freePadHideTimerRef.current = null;
          }
          if (!isFreePadVisible) {
            resetFreePadTimer();
          }
          return;
        }
        setCameraPreset("free");
        setIsFreePadVisible(true);
        resetFreePadTimer();
      } else {
        setCameraPreset(presetId);
        setIsFreePadVisible(false);
        setFreeMove({
          forward: false,
          back: false,
          left: false,
          right: false,
          up: false,
          down: false,
        });
      }
    },
    [cameraPreset, isFreePadVisible, resetFreePadTimer],
  );

  const showMobilePanelTab = (tab: MobilePanelTab) => {
    setMobilePanelTab(tab);
    setIsMobilePanelOpen(true);
  };

  const handleCustomScreenChange = (nextConfig: CustomScreenConfig) => {
    setCustomScreen(nextConfig);
    if (nextConfig.enabled) {
      setIsCustomMode(true);
    }
  };

  return (
    <main className="cinema-app" data-dbd-zone="cinema-shell">
      <header className="topbar" data-dbd-zone="cinema-topbar">
        <Link
          className="back-to-cinemas"
          href="/"
          aria-label={`返回影院列表，当前影院：${cinema.city} ${cinema.name}`}
        >
          <ArrowLeft size={20} />
          <strong>
            {cinema.city} · {cinema.name}
          </strong>
        </Link>

        <div className="flex items-center gap-2">
          {!isFullscreen && (
            <div className="topbar-custom-screen-wrap">
              <ScreenCustomizerControl
                config={customScreen}
                onChange={handleCustomScreenChange}
                variant="topbar"
                defaultWidth={rawAuditorium.screenWidth}
                defaultHeight={rawAuditorium.screenHeight}
              />
            </div>
          )}
          <SceneStylePicker
            currentStyle={sceneStyle}
            onSelectStyle={handleSelectSceneStyle}
            variant="topbar"
          />
        </div>
      </header>

      <section
        className={`experience-layout ${
          isSeatPanelCollapsed ? "is-panel-collapsed" : ""
        } ${isLandscapeMode ? "is-landscape-mode" : ""} ${
          isFullscreen ? "is-fullscreen" : ""
        }`}
        data-dbd-zone="cinema-workspace"
      >
        <div
          className="scene-shell"
          data-dbd-zone="cinema-scene"
          onClick={() => setIsControlsVisible((prev) => !prev)}
        >
          {isFullscreen && (
            <div className="fullscreen-top-status-bar">
              <div className="fullscreen-status-left">
                <span className="fullscreen-device-time">{deviceTimeStr}</span>
              </div>
              <div className="fullscreen-status-right">
                <div className="fullscreen-video-time" title="播放进度">
                  <span className="time-played">{formatTime(currentTime)}</span>
                  <span className="time-divider"> / </span>
                  <span className="time-total">{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Floating Camera Perspective Toolbar */}
          <div
            className="camera-perspective-toolbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="perspective-title-badge">
              <Camera size={14} className="text-amber-400" />
              <span>影厅视角漫游：</span>
              <span className="current-preset-name">
                {CAMERA_PRESETS.find((p) => p.id === cameraPreset)?.name || "观影座位"}
              </span>
            </div>
            <div className="perspective-buttons-list">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`perspective-btn ${
                    cameraPreset === preset.id ? "is-active" : ""
                  }`}
                  onClick={() => selectCameraPreset(preset.id)}
                  title={`${preset.name} - ${preset.desc}`}
                >
                  <span className="perspective-icon">{preset.icon}</span>
                  <span className="perspective-label">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {isMounted ? (
            <CinemaScene
              auditorium={auditorium}
              seats={seats}
              selectedSeat={selectedSeat}
              filmMode={filmMode}
              cameraPreset={cameraPreset}
              freeMove={freeMove}
              sceneStyle={sceneStyle}
              playing={playing}
              playbackToken={playbackToken}
              viewCommand={idleViewCommand}
              isMobile={isMobile}
              videoSrc={videoSrc}
              playbackRate={playbackRate}
              fitMode={fitMode}
              audioMode={audioMode}
              volume={isMuted ? 0 : volume}
              seekTime={seekTime}
              skipTailSeconds={skipTailSeconds}
              onTimeUpdate={handleTimeUpdate}
            />
          ) : (
            <div className="scene-loading" role="status" aria-live="polite">
              <div className="scene-loading-screen" />
              <span>正在搭建影厅</span>
            </div>
          )}

          {/* Auto-Hiding Navigation Bar & Video Control HUD */}
          <div
            className={`hud-container ${isControlsVisible ? "is-visible" : ""}`}
            onClick={(e) => e.stopPropagation()}
            onMouseMove={resetControlsTimer}
          >
            <div className="hud-top-row">
              <div className="hud-video-info">
                <FilmStrip size={18} weight="fill" />
                <span>{videoTitle}</span>
              </div>
              <div className="hud-actions-group">
                <label className="hud-btn-file-upload">
                  <Upload size={14} />
                  <span>选择本地视频</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileUpload}
                  />
                </label>
                <button
                  type="button"
                  className="hud-btn-file-upload"
                  onClick={() => {
                    toggleFullscreen();
                    resetControlsTimer();
                  }}
                  title={isFullscreen ? "退出全屏观影" : "全屏沉浸观影"}
                >
                  {isFullscreen ? (
                    <CornersIn size={14} />
                  ) : (
                    <CornersOut size={14} />
                  )}
                  <span>{isFullscreen ? "退出全屏" : "全屏观影"}</span>
                </button>
                <button
                  type="button"
                  className="hud-btn-file-upload"
                  onClick={() => {
                    setIsLandscapeMode((prev) => !prev);
                    resetControlsTimer();
                  }}
                  title="切换手机横屏 / 满屏视界"
                >
                  {isLandscapeMode ? (
                    <ArrowsIn size={14} />
                  ) : (
                    <ArrowsOut size={14} />
                  )}
                  <span>{isLandscapeMode ? "退出横屏" : "手机横屏"}</span>
                </button>
              </div>
            </div>

            <div className="hud-timeline-row gold-white-timeline">
              <span className="timeline-time-num time-current">{formatTime(currentTime)}</span>
              <div className="hud-slider-wrapper">
                <input
                  type="range"
                  className="hud-slider gold-white-slider"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  style={{
                    background: `linear-gradient(to right, #FFD700 0%, #E2B857 ${
                      ((currentTime / (duration || 1)) * 100).toFixed(2)
                    }%, rgba(255, 255, 255, 0.25) ${
                      ((currentTime / (duration || 1)) * 100).toFixed(2)
                    }%, rgba(255, 255, 255, 0.25) 100%)`,
                  }}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSeekTime(val);
                    setCurrentTime(val);
                    resetControlsTimer();
                  }}
                />
              </div>
              <span className="timeline-time-num time-duration">{formatTime(duration)}</span>
            </div>

            <div className="hud-controls-row">
              <div className="hud-main-playback">
                <button
                  type="button"
                  className="hud-icon-btn"
                  onClick={() => {
                    const target = Math.max(0, currentTime - 30);
                    setSeekTime(target);
                    setCurrentTime(target);
                    resetControlsTimer();
                  }}
                  title="快退 30 秒"
                >
                  <Rewind size={18} weight="fill" />
                </button>

                <button
                  type="button"
                  className="hud-icon-btn primary"
                  onClick={() => {
                    togglePlayback();
                    resetControlsTimer();
                  }}
                  title={playing ? "暂停" : "播放"}
                >
                  {playing ? (
                    <Pause size={20} weight="fill" />
                  ) : (
                    <Play size={20} weight="fill" />
                  )}
                </button>

                <button
                  type="button"
                  className="hud-icon-btn"
                  onClick={() => {
                    const target = Math.min(duration, currentTime + 30);
                    setSeekTime(target);
                    setCurrentTime(target);
                    resetControlsTimer();
                  }}
                  title="快进 30 秒"
                >
                  <FastForward size={18} weight="fill" />
                </button>
              </div>

              {/* 0-200% Volume Control with Web Audio Compressor */}
              <div className="hud-volume-control">
                <button
                  type="button"
                  className="hud-pill-btn px-1 text-white"
                  onClick={toggleMute}
                  title={isMuted ? "取消静音" : "静音"}
                >
                  {isMuted || volume === 0 ? (
                    <SpeakerSlash size={14} className="text-red-400 inline mr-1" />
                  ) : volume > 1.0 ? (
                    <SpeakerHigh size={14} className="text-amber-400 inline mr-1" />
                  ) : (
                    <SpeakerLow size={14} className="inline mr-1" />
                  )}
                </button>
                <input
                  type="range"
                  className="hud-volume-slider"
                  min={0}
                  max={2}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    if (val > 0 && isMuted) setIsMuted(false);
                    resetControlsTimer();
                  }}
                />
                <span className="hud-volume-val">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
                {volume > 1.0 && !isMuted && (
                  <span className="hud-boost-badge" title="Web Audio API 增益压限防护">
                    2x 防爆音
                  </span>
                )}
              </div>

              <div className="hud-pills-group">
                <span className="hud-pill-label">灯光:</span>
                <button
                  type="button"
                  className={`hud-pill-btn ${!filmMode ? "is-active" : ""}`}
                  onClick={() => {
                    setFilmMode(false);
                    resetControlsTimer();
                  }}
                  title="影院开灯"
                >
                  <Lightbulb size={12} weight="fill" className="inline mr-1" />
                  开灯
                </button>
                <button
                  type="button"
                  className={`hud-pill-btn ${filmMode ? "is-active" : ""}`}
                  onClick={() => {
                    setFilmMode(true);
                    resetControlsTimer();
                  }}
                  title="影院关灯"
                >
                  <Lightbulb size={12} weight="regular" className="inline mr-1" />
                  关灯
                </button>
              </div>

              <div className="hud-pills-group">
                <span className="hud-pill-label">画面尺寸:</span>
                {[
                  { id: "fit_screen", label: "符合银幕尺寸" },
                  { id: "original", label: "原始视频尺寸" },
                  { id: "16_9", label: "16比9" },
                  { id: "4_3", label: "4比3" },
                  { id: "9_16", label: "9比16" },
                  { id: "16_10", label: "16比10" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`hud-pill-btn ${
                      fitMode === mode.id ? "is-active" : ""
                    }`}
                    onClick={() => {
                      setFitMode(mode.id as FitMode);
                      resetControlsTimer();
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="hud-pills-group">
                <span className="hud-pill-label">倍速:</span>
                {[0.1, 0.5, 1.0, 1.5, 2.0, 5.0].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`hud-pill-btn ${
                      playbackRate === rate ? "is-active" : ""
                    }`}
                    onClick={() => {
                      setPlaybackRate(rate);
                      resetControlsTimer();
                    }}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              <div className="hud-pills-group flex items-center">
                <span className="hud-pill-label">跳过片尾:</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/50 rounded-full border border-white/20">
                  <input
                    type="number"
                    min={0}
                    max={600}
                    step={0.1}
                    value={skipTailSeconds === 0 ? "" : skipTailSeconds}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      const newSec = isNaN(val) || val < 0 ? 0 : Math.round(val * 10) / 10;
                      handleSetSkipTail(newSec);
                      resetControlsTimer();
                    }}
                    placeholder="0"
                    className="w-12 bg-transparent text-center font-mono text-xs font-bold text-amber-400 outline-none border-b border-amber-500/50 focus:border-amber-400"
                    title="支持小数点后一位(例如 1.3, 35.6)，0为不跳过"
                  />
                  <span className="text-[11px] text-slate-300 font-medium select-none">秒</span>
                  {skipTailSeconds > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleSetSkipTail(0);
                        resetControlsTimer();
                      }}
                      className="text-[10px] text-amber-300 hover:text-white px-1.5 py-0.2 bg-amber-500/20 hover:bg-amber-500/40 rounded border border-amber-500/30 transition-all"
                      title="重置为不跳过"
                    >
                      清零
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 px-1">(不跳过)</span>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-1.5">
                  {[
                    { label: "1.3s", value: 1.3 },
                    { label: "5s", value: 5 },
                    { label: "10s", value: 10 },
                    { label: "35.6s", value: 35.6 },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`px-1.5 py-0.5 text-[10px] rounded transition-all ${
                        skipTailSeconds === item.value
                          ? "bg-amber-500 text-slate-950 font-bold"
                          : "bg-white/10 text-slate-300 hover:bg-white/20"
                      }`}
                      onClick={() => {
                        handleSetSkipTail(item.value);
                        resetControlsTimer();
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hud-pills-group">
                <span className="hud-pill-label">声音模式:</span>
                <button
                  type="button"
                  className={`hud-pill-btn ${
                    audioMode === "original" ? "is-active" : ""
                  }`}
                  onClick={() => {
                    setAudioMode("original");
                    resetControlsTimer();
                  }}
                >
                  原声
                </button>
                <button
                  type="button"
                  className={`hud-pill-btn ${
                    audioMode === "cinema_spatial" ? "is-active" : ""
                  }`}
                  onClick={() => {
                    setAudioMode("cinema_spatial");
                    resetControlsTimer();
                  }}
                >
                  影院左右声道
                </button>
              </div>
            </div>
          </div>
        </div>

        {cameraPreset === "free" && isFreePadVisible && (
          <div
            className="free-view-pads"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="free-pad-group free-pad-move">
              <span className="free-pad-caption">移动</span>
              <div className="free-pad-cross">
                <button
                  type="button"
                  data-pad-area="forward"
                  className={`free-pad-btn ${freeMove.forward ? "is-active" : ""}`}
                  aria-label="向前移动"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFreeAxis("forward", true);
                    resetFreePadTimer();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFreeAxis("forward", false);
                  }}
                  onPointerCancel={() => setFreeAxis("forward", false)}
                  onPointerLeave={() => setFreeAxis("forward", false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <CaretUp size={20} weight="bold" />
                </button>
                <button
                  type="button"
                  data-pad-area="left"
                  className={`free-pad-btn ${freeMove.left ? "is-active" : ""}`}
                  aria-label="向左移动"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFreeAxis("left", true);
                    resetFreePadTimer();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFreeAxis("left", false);
                  }}
                  onPointerCancel={() => setFreeAxis("left", false)}
                  onPointerLeave={() => setFreeAxis("left", false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <CaretLeft size={20} weight="bold" />
                </button>
                <span data-pad-area="center" className="free-pad-center" aria-hidden="true" />
                <button
                  type="button"
                  data-pad-area="right"
                  className={`free-pad-btn ${freeMove.right ? "is-active" : ""}`}
                  aria-label="向右移动"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFreeAxis("right", true);
                    resetFreePadTimer();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFreeAxis("right", false);
                  }}
                  onPointerCancel={() => setFreeAxis("right", false)}
                  onPointerLeave={() => setFreeAxis("right", false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <CaretRight size={20} weight="bold" />
                </button>
                <button
                  type="button"
                  data-pad-area="back"
                  className={`free-pad-btn ${freeMove.back ? "is-active" : ""}`}
                  aria-label="向后移动"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFreeAxis("back", true);
                    resetFreePadTimer();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFreeAxis("back", false);
                  }}
                  onPointerCancel={() => setFreeAxis("back", false)}
                  onPointerLeave={() => setFreeAxis("back", false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <CaretDown size={20} weight="bold" />
                </button>
              </div>
            </div>

            <div className="free-pad-group free-pad-height">
              <span className="free-pad-caption">升降</span>
              <div className="free-pad-cross free-pad-height-cross">
                <button
                  type="button"
                  data-pad-area="up"
                  className={`free-pad-btn ${freeMove.up ? "is-active" : ""}`}
                  aria-label="升高视角"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFreeAxis("up", true);
                    resetFreePadTimer();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFreeAxis("up", false);
                  }}
                  onPointerCancel={() => setFreeAxis("up", false)}
                  onPointerLeave={() => setFreeAxis("up", false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <CaretUp size={20} weight="bold" />
                </button>
                <span className="free-pad-center" aria-hidden="true" />
                <button
                  type="button"
                  data-pad-area="down"
                  className={`free-pad-btn ${freeMove.down ? "is-active" : ""}`}
                  aria-label="降低视角"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setFreeAxis("down", true);
                    resetFreePadTimer();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFreeAxis("down", false);
                  }}
                  onPointerCancel={() => setFreeAxis("down", false)}
                  onPointerLeave={() => setFreeAxis("down", false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <CaretDown size={20} weight="bold" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 影厅 UI 锁定小锁按钮 + 隐形点击热区已移到 main 顶层（避免重复渲染） */}

        {isMobilePanelOpen ? (
          <button
            className="mobile-sheet-dismiss-layer"
            type="button"
            aria-label="收起影厅面板"
            aria-controls="mobile-seat-panel"
            onClick={() => setIsMobilePanelOpen(false)}
          />
        ) : null}

        <aside
          className={`seat-panel ${
            isSeatPanelCollapsed ? "is-collapsed" : ""
          } ${isMobilePanelOpen ? "is-mobile-open" : ""} mobile-tab-${mobilePanelTab}`}
          aria-label="选座与体验指标"
          data-dbd-zone="cinema-seat-panel"
          data-dbd-pattern="panel-sheet"
        >
          <div
            className="mobile-sheet-header"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              setIsMobilePanelOpen((current) => !current);
            }}
          >
            <div className="mobile-sheet-tabs" role="tablist" aria-label="影厅面板">
              <button
                type="button"
                role="tab"
                aria-selected={mobilePanelTab === "seats"}
                aria-controls="mobile-seat-panel"
                className={mobilePanelTab === "seats" ? "is-selected" : ""}
                onClick={() => showMobilePanelTab("seats")}
              >
                选座
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobilePanelTab === "info"}
                aria-controls="mobile-info-panel"
                className={mobilePanelTab === "info" ? "is-selected" : ""}
                onClick={() => showMobilePanelTab("info")}
              >
                影院信息
              </button>
            </div>
            <button
              className="mobile-sheet-toggle"
              type="button"
              onClick={() => setIsMobilePanelOpen((current) => !current)}
              aria-expanded={isMobilePanelOpen}
              aria-label={isMobilePanelOpen ? "收起影厅面板" : "展开影厅面板"}
            >
              {isMobilePanelOpen ? (
                <CaretDown size={18} />
              ) : (
                <CaretUp size={18} />
              )}
            </button>
          </div>

          <button
            className="panel-collapse-toggle"
            type="button"
            onClick={() => setIsSeatPanelCollapsed((current) => !current)}
            aria-expanded={!isSeatPanelCollapsed}
            aria-label={
              isSeatPanelCollapsed
                ? "展开选座与体验指标"
                : "收起选座与体验指标"
            }
          >
            {isSeatPanelCollapsed ? (
              <CaretLeft size={18} />
            ) : (
              <CaretRight size={18} />
            )}
          </button>

          <div
            className="seat-panel-content"
            hidden={
              isSeatPanelCollapsed || (isMobile && !isMobilePanelOpen)
            }
          >
            <div
              className="panel-info-content"
              id="mobile-info-panel"
              role={isMobile ? "tabpanel" : undefined}
              hidden={isMobile && mobilePanelTab !== "info"}
            >
            <div className="auditorium-heading">
              <div className="auditorium-title-row">
                {cinemaAuditoriums.length > 1 ? (
                  <label
                    className="auditorium-title-switcher"
                    data-dbd-pattern="auditorium-switcher"
                  >
                    <select
                      aria-label="切换影厅"
                      value={auditorium.id}
                      onChange={(event) =>
                        switchAuditorium(event.target.value)
                      }
                    >
                      {cinemaAuditoriums.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <CaretDown
                      className="auditorium-title-caret"
                      size={16}
                      aria-hidden="true"
                    />
                  </label>
                ) : (
                  <h1>{auditorium.name}</h1>
                )}
                <span
                  className={`seat-layout-source-tag ${
                    auditorium.seatLayout ? "is-captured" : "is-estimated"
                  }`}
                  data-dbd-component="tag"
                  role="status"
                >
                  {auditorium.seatLayout ? "真实座位排列" : "估算座位排列"}
                </span>
              </div>
            </div>

            <section
              className="technical-summary"
              aria-label="影厅技术数据"
              data-dbd-pattern="technical-summary"
            >
              <div>
                <span className="technical-label-stack">
                  <span>银幕数据</span>
                  {auditorium.screenDataAudit ? (
                    <span
                      className={`screen-data-confidence is-${auditorium.screenDataAudit.status}`}
                      title={auditorium.screenDataAudit.note}
                      aria-label={`银幕数据可信度：${auditorium.screenDataAudit.label}。${auditorium.screenDataAudit.note}`}
                    >
                      {auditorium.screenDataAudit.label}
                    </span>
                  ) : null}
                </span>
                <strong>
                  {auditorium.screenWidth.toFixed(1)} ×{" "}
                  {auditorium.screenHeight.toFixed(1)} m
                </strong>
                <small>
                  {(auditorium.screenWidth * auditorium.screenHeight).toFixed(0)}
                  ㎡ · {auditorium.screenAspect}
                </small>
              </div>
              <div>
                <span>放映技术</span>
                <strong>{auditorium.projectionTechnology}</strong>
                <small>{auditorium.projectionDetails.join(" / ")}</small>
              </div>
              <div className="screen-surface-spec">
                <span>幕面光学模型</span>
                <strong>{auditorium.screenSurface.name}</strong>
                <small>
                  增益 {auditorium.screenSurface.gain.toFixed(1)} / 半增益角{" "}
                  {auditorium.screenSurface.halfGainAngle}° / 数字微孔{" "}
                  {auditorium.screenSurface.perforationMm.toFixed(1)} mm
                </small>
              </div>
            </section>
            </div>

            <div
              className="panel-seat-content"
              id="mobile-seat-panel"
              role={isMobile ? "tabpanel" : undefined}
              hidden={isMobile && mobilePanelTab !== "seats"}
            >
            <div className="screen-key">
              <span>银幕</span>
              <small>{auditorium.screenAspect}</small>
            </div>

            <div
              ref={seatMapRef}
              className={[
                "seat-map",
                auditorium.rowCount >= 19
                  ? "is-ultra-dense"
                  : auditorium.rowCount >= 15
                    ? "is-dense"
                    : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="group"
              aria-label="座位图"
            >
              {Array.from({ length: auditorium.rowCount }, (_, row) => {
                const rowSeats = seats.filter((seat) => seat.row === row);
                return (
                  <div className="seat-row" key={row}>
                    <span className="row-label">{rowSeats[0]?.rowLabel}</span>
                    <div
                      className={`seat-row-buttons ${
                        auditorium.seatLayout ? "has-captured-layout" : ""
                      }`}
                      style={
                        auditorium.seatLayout
                          ? ({
                              gridTemplateColumns: `repeat(${auditorium.seatLayout.gridColumns}, 9px)`,
                              minWidth: `${
                                auditorium.seatLayout.gridColumns * 12
                              }px`,
                            } satisfies CSSProperties)
                          : undefined
                      }
                    >
                      {rowSeats.map((seat, index) => (
                        <button
                          type="button"
                          key={seat.id}
                          className={[
                            "seat-button",
                            seat.id === selectedSeat.id ? "is-selected" : "",
                            seat.status === "occupied" ? "is-occupied" : "",
                            !auditorium.seatLayout &&
                            index === rowSeats.length / 2
                              ? "after-aisle"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={
                            auditorium.seatLayout
                              ? { gridColumn: seat.gridSlot }
                              : undefined
                          }
                          onClick={() => selectSeat(seat)}
                          disabled={seat.status === "occupied"}
                          aria-label={`${seat.rowLabel} 排 ${seat.number} 座${
                            seat.status === "occupied" ? "，不可选" : ""
                          }`}
                          aria-pressed={seat.id === selectedSeat.id}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="seat-legend" aria-label="图例">
              <span>
                <i className="legend-available" /> 可选
              </span>
              <span>
                <i className="legend-selected" /> 当前
              </span>
              <span>
                <i className="legend-occupied" /> 不可选
              </span>
            </div>

            <section
              className="seat-reading"
              data-dbd-pattern="seat-metrics"
            >
              <div className="reading-title">
                <span>
                  {selectedSeat.rowLabel} 排 {selectedSeat.number} 座
                </span>
                <strong>{metrics.verdict}</strong>
              </div>
              <dl>
                <div>
                  <dt>水平视角</dt>
                  <dd>{metrics.horizontalFov.toFixed(0)}°</dd>
                </div>
                <div>
                  <dt>仰角</dt>
                  <dd>{metrics.verticalAngle.toFixed(0)}°</dd>
                </div>
                <div>
                  <dt>距银幕</dt>
                  <dd>{metrics.distance.toFixed(1)} m</dd>
                </div>
              </dl>
            </section>
            </div>

            <p
              className="data-note panel-info-note"
              hidden={isMobile && mobilePanelTab !== "info"}
              title={`模型说明：${auditorium.sourceNote}。指标为几何估算。`}
            >
              模型说明：{auditorium.sourceNote}。指标为几何估算。
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
