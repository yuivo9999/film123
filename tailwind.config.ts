import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        wood: {
          50: '#fdf8f4',
          100: '#f7ebd8',
          200: '#edd2b3',
          300: '#e0b284',
          400: '#d38f56',
          500: '#bc6e33',
          600: '#9d5228',
          700: '#7e3e23',
          800: '#673322',
          900: '#552c1f',
        },
        warm: {
          50: '#faf8f5',
          100: '#f3efe8',
          200: '#e6ded2',
          300: '#d4c5b3',
          400: '#bfa78f',
          500: '#ab8d71',
          600: '#977558',
          700: '#7c5e46',
          800: '#664e3b',
          900: '#544132',
        }
      },
    },
  },
  plugins: [],
};

export default config;
