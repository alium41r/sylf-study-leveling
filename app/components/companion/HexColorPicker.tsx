"use client";
import { normalizeHexColor } from '@/lib/pixel-display-style';
import styles from './HexColorPicker.module.css';

/** Native spectrum plus keyboard-friendly hex entry; incomplete input stays local. */
export function HexColorPicker({ value, onChange, label, disabled = false }: { value: string; onChange: (hex: string) => void; label: string; disabled?: boolean }) {
  return <div className={styles.field} role="group" aria-label={label}>
    <label className={styles.spectrum} title={`${label}: open color spectrum`}>
      <input type="color" aria-label={`${label} spectrum`} value={value} disabled={disabled} onChange={event => onChange(event.target.value.toLowerCase())} />
    </label>
    <input className={styles.hex} aria-label={`${label} hex`} type="text" key={value} defaultValue={value} maxLength={7} spellCheck={false} autoComplete="off" disabled={disabled} onBlur={event => { const hex = normalizeHexColor(event.currentTarget.value); if (hex) onChange(hex); else event.currentTarget.value = value; }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
  </div>;
}
