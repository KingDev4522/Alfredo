/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Landing theme tokens (ported from signspeak-landing @theme — v4 → v3).
      colors: {
        obsidian: "#070709",
        "amber-glow": "#f59e0b",
        bronze: "#d97706",
        "amber-bright": "#ffb703",
        "bio-cyan": "#2dd4bf",
        void: "#000000",
        crimson: "#c5003c",
        "deep-crimson": "#880425",
        electric: "#f3e600",
        aqua: "#55ead4",
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter Tight"', "system-ui", "sans-serif"],
        "serif-aesthetic": ['"Cormorant Garamond"', "Georgia", "serif"],
        "mono-tech": ['"JetBrains Mono"', "ui-monospace", '"SF Mono"', "monospace"],
      },
    },
  },
  plugins: [],
}

