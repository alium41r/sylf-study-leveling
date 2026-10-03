"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  Check,
  Coins,
  Headphones,
  ImageIcon,
  Layers,
  Package,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { CustomAudioContext } from "@/app/components/CustomAudioContext";
import { COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import {
  characterStyles,
  ownedInventory,
  storedProfileCosmetics,
  type CollectionItem,
  type CollectionCosmetic,
} from "@/lib/system-collection";
import { LibraryEmpty, SystemLibrary } from "../../components/SystemLibrary";
import styles from "../../components/SystemLibrary.module.css";

type Section =
  | "items"
  | "character"
  | "backgrounds"
  | "audio"
  | "profile"
  | "economy";
interface Background {
  id: number;
  name: string;
  signedUrl?: string | null;
  publicUrl?: string;
  layoutKey?: string;
}
interface Economy {
  currentBalance: number;
  totalEarned: number;
  totalSpent: number;
  totalHpLost: number;
  currentHp: number;
  maxHp: number;
}
interface Data {
  inventory: { inventory: CollectionItem[] } | null;
  cosmetics: {
    cosmetics: CollectionCosmetic[];
    active: Record<string, string>;
  } | null;
  backgrounds: {
    backgrounds: Background[];
    quota: { used: number; max: number };
  } | null;
  catalog: {
    categories: {
      name: string;
      layoutKey: string;
      backgrounds: Background[];
    }[];
  } | null;
  economy: Economy | null;
}
const EMPTY: Data = {
  inventory: null,
  cosmetics: null,
  backgrounds: null,
  catalog: null,
  economy: null,
};
const SECTIONS = [
  {
    id: "items",
    title: "Items & equipment",
    icon: Package,
    href: "/locker?tab=items",
    action: "Open Locker",
    note: "Owned items and your equipped loadout.",
  },
  {
    id: "character",
    title: "Character styles",
    icon: Sparkles,
    href: "/locker?tab=identity",
    action: "Character Studio",
    note: "Available forms, pedestals, and auras.",
  },
  {
    id: "backgrounds",
    title: "Focus backgrounds",
    icon: ImageIcon,
    href: "/settings/focus-backgrounds",
    action: "Open gallery",
    note: "Your images and the shared official gallery.",
  },
  {
    id: "audio",
    title: "Audio library",
    icon: Headphones,
    href: "/locker?tab=acoustics",
    action: "Open Acoustics",
    note: "Imported tracks, stored on this device.",
  },
  {
    id: "profile",
    title: "Profile & keepsakes",
    icon: UserRound,
    href: "/locker?tab=identity",
    action: "Profile Studio",
    note: "Your identity and saved profile keepsakes.",
  },
  {
    id: "economy",
    title: "Currency ledger",
    icon: Coins,
    href: "/settings/stats",
    action: "View statistics",
    note: "Your Sylph balance and recorded activity.",
  },
] as const;

export function CollectionSettingsScreen() {
  const { user } = useAuth();
  return <CollectionContent key={user?.id || "guest"} />;
}

function CollectionContent() {
  const { user } = useAuth();
  const audio = useContext(CustomAudioContext);
  const [section, setSection] = useState<Section>("items");
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sheetRef.current) sheetRef.current.scrollTop = 0;
  }, [section]);
  const [query, setQuery] = useState("");
  const [itemFilter, setItemFilter] = useState("All");
  const [data, setData] = useState<Data>(EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const sources = [
      ["inventory", "/api/inventory", "items"],
      ["cosmetics", "/api/cosmetics", "profile keepsakes"],
      ["backgrounds", "/api/user/focus-backgrounds", "personal backgrounds"],
      ["catalog", "/api/focus-backgrounds", "official backgrounds"],
      ["economy", "/api/currency/stats", "currency ledger"],
    ] as const;
    void Promise.all(
      sources.map(async ([key, url, label]) => {
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) throw new Error(label);
          const payload = await response.json();
          if (!cancelled)
            setData((previous) => ({ ...previous, [key]: payload }));
        } catch {
          if (!cancelled) setErrors((previous) => [...previous, label]);
        }
      })
    ).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);

  const inventory = useMemo(
    () => ownedInventory(data.inventory?.inventory || []),
    [data.inventory]
  );
  const profileCosmetics = useMemo(
    () => storedProfileCosmetics(data.cosmetics?.cosmetics || []),
    [data.cosmetics]
  );
  const visualStyles = useMemo(
    () =>
      characterStyles(
        user?.level || 1,
        user?.hunterRank || "E",
        user?.characterConfig
      ),
    [user?.level, user?.hunterRank, user?.characterConfig]
  );
  const personalBackgrounds = data.backgrounds?.backgrounds || [];
  const officialBackgrounds = (data.catalog?.categories || []).flatMap(
    (category) =>
      (category.backgrounds || []).map((background) => ({
        ...background,
        layoutKey: category.layoutKey,
      }))
  );
  const tracks = audio?.library || [];
  const current = SECTIONS.find((item) => item.id === section)!;
  const search = query.trim().toLowerCase();
  const matches = (...values: (string | undefined)[]) =>
    !search || values.some((value) => value?.toLowerCase().includes(search));
  const counts: Record<Section, number | null> = {
    items: data.inventory ? inventory.length : null,
    character: visualStyles.filter((style) => style.available).length,
    backgrounds: data.backgrounds ? personalBackgrounds.length : null,
    audio: audio ? tracks.length : null,
    profile: data.cosmetics ? profileCosmetics.length : null,
    economy: data.economy?.currentBalance ?? null,
  };
  const filteredItems = inventory.filter(
    (entry) =>
      matches(entry.item.name, entry.item.description, entry.item.sku) &&
      (itemFilter === "All" ||
        (itemFilter === "Equipped"
          ? entry.isEquipped
          : entry.item.category === "CONSUMABLE"))
  );
  const filteredStyles = visualStyles.filter((style) =>
    matches(style.label, style.kind, style.description)
  );
  const filteredTracks = tracks.filter((track) =>
    matches(track.title, track.originalFilename)
  );
  const filteredPersonal = personalBackgrounds.filter((background) =>
    matches(background.name, background.layoutKey)
  );
  const filteredOfficial = officialBackgrounds.filter((background) =>
    matches(background.name, background.layoutKey)
  );
  const unitCount = inventory.reduce(
    (total, entry) => total + entry.quantity,
    0
  );
  const openSection = (id: Section) => {
    setSection(id);
    setQuery("");
    setItemFilter("All");
  };

  return (
    <SystemLibrary volume="Collection">
      <section className={styles.summary} aria-label="Collection overview">
        <div>
          <p className={styles.eyebrow}>
            {user?.name || user?.username || "Your"} / Personal collection
          </p>
          <h2 className={styles.summaryTitle}>A world of your own.</h2>
        </div>
        <div className={styles.metrics}>
          <Metric
            value={data.inventory ? unitCount : null}
            label="Owned items"
          />
          <Metric value={counts.character} label="Available styles" />
          <Metric value={counts.backgrounds} label="Personal images" />
          <Metric value={counts.audio} label="Local tracks" />
        </div>
      </section>
      {errors.length > 0 && (
        <div className={styles.error} role="alert">
          <span>
            Could not load {errors.join(", ")}. Available collections are still
            shown.
          </span>
          <button
            onClick={() => {
              setLoading(true);
              setErrors([]);
              setData(EMPTY);
              setRevision((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      <div className={styles.folio}>
        <aside className={styles.index} aria-label="Collection index">
          <p className={styles.indexLabel}>Collection index</p>
          {SECTIONS.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={section === id}
              onClick={() => openSection(id)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{title}</span>
              <small>{id === "economy" ? "↗" : (counts[id] ?? "—")}</small>
            </button>
          ))}
        </aside>
        <section
          ref={sheetRef}
          className={styles.sheet}
          aria-label={current.title}
          aria-busy={loading}
          tabIndex={0}
        >
          <div className={styles.runningHead}>
            <span>Sylf / Collection</span>
            <span>
              Volume 01 ·{" "}
              {String(
                SECTIONS.findIndex((item) => item.id === section) + 1
              ).padStart(2, "0")}
            </span>
          </div>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{current.title}</h2>
              <p>{current.note}</p>
            </div>
            <Link className={styles.actionLink} href={current.href}>
              {current.action}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {section !== "economy" && section !== "profile" && (
            <div className={styles.tools}>
              <label className={styles.search}>
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search collection"
                  placeholder={`Search ${section === "character" ? "styles" : section}…`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              {section === "items" && (
                <div className={styles.filters} aria-label="Item filters">
                  {["All", "Equipped", "Consumables"].map((filter) => (
                    <button
                      key={filter}
                      aria-pressed={itemFilter === filter}
                      onClick={() => setItemFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!user || loading ? (
            <p className={styles.loading} role="status">
              Opening your collection…
            </p>
          ) : (
            <>
              {section === "items" &&
                (data.inventory ? (
                  filteredItems.length ? (
                    <>
                      <div className={styles.grid}>
                        {filteredItems.map((entry) => (
                          <article key={entry.id} className={styles.card}>
                            <div className={styles.cardTop}>
                              <Package size={23} aria-hidden="true" />
                              <span
                                className={`${styles.badge} ${entry.isEquipped ? styles.active : ""}`}
                              >
                                {entry.isEquipped ? (
                                  <>
                                    <Check size={11} />
                                    Equipped
                                  </>
                                ) : (
                                  "Owned"
                                )}
                              </span>
                            </div>
                            <h3>{entry.item.name}</h3>
                            <p>{entry.item.description}</p>
                            <div className={styles.cardMeta}>
                              <span>
                                {entry.item.rarity} ·{" "}
                                {entry.item.slot === "NONE"
                                  ? entry.item.category
                                  : entry.item.slot}
                              </span>
                              <span>Qty {entry.quantity}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                      <p className={styles.notice}>
                        {inventory.length} distinct · {unitCount} total ·{" "}
                        {inventory.filter((entry) => entry.isEquipped).length}{" "}
                        equipped
                      </p>
                    </>
                  ) : (
                    <LibraryEmpty
                      title={
                        search || itemFilter !== "All"
                          ? "No matching items"
                          : "The first shelf awaits"
                      }
                    >
                      {search || itemFilter !== "All" ? (
                        "Try another search or filter."
                      ) : (
                        <>Acquired items will appear here.</>
                      )}
                    </LibraryEmpty>
                  )
                ) : (
                  <LibraryEmpty title="Inventory unavailable">
                    Retry loading your collection to see your owned items.
                  </LibraryEmpty>
                ))}
              {section === "character" && (
                <>
                  {filteredStyles.length ? (
                    <div className={styles.grid}>
                      {filteredStyles.map((style) => (
                        <article className={styles.card} key={style.id}>
                          {style.imagePath && (
                            <div className={styles.preview}>
                              <Image
                                src={style.imagePath}
                                alt={style.label}
                                width={240}
                                height={138}
                                loading="lazy"
                                unoptimized
                              />
                            </div>
                          )}
                          <div className={styles.cardTop}>
                            <span className={styles.label}>{style.kind}</span>
                            <span
                              className={`${styles.badge} ${style.active ? styles.active : ""}`}
                            >
                              {style.active
                                ? "Selected"
                                : style.available
                                  ? "Available"
                                  : "Locked"}
                            </span>
                          </div>
                          <h3>{style.label}</h3>
                          <div className={styles.cardMeta}>
                            <span>{style.rarity}</span>
                            <span>
                              {style.available
                                ? "In Character Studio"
                                : `Lv. ${style.requiredLevel || 1} · ${style.requiredRank || "E"}`}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <LibraryEmpty title="No matching styles">
                      Try another search.
                    </LibraryEmpty>
                  )}
                  <p className={styles.notice}>
                    Select a style in Character Studio. Available styles are
                    separate from purchased items.
                  </p>
                </>
              )}
              {section === "backgrounds" && (
                <>
                  <h3 className={styles.groupTitle}>
                    Personal gallery{" "}
                    {data.backgrounds
                      ? `· ${data.backgrounds.quota.used} / ${data.backgrounds.quota.max}`
                      : ""}
                  </h3>
                  {filteredPersonal.length ? (
                    <div className={styles.grid}>
                      {filteredPersonal.map((background) => (
                        <BackgroundCard
                          key={background.id}
                          background={background}
                          personal
                        />
                      ))}
                    </div>
                  ) : (
                    <LibraryEmpty
                      title={
                        search
                          ? "No matching personal images"
                          : data.backgrounds
                            ? "Make room for a sanctuary"
                            : "Personal gallery unavailable"
                      }
                    >
                      {data.backgrounds
                        ? "Upload your own image in Focus Backgrounds."
                        : "Retry loading your personal backgrounds."}
                    </LibraryEmpty>
                  )}
                  <h3 className={styles.groupTitle}>
                    Official gallery ·{" "}
                    {data.catalog
                      ? `${officialBackgrounds.length} available`
                      : "Unavailable"}
                  </h3>
                  {filteredOfficial.length ? (
                    <div className={styles.grid}>
                      {filteredOfficial.map((background) => (
                        <BackgroundCard
                          key={background.id}
                          background={background}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className={styles.notice}>
                      {search
                        ? "No matching official backgrounds."
                        : "Classic Sylf remains available from the Focus Backgrounds gallery."}
                    </p>
                  )}
                </>
              )}
              {section === "audio" && (
                <>
                  {audio?.error && (
                    <p className={styles.error} role="alert">
                      {audio.error}
                    </p>
                  )}
                  {filteredTracks.length ? (
                    <div className={styles.grid}>
                      {filteredTracks.map((track) => (
                        <article key={track.id} className={styles.card}>
                          <div className={styles.cardTop}>
                            <Headphones size={23} />
                            <span
                              className={`${styles.badge} ${track.id === audio?.activeTrackId ? styles.active : ""}`}
                            >
                              {track.id === audio?.activeTrackId
                                ? "Selected"
                                : "On this device"}
                            </span>
                          </div>
                          <h3>{track.title}</h3>
                          <p>{track.originalFilename}</p>
                          <div className={styles.cardMeta}>
                            <span>
                              {(track.sizeBytes / 1024 / 1024).toFixed(1)} MB
                            </span>
                            <span>
                              {Math.floor(track.duration / 60)}:
                              {String(Math.floor(track.duration % 60)).padStart(
                                2,
                                "0"
                              )}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <LibraryEmpty
                      title={
                        search
                          ? "No matching tracks"
                          : "A soundtrack of your own"
                      }
                    >
                      Import tracks in Locker → Acoustics. Audio stays on this
                      device.
                    </LibraryEmpty>
                  )}
                  <p className={styles.notice}>
                    Mix soundscapes and ambient layers in Acoustics.
                  </p>
                </>
              )}
              {section === "profile" && (
                <>
                  <div className={styles.grid}>
                    {[
                      {
                        title: "Profile picture",
                        value: user.avatarUrl
                          ? "Custom image saved"
                          : "Default profile picture",
                      },
                      {
                        title: "Profile banner",
                        value: user.bannerUrl
                          ? "Custom banner saved"
                          : "No custom banner",
                      },
                      {
                        title: "Biography",
                        value: user.bio || "Add a biography in Profile Studio.",
                      },
                    ].map((entry) => (
                      <article className={styles.card} key={entry.title}>
                        <UserRound size={22} />
                        <h3>{entry.title}</h3>
                        <p>{entry.value}</p>
                      </article>
                    ))}
                  </div>
                  <h3 className={styles.groupTitle}>
                    Recorded keepsakes · {profileCosmetics.length}
                  </h3>
                  {profileCosmetics.length ? (
                    <div className={styles.grid}>
                      {profileCosmetics.map((cosmetic) => {
                        const catalog =
                          COSMETICS_CATALOG[
                            cosmetic.category as
                              | "FRAME"
                              | "TITLE"
                              | "NAME_COLOR"
                          ];
                        const definition = catalog.find(
                          (entry) => entry.id === cosmetic.itemKey
                        );
                        const activeKey = {
                          FRAME: "activeFrame",
                          TITLE: "activeTitle",
                          NAME_COLOR: "activeNameColor",
                        }[
                          cosmetic.category as "FRAME" | "TITLE" | "NAME_COLOR"
                        ];
                        const active =
                          data.cosmetics?.active[activeKey] ===
                          cosmetic.itemKey;
                        return (
                          <article
                            className={styles.card}
                            key={`${cosmetic.category}:${cosmetic.itemKey}`}
                          >
                            <div className={styles.cardTop}>
                              <Layers size={22} />
                              <span
                                className={`${styles.badge} ${active ? styles.active : ""}`}
                              >
                                {active ? "Active" : "Acquired"}
                              </span>
                            </div>
                            <h3>
                              {definition?.name ||
                                cosmetic.itemKey.replace(/_/g, " ")}
                            </h3>
                            <p>
                              {definition?.description ||
                                "Saved profile cosmetic."}
                            </p>
                            <div className={styles.cardMeta}>
                              <span>
                                {cosmetic.category.replace(/_/g, " ")}
                              </span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={styles.notice}>
                      {data.cosmetics
                        ? "No additional keepsakes. Defaults are available to everyone."
                        : "Profile keepsakes could not be loaded."}
                    </p>
                  )}
                  <p className={styles.notice}>
                    App colors and light/dark mode:{" "}
                    <Link
                      className={styles.actionLink}
                      href="/settings/appearance"
                    >
                      Appearance <ArrowUpRight size={12} />
                    </Link>
                  </p>
                </>
              )}
              {section === "economy" &&
                (data.economy ? (
                  <>
                    <div className={styles.ledger}>
                      {[
                        [
                          "Sylph balance",
                          data.economy.currentBalance,
                          "Available to spend.",
                        ],
                        [
                          "Lifetime earned",
                          data.economy.totalEarned,
                          "Recorded Sylph earnings.",
                        ],
                        [
                          "Lifetime spent",
                          data.economy.totalSpent,
                          "Includes purchases and attribute investments.",
                        ],
                        [
                          "Recorded HP loss",
                          data.economy.totalHpLost,
                          "Total recorded damage.",
                        ],
                      ].map(([label, value, note]) => (
                        <article className={styles.card} key={label}>
                          <span className={styles.label}>{label}</span>
                          <strong>{Number(value).toLocaleString()}</strong>
                          <p>{note}</p>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <LibraryEmpty title="Ledger unavailable">
                    Retry loading your currency totals.
                  </LibraryEmpty>
                ))}
            </>
          )}
          <footer className={styles.footer}>
            <span>Your personal ledger</span>
            <span>Sylf / Collection</span>
          </footer>
        </section>
      </div>
    </SystemLibrary>
  );
}
function Metric({ value, label }: { value: number | null; label: string }) {
  return (
    <div className={styles.metric}>
      <strong>{value === null ? "—" : value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}
function BackgroundCard({
  background,
  personal = false,
}: {
  background: Background;
  personal?: boolean;
}) {
  const image = background.signedUrl || background.publicUrl;
  return (
    <article className={styles.card}>
      {image && (
        <div className={`${styles.preview} ${styles.backgroundPreview}`}>
          <Image
            src={image}
            alt={background.name}
            width={320}
            height={180}
            loading="lazy"
            unoptimized
          />
        </div>
      )}
      <div className={styles.cardTop}>
        <ImageIcon size={21} />
        <span className={styles.badge}>
          {personal ? "Personal" : "Shared gallery"}
        </span>
      </div>
      <h3>{background.name}</h3>
      <p>{background.layoutKey || "classic"} timer layout</p>
    </article>
  );
}
export default CollectionSettingsScreen;
