import { NotePencilIcon } from '@phosphor-icons/react'
import type { HighlightColor } from '../db'
import { COLORS, COLOR_ORDER } from './core'
import styles from '../App.module.css'

// Above the selection; below it on touch, clear of the native selection callout, unless there is no room.
export default function Toolbar({ rect,touch,onColor,onNote }: { rect: DOMRect; touch: boolean; onColor: (c: HighlightColor) => void; onNote: () => void }) {
  const below = touch ? rect.bottom + 130 < innerHeight : rect.top < 130   // 130: header or footer plus the toolbar
  return <div role="toolbar" aria-label="Highlight" className={styles.toolbar} onPointerDown={e => e.preventDefault()} style={{
    left:Math.min(innerWidth - 150,Math.max(150,rect.left + rect.width / 2)),
    top:below ? Math.min(innerHeight - 124,rect.bottom + 10) : Math.max(120,rect.top - 10),transform:`translate(-50%,${below ? 0 : '-100%'})` }}>
    {COLOR_ORDER.map(c => <button key={c} aria-label={'Highlight ' + c + ', ' + COLORS[c].label} title={COLORS[c].label} onClick={() => onColor(c)}>
      <i style={{ background:COLORS[c].fill }}/></button>)}
    <button className={styles.ghost} onClick={onNote}><NotePencilIcon size={18} aria-hidden="true"/>Add note</button>
  </div>
}
