/**
 * Sylf Asset Ingestion Architecture & Manifest Blueprint
 * 
 * Standardized 4-Layer file system layout and coordinate constraints
 * for PixelLab MCP custom asset batches and CharacterRenderer pipelines.
 * 
 * HOW TO INGEST NEW PIXEL ART BUILDS:
 * 1. Generate transparent 90x90 PNG via PixelLab MCP.
 * 2. Drop the PNG into /public/sprites/character/{layer}/:
 *    - Forms:       public/sprites/character/forms/{sku}.png
 *    - Pedestals:   public/sprites/character/pedestals/{key}.svg
 *    - Auras:       public/sprites/character/auras/{key}.svg
 *    - Relics:      public/sprites/character/relics/{sku}.png
 *    - Consumables: public/sprites/character/consumables/{sku}.png
 * 3. Add item entry into the Database / Shop Catalog with corresponding spriteLayer key.
 * 4. The CharacterRenderer and CharacterStudio automatically resolve the asset with zero code changes.
 */

export interface AssetIngestionContract {
  canvas: {
    width: 90;
    height: 90;
    aspectRatio: "1:1";
    groundAnchorY: 79;
    horizontalCenterX: 45;
    renderOffsetCorrection: "0px (Centered)";
  };
  layers: {
    layer1_pedestal: {
      zIndex: 10;
      directory: "/sprites/character/pedestals/";
      filePattern: "pedestal_{key}.svg";
      format: "SVG";
    };
    layer2_form: {
      zIndex: 20;
      directory: "/sprites/character/forms/";
      filePattern: "form_{archetype}_{tier}.png | {sku}.png";
      defaultFallback: string;
      format: string;
    };
    layer3_aura: {
      zIndex: 30;
      directory: "/sprites/character/auras/";
      filePattern: "aura_{key}.svg";
      format: "Dynamic CSS / SVG Particle";
    };
    layer4_relic: {
      zIndex: 40;
      directory: "/sprites/character/relics/";
      filePattern: "relic_{key}.png | weapon_{key}.png";
      format: "8-bit RGBA PNG (90x90)";
    };
    consumables: {
      directory: "/sprites/character/consumables/";
      filePattern: "item_{key}.png";
      format: "8-bit RGBA PNG (90x90)";
    };
  };
}

export const ASSET_INGESTION_CONTRACT: AssetIngestionContract = {
  canvas: {
    width: 90,
    height: 90,
    aspectRatio: "1:1",
    groundAnchorY: 79,
    horizontalCenterX: 45,
    renderOffsetCorrection: "0px (Centered)",
  },
  layers: {
    layer1_pedestal: {
      zIndex: 10,
      directory: "/sprites/character/pedestals/",
      filePattern: "pedestal_{key}.svg",
      format: "SVG",
    },
    layer2_form: {
      zIndex: 20,
      directory: "/sprites/character/forms/",
      filePattern: "form_{archetype}_{tier}.png | {sku}.png",
      defaultFallback: "/sprites/character/forms/form_tanjiro.png",
      format: "8-bit RGBA PNG (90x90)",
    },
    layer3_aura: {
      zIndex: 30,
      directory: "/sprites/character/auras/",
      filePattern: "aura_{key}.svg",
      format: "Dynamic CSS / SVG Particle",
    },
    layer4_relic: {
      zIndex: 40,
      directory: "/sprites/character/relics/",
      filePattern: "relic_{key}.png | weapon_{key}.png",
      format: "8-bit RGBA PNG (90x90)",
    },
    consumables: {
      directory: "/sprites/character/consumables/",
      filePattern: "item_{key}.png",
      format: "8-bit RGBA PNG (90x90)",
    },
  },
};

/**
 * Resolves full sprite asset URLs from item keys
 */
export function resolveFormUrl(formKey?: string | null): string {
  if (!formKey || formKey === "none" || formKey === "default_hunter") {
    return "/sprites/character/forms/form_tanjiro.png";
  }
  if (formKey.startsWith("/")) return formKey;
  return `/sprites/character/forms/${formKey}.png`;
}

export function resolvePedestalUrl(pedestalKey?: string | null): string {
  const key = pedestalKey || "pedestal_cyber";
  if (key.startsWith("/")) return key;
  return `/sprites/character/pedestals/${key}.svg`;
}

export function resolveRelicUrl(relicKey?: string | null): string | null {
  if (!relicKey || relicKey === "none") return null;
  if (relicKey.startsWith("/")) return relicKey;
  return `/sprites/character/relics/${relicKey}.png`;
}

export function resolveConsumableUrl(consumableKey?: string | null): string | null {
  if (!consumableKey || consumableKey === "none") return null;
  if (consumableKey.startsWith("/")) return consumableKey;
  return `/sprites/character/consumables/${consumableKey}.png`;
}
