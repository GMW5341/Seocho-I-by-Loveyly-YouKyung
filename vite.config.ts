import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/Seocho-I-by-Loveyly-YouKyung/',
  plugins: [react(), tailwindcss()],
})
