"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  AUDITORIUMS,
  Auditorium,
} from "./cinema-data";
import { FitMode } from "./CinemaScene";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Lightbulb,
  Upload,
  Link as LinkIcon,
  Sparkles,
  Info,
  Armchair,
  Tv,
  Film,
  Compass,
  Sliders,
  Check,
} from "lucide-react";

// Dynamically import CinemaScene with ssr: false (Three.js WebGL canvas)
const CinemaScene = dynamic(() => import("./CinemaScene"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d0b09] text-[#e6dbcf]">
      <div className="w-12 h-12 border-4 border-[#e6ad65] border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-sm tracking-widest text-[#caa781]">正在加载 3D WebGL 影厅物理渲染引擎...</p>
    </div>
  ),
});

const DEFAULT_VIDEOS = [
  {
    name: "IMAX 4K 经典开场倒计时",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  },
  {
    name: "杜比视界 HDR 全景声演示片",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  },
  {
    name: "大自然风光 4K 极清演示",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
];

export default function CinemaExperience() {
  const [selectedAuditoriumId, setSelectedAuditoriumId] = useState<string>("japandi_wood");
  const [selectedSeatId, setSelectedSeatId] = useState<string>("B2");
  const [fitMode, setFitMode] = useState<FitMode>("fit_screen");
  const [lightsOn, setLightsOn] = useState<boolean>(true);

  // Video State
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>(DEFAULT_VIDEOS[0].url);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [customUrlInput, setCustomUrlInput] = useState<string>("");
  const [showUrlModal, setShowUrlModal] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const auditorium = AUDITORIUMS.find((a) => a.id === selectedAuditoriumId) ?? AUDITORIUMS[0];

  // Sync seat when auditorium changes
  useEffect(() => {
    setSelectedSeatId(auditorium.defaultSeatId);
  }, [selectedAuditoriumId, auditorium]);

  // Handle Video Events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("ended", handleEnded);
    };
  }, [currentVideoUrl]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      if (val === 0) setIsMuted(true);
      else setIsMuted(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCurrentVideoUrl(url);
      setIsPlaying(true);
      if (videoRef.current) {
        videoRef.current.src = url;
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleApplyCustomUrl = () => {
    if (customUrlInput.trim()) {
      setCurrentVideoUrl(customUrlInput.trim());
      setShowUrlModal(false);
      setIsPlaying(true);
      if (videoRef.current) {
        videoRef.current.src = customUrlInput.trim();
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const fitModeOptions: { id: FitMode; label: string; ratioNote: string }[] = [
    { id: "fit_screen", label: "符合银幕尺寸", ratioNote: "自动适应" },
    { id: "original", label: "原始视频尺寸", ratioNote: "原汁原味" },
    { id: "16_9", label: "16比9", ratioNote: "16 : 9" },
    { id: "4_3", label: "4比3", ratioNote: "4 : 3" },
    { id: "9_16", label: "9比16", ratioNote: "竖屏 9:16" },
    { id: "16_10", label: "16比10", ratioNote: "16 : 10" },
  ];

  return (
    <div ref={containerRef} className="w-full h-screen bg-[#0c0a08] text-[#f4eee6] flex flex-col overflow-hidden select-none">
      {/* Hidden HTML Video Element for Texture Source */}
      <video
        ref={videoRef}
        src={currentVideoUrl}
        crossOrigin="anonymous"
        playsInline
        loop
        className="hidden"
      />

      {/* Top Header Bar */}
      <header className="h-16 px-6 bg-[#161310]/90 backdrop-blur-md border-b border-[#2d261e] flex items-center justify-between z-20">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#a67c48] to-[#e6be8a] flex items-center justify-center text-[#181410] font-bold shadow-md shadow-[#a67c48]/20">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-wide text-[#f7f2eb] flex items-center gap-2">
              坐哪儿 · 3D WebGL 影厅视角模拟器
              {auditorium.woodTheme && (
                <span className="px-2 py-0.5 text-xs bg-[#2e4033] text-[#82c99b] rounded-full font-normal border border-[#43634e]/50 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> 精品实木风复刻
                </span>
              )}
            </h1>
            <p className="text-xs text-[#a6998a]">1:1 物理光照渲染 · 沉浸式座位视线与画面比例体验</p>
          </div>
        </div>

        {/* Auditorium Selection Tabs */}
        <div className="hidden lg:flex items-center space-x-2 bg-[#0e0c0a] p-1 rounded-xl border border-[#26201a]">
          {AUDITORIUMS.map((aud) => (
            <button
              key={aud.id}
              onClick={() => setSelectedAuditoriumId(aud.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                selectedAuditoriumId === aud.id
                  ? "bg-[#8c6643] text-[#ffffff] shadow-sm shadow-[#8c6643]/30"
                  : "text-[#aa9b8c] hover:text-[#f4eee6] hover:bg-[#1a1612]"
              }`}
            >
              {aud.woodTheme ? "🌟 " : ""}
              {aud.name}
            </button>
          ))}
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setLightsOn(!lightsOn)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
              lightsOn
                ? "bg-[#d9a362]/20 border-[#d9a362] text-[#fcebd2]"
                : "bg-[#1f1b17] border-[#382f28] text-[#a69889] hover:border-[#635548]"
            }`}
          >
            <Lightbulb className={`w-4 h-4 ${lightsOn ? "text-[#f5be7a] fill-[#f5be7a]" : ""}`} />
            {lightsOn ? "环境光: 已开灯" : "环境光: 观影关灯"}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-[#1f1b17] border border-[#382f28] text-[#caa781] hover:text-[#ffffff] transition-all"
            title="全屏观影"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Viewport + Floating Controls */}
      <div className="flex-1 relative overflow-hidden">
        {/* 3D Canvas Scene */}
        <CinemaScene
          auditorium={auditorium}
          selectedSeatId={selectedSeatId}
          videoRef={videoRef}
          fitMode={fitMode}
          lightsOn={lightsOn}
          isPlaying={isPlaying}
        />

        {/* Floating Top Left Info Box for Selected Auditorium */}
        <div className="absolute top-4 left-4 z-10 max-w-sm bg-[#14110e]/85 backdrop-blur-md p-4 rounded-2xl border border-[#302820] shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#caa781] font-bold">
                当前场景 (Current Auditorium)
              </span>
              <h2 className="text-lg font-bold text-[#f7f2eb] mt-0.5">{auditorium.name}</h2>
              <p className="text-xs text-[#a39483]">{auditorium.englishName}</p>
            </div>
            <span className="px-2 py-0.5 text-[11px] font-semibold bg-[#2a221b] text-[#e6be8a] rounded border border-[#4d3e31]">
              {auditorium.aspectRatioText}
            </span>
          </div>

          <p className="text-xs text-[#c2b5a5] mt-2.5 leading-relaxed line-clamp-3">
            {auditorium.description}
          </p>

          <div className="flex flex-wrap gap-1.5 mt-3">
            {auditorium.tags.map((tag, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 text-[10px] bg-[#1d1813] text-[#b8a896] rounded border border-[#332b23]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* Floating Top Right Seat Selector */}
        <div className="absolute top-4 right-4 z-10 bg-[#14110e]/85 backdrop-blur-md p-3.5 rounded-2xl border border-[#302820] shadow-2xl min-w-[240px]">
          <div className="flex items-center space-x-2 mb-2.5 border-b border-[#2b231b] pb-2">
            <Armchair className="w-4 h-4 text-[#e6be8a]" />
            <span className="text-xs font-semibold text-[#e6dbcf]">视角座位切换 (Seats)</span>
          </div>

          <div className="grid grid-cols-1 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
            {auditorium.seats.map((seat) => (
              <button
                key={seat.id}
                onClick={() => setSelectedSeatId(seat.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
                  selectedSeatId === seat.id
                    ? "bg-[#8c6643] text-[#ffffff] font-medium shadow-md shadow-[#8c6643]/30"
                    : "bg-[#1a1612] text-[#beaf9f] hover:bg-[#26201a] hover:text-[#f4eee6]"
                }`}
              >
                <span>{seat.label}</span>
                {seat.isVip && (
                  <span className="px-1.5 py-0.2 text-[9px] bg-[#ffe3bc] text-[#3d2712] rounded font-bold">
                    最佳位
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Floating Bottom Left Aspect Ratio / Fit Mode Controller */}
        <div className="absolute bottom-20 left-4 z-10 bg-[#14110e]/90 backdrop-blur-md p-3.5 rounded-2xl border border-[#302820] shadow-2xl">
          <div className="flex items-center space-x-2 mb-2 pb-1.5 border-b border-[#2b231b]">
            <Tv className="w-4 h-4 text-[#e6be8a]" />
            <span className="text-xs font-semibold text-[#f4eee6]">画面尺寸选项 (Aspect Ratio)</span>
          </div>

          <div className="flex flex-wrap gap-1.5 max-w-xs">
            {fitModeOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setFitMode(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                  fitMode === opt.id
                    ? "bg-[#8c6643] text-white shadow-sm shadow-[#8c6643]/40 border border-[#b88c60]"
                    : "bg-[#1c1814] text-[#aa9a8a] border border-[#2e261f] hover:border-[#524438] hover:text-[#f4eee6]"
                }`}
              >
                {fitMode === opt.id && <Check className="w-3 h-3 text-[#ffd5a4]" />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Playback Control Bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#0a0807] via-[#120f0c]/95 to-transparent pt-6 pb-4 px-6 border-t border-[#261f18]/80 backdrop-blur-md flex flex-col space-y-3">
          {/* Progress Slider Bar */}
          <div className="flex items-center space-x-3 w-full">
            <span className="text-xs font-mono text-[#a69888]">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1.5 bg-[#29221b] rounded-lg appearance-none cursor-pointer accent-[#e6be8a]"
            />
            <span className="text-xs font-mono text-[#a69888]">{formatTime(duration)}</span>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-3">
              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-xl bg-[#8c6643] hover:bg-[#a37952] text-white flex items-center justify-center transition-all shadow-md shadow-[#8c6643]/30"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>

              {/* Volume */}
              <button
                onClick={toggleMute}
                className="p-2 text-[#caa781] hover:text-white transition-all"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1.5 bg-[#29221b] rounded-lg appearance-none cursor-pointer accent-[#e6be8a]"
              />
            </div>

            {/* Preset Videos Dropdown & Upload Buttons */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-[#a69888] hidden sm:inline">选择演示片源:</span>
              <select
                value={currentVideoUrl}
                onChange={(e) => {
                  setCurrentVideoUrl(e.target.value);
                  setIsPlaying(true);
                  if (videoRef.current) {
                    videoRef.current.src = e.target.value;
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className="bg-[#1c1814] border border-[#362c23] text-xs text-[#e6dbcf] rounded-xl px-3 py-2 outline-none focus:border-[#8c6643]"
              >
                {DEFAULT_VIDEOS.map((v, i) => (
                  <option key={i} value={v.url}>
                    {v.name}
                  </option>
                ))}
              </select>

              {/* Local File Upload */}
              <label className="cursor-pointer px-3 py-2 bg-[#1c1814] hover:bg-[#28221c] border border-[#362c23] text-xs text-[#caa781] hover:text-white rounded-xl flex items-center gap-1.5 transition-all">
                <Upload className="w-3.5 h-3.5" />
                <span>加载本地视频</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {/* URL Input Button */}
              <button
                onClick={() => setShowUrlModal(true)}
                className="p-2 bg-[#1c1814] hover:bg-[#28221c] border border-[#362c23] text-[#caa781] hover:text-white rounded-xl transition-all"
                title="输入网络视频 URL"
              >
                <LinkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* URL Input Modal */}
      {showUrlModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181410] border border-[#382d23] p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-[#f7f2eb] mb-2 flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-[#e6be8a]" /> 加载网络视频 URL
            </h3>
            <p className="text-xs text-[#a69888] mb-4">
              请输入支持跨域 (CORS) 播放的 MP4 / WebM / M3U8 视频流地址：
            </p>
            <input
              type="text"
              placeholder="https://example.com/video.mp4"
              value={customUrlInput}
              onChange={(e) => setCustomUrlInput(e.target.value)}
              className="w-full bg-[#0c0a08] border border-[#382d23] rounded-xl px-4 py-2.5 text-sm text-[#f7f2eb] outline-none focus:border-[#8c6643] mb-4"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowUrlModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-[#241f19] text-[#caa781] hover:bg-[#302922]"
              >
                取消
              </button>
              <button
                onClick={handleApplyCustomUrl}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-[#8c6643] text-white hover:bg-[#a37952]"
              >
                确认加载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
