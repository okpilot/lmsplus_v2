import { chromium } from '@playwright/test'

const out =
  '/tmp/claude-1000/-media-sasha-T7-101-Claude-Projects-01-LMS-Plus/5750a55e-6be0-461c-92c0-0abe64ca7ae1/scratchpad/s2eval'
const pages = [
  '/app/admin/students',
  '/app/admin/dashboard',
  '/app/admin/internal-exams',
  '/app/admin/questions',
  '/app/admin/syllabus',
]
const b = await chromium.launch()
for (const scheme of ['light', 'dark'])
  for (const [w, h] of [
    [375, 812],
    [1280, 800],
  ]) {
    const ctx = await b.newContext({
      storageState:
        '/tmp/claude-1000/-media-sasha-T7-101-Claude-Projects-01-LMS-Plus/5750a55e-6be0-461c-92c0-0abe64ca7ae1/scratchpad/s2eval/admin.json',
      colorScheme: scheme,
      viewport: { width: w, height: h },
    })
    const p = await ctx.newPage()
    for (const path of pages) {
      await p.goto('http://localhost:3200' + path, { waitUntil: 'load', timeout: 180000 })
      await p.waitForTimeout(1500)
      const r = await p.evaluate(() =>
        [...document.querySelectorAll('[data-slot=badge]')].slice(0, 8).map((b) => {
          const c = getComputedStyle(b)
          return (
            b.textContent.trim().slice(0, 14) +
            ' | ' +
            c.backgroundColor +
            ' | ' +
            c.color +
            ' | bw ' +
            c.borderTopWidth +
            ' ' +
            c.borderTopColor
          )
        }),
      )
      console.log(scheme, w, p.url().replace('http://localhost:3200', ''), JSON.stringify(r))
      await p.screenshot({
        path: out + '/' + scheme + '-' + w + path.replaceAll('/', '_') + '.png',
      })
    }
    await ctx.close()
  }
await b.close()
