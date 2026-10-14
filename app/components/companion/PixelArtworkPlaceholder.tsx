"use client";

import Link from 'next/link';
import { ArrowUpRight, Pencil } from 'lucide-react';
import styles from './PixelArtworkPlaceholder.module.css';

export interface PixelArtworkPlaceholderProps {
  own?: boolean;
  onCreate?: () => void;
  status?: string;
}

/** Empty artwork belongs to the surface, never to the drawing renderer. */
export function PixelArtworkPlaceholder({ own = false, onCreate, status }: PixelArtworkPlaceholderProps) {
  const action = <><Pencil size={14} /><span>Create<span className={styles.actionSuffix}> artwork</span></span><ArrowUpRight className={styles.arrow} size={14} /></>;
  return <div className={styles.root} role={status ? 'status' : own ? 'group' : 'img'} data-artwork-empty data-own={own} aria-label={status ?? (own ? 'Create your own pixel artwork' : 'No artwork')}>
    <div className={styles.canvas} aria-hidden="true"><span className={styles.corner} /><Pencil /><span className={styles.pixel} /></div>
    <strong>{status ?? (own ? 'Your canvas awaits' : 'No artwork')}</strong>
    {own && !status && <><p>A character, a scene.<br />Something entirely yours.</p>{onCreate ? <button className={styles.action} onClick={onCreate} aria-label="Create artwork in Pixel Studio">{action}</button> : <Link className={styles.action} href="/locker?tab=identity&view=pixel-studio" aria-label="Create artwork in Pixel Studio">{action}</Link>}</>}
  </div>;
}
