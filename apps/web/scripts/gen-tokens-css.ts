import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildTokensCss } from '../lib/design/build-tokens-css'

const out = path.resolve(__dirname, '../app/tokens.css')
writeFileSync(out, buildTokensCss())
console.log(`wrote ${out}`)
