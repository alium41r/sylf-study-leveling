import { SylvAnchor, SylvAnchorKey } from "./types";

export const SYLV_CANVAS_WIDTH = 400;
export const SYLV_CANVAS_HEIGHT = 600;
export const SYLV_VIEWBOX = `0 0 ${SYLV_CANVAS_WIDTH} ${SYLV_CANVAS_HEIGHT}`;

/**
 * Canonical Anchor Registry for Sylvs.
 * Both Male and Female bases MUST align precisely with these coordinates.
 * Future assets (horns, wings, clothing, accessories, marks) attach to these points.
 */
export const SYLV_ANCHORS: Record<SylvAnchorKey, SylvAnchor> = {
  HEAD: {
    key: "HEAD",
    name: "Head Center",
    point: { x: 200, y: 150 },
    description: "Cranial sphere center, used for headwear, hair origin, and head tracking",
  },
  FACE: {
    key: "FACE",
    name: "Face Center",
    point: { x: 200, y: 200 },
    description: "Facial midpoint between eyes, used for nose/mouth/face markings",
  },
  LEFT_EYE: {
    key: "LEFT_EYE",
    name: "Left Eye",
    point: { x: 146, y: 200 },
    description: "Viewer-left eye center position",
  },
  RIGHT_EYE: {
    key: "RIGHT_EYE",
    name: "Right Eye",
    point: { x: 254, y: 200 },
    description: "Viewer-right eye center position",
  },
  LEFT_EAR: {
    key: "LEFT_EAR",
    name: "Left Ear Base",
    point: { x: 98, y: 181 },
    description: "Viewer-left ear nub/fin root connection",
  },
  RIGHT_EAR: {
    key: "RIGHT_EAR",
    name: "Right Ear Base",
    point: { x: 302, y: 181 },
    description: "Viewer-right ear nub/fin root connection",
  },
  BODY: {
    key: "BODY",
    name: "Body Torso Center",
    point: { x: 200, y: 308 },
    description: "Torso center mass, used for chest armor and body markings",
  },
  LEFT_ARM: {
    key: "LEFT_ARM",
    name: "Left Arm / Shoulder",
    point: { x: 148, y: 291 },
    description: "Viewer-left shoulder / limb attachment root",
  },
  RIGHT_ARM: {
    key: "RIGHT_ARM",
    name: "Right Arm / Shoulder",
    point: { x: 252, y: 291 },
    description: "Viewer-right shoulder / limb attachment root",
  },
  TAIL_ROOT: {
    key: "TAIL_ROOT",
    name: "Tail Root",
    point: { x: 200, y: 360 },
    description: "Origin where torso transitions into the floating spirit tail",
  },
  TAIL_MID: {
    key: "TAIL_MID",
    name: "Tail Mid",
    point: { x: 206, y: 459 },
    description: "Curvature inflection point of the spirit tail",
  },
  TAIL_TIP: {
    key: "TAIL_TIP",
    name: "Tail Tip",
    point: { x: 212, y: 558 },
    description: "Wispy terminus of the spirit tail, used for particle trails",
  },
  HEAD_ACCESSORY: {
    key: "HEAD_ACCESSORY",
    name: "Head Accessory",
    point: { x: 200, y: 40 },
    description: "Anchor for halos, crowns, hats, and floating celestial emblems",
  },
  CHEST_ACCESSORY: {
    key: "CHEST_ACCESSORY",
    name: "Chest Accessory",
    point: { x: 200, y: 285 },
    description: "Anchor for amulets, brooches, medallions, and neck ribbons",
  },
  FLOATING_ACCESSORY: {
    key: "FLOATING_ACCESSORY",
    name: "Floating Accessory",
    point: { x: 325, y: 215 },
    description: "Anchor for orbiting grimoires, spirit orbs, familiars, or relics",
  },
};

export const SYLV_ANCHOR_LIST = Object.values(SYLV_ANCHORS);
