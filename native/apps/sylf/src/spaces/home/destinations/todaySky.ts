// Which of the World's six skies Home looks at, from the clock, and which glyph the greeting carries. World lets someone pin a sky in Preparations; Home
// follows the hour, because the dashboard should feel like the time it is. Pure, so it is tested without a screen.
import { resolveSky, type WorldSky } from "@sylf/spaces";

export const skyAt = (hour: number): WorldSky => resolveSky("auto", hour);
export const glyphFor = (sky: WorldSky): "sun" | "moon" => (sky === "dusk" || sky === "night" ? "moon" : "sun");
