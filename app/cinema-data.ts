export interface SeatPosition {
  id: string;
  row: string;
  col: number;
  label: string;
  pos: [number, number, number]; // [x, y, z] camera offset relative to seat center
  lookAt: [number, number, number]; // [x, y, z] target
  fov: number;
  isVip?: boolean;
}

export interface Auditorium {
  id: string;
  name: string;
  englishName: string;
  category: "featured" | "giant" | "dolby" | "imax" | "cinity" | "vip";
  screenWidth: number; // meters
  screenHeight: number; // meters
  aspectRatioText: string;
  soundSystem: string;
  projector: string;
  seatsCount: number;
  description: string;
  tags: string[];
  seats: SeatPosition[];
  defaultSeatId: string;
  ambientColor: string; // Hex color string for ambient/wall theme
  accentColor: string;
  woodTheme?: boolean;
}

export const AUDITORIUMS: Auditorium[] = [
  {
    id: "japandi_wood",
    name: "日系原木私影",
    englishName: "Japandi Warm Wood Cinema",
    category: "featured",
    screenWidth: 11.5,
    screenHeight: 5.2,
    aspectRatioText: "2.21 : 1",
    soundSystem: "Dolby Atmos 7.1.4 建筑隐藏式杜比全景声",
    projector: "Barco 4K 激光影院级投射系统",
    seatsCount: 12,
    description:
      "1:1 完美复刻极简日系与北欧原木风精品私影。包含重型木梁天花、上射暖光筒灯、胡桃木抬高地台与嵌入式阶梯LED灯带、橄榄绿皮革意式沙发及羊绒搭毯、发光银幕与木质边柜。",
    tags: ["实木天花横梁", "意式绿皮革沙发", "地台发光阶梯", "2700K 暖光氛围", "精品私影"],
    woodTheme: true,
    ambientColor: "#221a14",
    accentColor: "#e6ad65",
    defaultSeatId: "B2",
    seats: [
      {
        id: "A1",
        row: "A",
        col: "1",
        label: "前排左侧 A-1",
        pos: [-2.2, 1.25, 3.8],
        lookAt: [0, 1.6, -5.5],
        fov: 65,
      },
      {
        id: "A2",
        row: "A",
        col: "2",
        label: "前排中央 A-2",
        pos: [0, 1.25, 3.8],
        lookAt: [0, 1.6, -5.5],
        fov: 65,
      },
      {
        id: "A3",
        row: "A",
        col: "3",
        label: "前排右侧 A-3",
        pos: [2.2, 1.25, 3.8],
        lookAt: [0, 1.6, -5.5],
        fov: 65,
      },
      {
        id: "B1",
        row: "B",
        col: "1",
        label: "中排左侧 B-1",
        pos: [-2.5, 1.75, 6.2],
        lookAt: [0, 1.8, -5.5],
        fov: 58,
      },
      {
        id: "B2",
        row: "B",
        col: "2",
        label: "皇帝位中排 B-2 (最佳视野)",
        pos: [0.3, 1.75, 6.2],
        lookAt: [0, 1.8, -5.5],
        fov: 58,
        isVip: true,
      },
      {
        id: "B3",
        row: "B",
        col: "3",
        label: "中排右侧 B-3",
        pos: [2.5, 1.75, 6.2],
        lookAt: [0, 1.8, -5.5],
        fov: 58,
      },
      {
        id: "C1",
        row: "C",
        col: "1",
        label: "后排地台 C-1",
        pos: [-2.5, 2.25, 8.8],
        lookAt: [0, 2.0, -5.5],
        fov: 52,
      },
      {
        id: "C2",
        row: "C",
        col: "2",
        label: "后排地台 C-2",
        pos: [0.3, 2.25, 8.8],
        lookAt: [0, 2.0, -5.5],
        fov: 52,
        isVip: true,
      },
      {
        id: "C3",
        row: "C",
        col: "3",
        label: "后排右侧 C-3",
        pos: [2.5, 2.25, 8.8],
        lookAt: [0, 2.0, -5.5],
        fov: 52,
      },
    ],
  },
  {
    id: "shanghai_sho_1",
    name: "上海影城 SHO 1号厅",
    englishName: "Shanghai Film Art Center Hall 1 (Master Screen)",
    category: "giant",
    screenWidth: 22.4,
    screenHeight: 12.5,
    aspectRatioText: "1.79 : 1",
    soundSystem: "Dolby Atmos 杜比全景声 44声道",
    projector: "Christie 4K RGB 6P 激光双机",
    seatsCount: 1058,
    description: "亚洲顶级千人巨幕剧院，配备杜比全景声与高透光金金属巨幕，视线包围感极强。",
    tags: ["千人巨幕", "杜比全景声", "高帧率支持", "旗舰影城"],
    ambientColor: "#11141e",
    accentColor: "#3b82f6",
    defaultSeatId: "H15",
    seats: [
      {
        id: "E15",
        row: "E",
        col: "15",
        label: "前排视角 E-15",
        pos: [0, 1.8, 8.5],
        lookAt: [0, 3.5, -8],
        fov: 72,
      },
      {
        id: "H15",
        row: "H",
        col: "15",
        label: "黄金皇帝位 H-15",
        pos: [0, 3.2, 14.2],
        lookAt: [0, 4.0, -8],
        fov: 62,
        isVip: true,
      },
      {
        id: "L15",
        row: "L",
        col: "15",
        label: "全景中后排 L-15",
        pos: [0, 4.8, 20.0],
        lookAt: [0, 4.2, -8],
        fov: 54,
      },
    ],
  },
  {
    id: "dolby_cinema",
    name: "杜比影院 Dolby Cinema",
    englishName: "Dolby Cinema Experience",
    category: "dolby",
    screenWidth: 18.8,
    screenHeight: 10.2,
    aspectRatioText: "1.84 : 1",
    soundSystem: "Dolby Atmos 阵列式全景音响",
    projector: "Dolby Vision 双激光 HDR 投射系统",
    seatsCount: 380,
    description: "黑黑黑的极致对比度与蚕茧式动态吸音墙面，蚕丝黑吸光皮革座椅。",
    tags: ["Dolby Vision", "Dolby Atmos", "百万对比度", "吸光黑色内饰"],
    ambientColor: "#08090d",
    accentColor: "#00d2ff",
    defaultSeatId: "F12",
    seats: [
      {
        id: "D12",
        row: "D",
        col: "12",
        label: "前排中心 D-12",
        pos: [0, 2.0, 9.0],
        lookAt: [0, 3.2, -7],
        fov: 68,
      },
      {
        id: "F12",
        row: "F",
        col: "12",
        label: "黄金皇帝位 F-12",
        pos: [0, 3.0, 13.5],
        lookAt: [0, 3.5, -7],
        fov: 59,
        isVip: true,
      },
      {
        id: "J12",
        row: "J",
        col: "12",
        label: "后排统览 J-12",
        pos: [0, 4.2, 18.0],
        lookAt: [0, 3.5, -7],
        fov: 52,
      },
    ],
  },
  {
    id: "imax_laser",
    name: "IMAX 商业激光厅",
    englishName: "Commercial Laser IMAX Theater",
    category: "imax",
    screenWidth: 25.8,
    screenHeight: 14.2,
    aspectRatioText: "1.82 : 1",
    soundSystem: "IMAX 12.1 声道源声系统",
    projector: "IMAX Commercial Laser 4K",
    seatsCount: 420,
    description: "标志性通天银幕与坡度倾斜座椅，配合 IMAX 专属 12.1 极佳沉浸音质。",
    tags: ["IMAX 12.1声道", "坡度大视角", "巨幅通天幕"],
    ambientColor: "#0a0c10",
    accentColor: "#2563eb",
    defaultSeatId: "G14",
    seats: [
      {
        id: "D14",
        row: "D",
        col: "14",
        label: "前排包围 D-14",
        pos: [0, 2.2, 10.0],
        lookAt: [0, 4.2, -8],
        fov: 70,
      },
      {
        id: "G14",
        row: "G",
        col: "14",
        label: "黄金视角 G-14",
        pos: [0, 3.6, 15.5],
        lookAt: [0, 4.5, -8],
        fov: 60,
        isVip: true,
      },
      {
        id: "K14",
        row: "K",
        col: "14",
        label: "后排看全景 K-14",
        pos: [0, 5.0, 21.0],
        lookAt: [0, 4.5, -8],
        fov: 52,
      },
    ],
  },
];
