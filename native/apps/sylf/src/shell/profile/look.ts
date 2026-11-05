// How a person's chosen cosmetics look on Native. The server stores catalog ids (a frame, a title, a name colour); the web draws them with CSS classes, which
// Native cannot use, so each id maps to a plain colour here. An id this table does not know falls back to the standard look rather than guessing.
export interface Look { nameColour: string | null; frameColour: string | null; title: string | null }

const NAME_COLOURS: Record<string, string> = { color_cyan: "#22D3EE", color_purple: "#A78BFA", color_gold: "#FACC15", color_red: "#F87171", color_green: "#34D399" };
const FRAME_COLOURS: Record<string, string> = { frame_iron: "#9CA3AF", frame_gold: "#FACC15", frame_silver: "#CBD5E1", frame_emerald: "#34D399", frame_crimson: "#F87171" };
const TITLES: Record<string, string> = { title_novice: "Novice", title_scholar: "Scholar", title_hunter: "Hunter" };

const isDefault = (value?: string | null) => !value || /^(none|default|frame_default|color_default)$/i.test(value);

export function lookOf(profile: { activeNameColor?: string | null; activeFrame?: string | null; activeTitle?: string | null }): Look {
  const title = profile.activeTitle;
  return {
    nameColour: isDefault(profile.activeNameColor) ? null : NAME_COLOURS[profile.activeNameColor!] ?? null,
    frameColour: isDefault(profile.activeFrame) ? null : FRAME_COLOURS[profile.activeFrame!] ?? null,
    // The server sends the title's own words ("Novice") for some accounts and an id for others.
    title: isDefault(title) ? null : TITLES[title!] ?? (/^title_/.test(title!) ? null : title ?? null),
  };
}
