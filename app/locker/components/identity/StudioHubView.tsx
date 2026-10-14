"use client";
import Image from 'next/image';
import { ArrowRight, Pencil, SlidersHorizontal, User } from 'lucide-react';
import type { UserStats } from '@/app/components/AuthProvider';
import type { CharacterConfig } from '@/lib/character-traits';
import { usePixelCreations } from '@/lib/pixel-creations-client';
import { PixelCompanion } from '@/app/components/companion/PixelCompanion';
import styles from './StudioHubView.module.css';
interface StudioHubViewProps {
 user: UserStats; characterConfig: CharacterConfig; bannerUrl: string; avatarUrl: string; bio: string;
 connectedAccounts?: Record<string, string | null>; activeCosmetics: Record<string, string>; socialLinks?: Record<string, string>;
 onNavigate: (view: 'pixel-customizer' | 'pixel-studio' | 'profile-studio', creationId?: string) => void;
 onPreviewProfile: () => void; hasUnsavedChanges: boolean; onSaveAll: () => void; saving: boolean;
}
export function StudioHubView({ user, characterConfig, bannerUrl, avatarUrl, bio, activeCosmetics, onNavigate, onPreviewProfile, hasUnsavedChanges, onSaveAll, saving }: StudioHubViewProps) {
 const library = usePixelCreations(user.id), selected = library.creations.find(item => item.data.id === characterConfig.outfit);
 return <section className={styles.root} aria-label="Studio Hub">
  <div className={styles.layout}><article className={styles.companion}><div className={styles.stage}><PixelCompanion emptyState={{ onCreate: () => onNavigate('pixel-studio') }} config={characterConfig} creation={selected?.data} revision={selected?.revision} label="Hub companion" /></div><div className={styles.details}><span className={styles.eyebrow}>{selected ? 'ARTWORK · EQUIPPED' : 'YOUR ARTWORK'}</span><h3>{selected?.name ?? 'Your next creation'}</h3><p>{selected ? 'Make your artwork feel at home. Adjust its display or keep creating.' : 'Draw a character, animate a scene, or make something entirely yours.'}</p>{selected && <button className={styles.primary} onClick={() => onNavigate('pixel-customizer')}><SlidersHorizontal size={17} />Customize<ArrowRight size={15} /></button>}<button className={styles.button} onClick={() => onNavigate('pixel-studio', selected?.data.id)}><Pencil size={17} />{selected ? 'Edit drawing' : 'Create artwork'}</button>{library.error && <p role="alert">{library.error}<button onClick={library.retry}>Retry</button></p>}{library.loading && <p role="status">Refreshing drawings…</p>}</div></article>
  <article className={styles.profile}>{bannerUrl && <div className={styles.banner}><Image src={bannerUrl} alt="Your profile banner" width={500} height={180} unoptimized /></div>}<div className={styles.profileBody}><div className={styles.profileIdentity}>{avatarUrl ? <Image src={avatarUrl} alt="Your profile photo" width={64} height={64} unoptimized /> : <span className={styles.avatar}><User size={26} /></span>}<div><h3>{user.name ?? user.username}</h3><span>{activeCosmetics.activeTitle ?? user.activeTitle ?? 'Scholar'}</span></div></div><p>{bio || 'Your photo, banner, bio and social connections.'}</p><button className={styles.button} onClick={() => onNavigate('profile-studio')}>Profile Studio<ArrowRight size={16} /></button><button className={styles.button} onClick={onPreviewProfile}>Preview profile</button></div></article></div>
  {hasUnsavedChanges && <div className={styles.pending}><span>Your identity has unsaved changes.</span><button className={styles.primary} onClick={onSaveAll} disabled={saving}>{saving ? 'Saving…' : 'Save identity changes'}</button></div>}
 </section>;
}
