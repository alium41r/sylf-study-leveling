// Which of the World's six skies Home looks at, from the clock, on the dashboard. World lets someone pin a sky in Preparations; Home
// follows the hour, because the dashboard should feel like the time it is. Pure, so it is tested without a screen.
import { resolveSky, type WorldSky } from "@sylf/spaces";

export const skyAt = (hour: number): WorldSky => resolveSky("auto", hour);
