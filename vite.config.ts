import { readdirSync,readFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

function pdfAssets(): Plugin {
  const assets = new Map<string,string>()
  for (const dir of ['cmaps','standard_fonts','wasm','iccs']) {
    const root = join('node_modules/pdfjs-dist',dir)
    for (const name of readdirSync(root)) assets.set('pdf-assets/' + dir + '/' + name,join(root,name))
  }
  return {
    name:'local-pdf-assets',
    configureServer(server) {
      server.middlewares.use((req,res,next) => {
        const path = assets.get((req.url || '').split('?')[0].slice(1))
        if (!path) return next()
        if (path.endsWith('.wasm')) res.setHeader('Content-Type','application/wasm')
        res.end(readFileSync(path))
      })
    },
    generateBundle() { for (const [fileName,path] of assets) this.emitFile({ type:'asset',fileName,source:readFileSync(path) }) },
  }
}
export default defineConfig({
  plugins:[react(),pdfAssets(),VitePWA({
    registerType:'prompt',
    manifest:{ id:'./', name:'ShelfScape',short_name:'ShelfScape',description:'Your personal bookshelf and reader',
      theme_color:'#eef1ec',background_color:'#eef1ec',display:'standalone',start_url:'./',scope:'./',
      icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png'}, {src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}] },
    workbox:{globPatterns:['**/*.{js,mjs,css,html,png,jpg,svg,epub,pdf,txt,wasm,bcmap,pfb,ttf,icc,woff2}'],
      maximumFileSizeToCacheInBytes:8 * 1024 * 1024,cleanupOutdatedCaches:true},
  })],
})
