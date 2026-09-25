import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules\/(three|@react-three)/ },
            { name: 'gsap', test: /node_modules\/gsap/ },
          ],
        },
      },
    },
  },
})
