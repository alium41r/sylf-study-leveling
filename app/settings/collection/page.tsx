"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { SHOP_ITEMS } from "@/lib/shop-items";
import { COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import BackToSettings from "@/app/components/BackToSettings";

export default function SettingsInventoryPage() {
  const { user, token } = useAuth();
  
  const [activeTab, setActiveTab] = useState<"ITEMS" | "COSMETICS" | "STATS">("ITEMS");
  const [stats, setStats] = useState({ totalEarned: 0, totalSpent: 0, totalHpLost: 0 });
  const [inventoryItems, setInventoryItems] = useState<{itemKey: string, quantity: number}[]>([]);
  const [cosmetics, setCosmetics] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;

    // Fetch Stats
    fetch("/api/currency/stats", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => (res.ok ? res.json().catch(() => ({})) : {}))
      .then(data => setStats(data))
      .catch(console.error);

    // Fetch Inventory Items
    fetch("/api/inventory", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => (res.ok ? res.json().catch(() => ({})) : {}))
      .then(data => setInventoryItems(data.inventoryItems || []))
      .catch(console.error);
      
    // Fetch Cosmetics
    fetch("/api/cosmetics", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (data?.cosmetics) setCosmetics(data.cosmetics);
      })
      .catch(console.error);

  }, [token]);

  if (!user) return <div className="text-text-muted">Loading collection...</div>;

  const hasCosmetic = (category: string, itemKey: string) => {
    if (itemKey.includes("default")) return true;
    return cosmetics.some(c => c.category === category && c.itemKey === itemKey);
  };

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">System → Collection</p>
      <h1 className="settings-page-header">My Collection</h1>

      <p
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          marginBottom: "28px",
          lineHeight: 1.6,
        }}
      >
        A comprehensive overview of the items you've acquired, cosmetics unlocked, and lifetime currency statistics.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "16px", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: "32px" }}>
        {["ITEMS", "COSMETICS", "STATS"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            style={{
              padding: "0 12px 12px",
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.05em",
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
              borderBottom: activeTab === tab ? "2px solid var(--text-primary)" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
          >
            {tab === "STATS" ? "CURRENCY / EXP" : tab}
          </button>
        ))}
      </div>

      <div className="animate-fade-in-up">
        {activeTab === "STATS" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div style={{ background: "var(--bg-abyss)", border: "1px solid var(--border-subtle)", borderLeft: "4px solid var(--accent-primary-light)", padding: "24px", borderRadius: "8px" }}>
              <p style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.1em", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" }}>TOTAL SYLPH EARNED</p>
              <p style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--accent-primary-light)" }}>{stats.totalEarned}</p>
            </div>
            <div style={{ background: "var(--bg-abyss)", border: "1px solid rgba(239,68,68,0.3)", borderLeft: "4px solid var(--accent-red)", padding: "24px", borderRadius: "8px" }}>
              <p style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.1em", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" }}>TOTAL SYLPH SPENT</p>
              <p style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--accent-red)" }}>{stats.totalSpent}</p>
            </div>
            <div style={{ background: "var(--bg-abyss)", border: "1px solid rgba(220,38,38,0.3)", borderLeft: "4px solid var(--accent-red)", padding: "24px", borderRadius: "8px" }}>
              <p style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.1em", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" }}>TOTAL HP LOST</p>
              <p style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--accent-red)" }}>{stats.totalHpLost}</p>
            </div>
          </div>
        )}

        {activeTab === "ITEMS" && (
          <div>
            {inventoryItems.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>You don't own any items yet. Visit the System Shop.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
                {inventoryItems.map((invItem) => {
                  const shopDef = SHOP_ITEMS.find(s => s.itemKey === invItem.itemKey);
                  if (!shopDef) return null;
                  return (
                    <div key={invItem.itemKey} style={{ background: "var(--bg-abyss)", border: "1px solid var(--border-subtle)", padding: "16px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{ fontSize: "2rem" }}>{shopDef.icon}</div>
                      <div>
                        <div style={{ fontWeight: "bold", fontSize: "0.9rem" }}>{shopDef.name}</div>
                        <div style={{ color: "var(--accent-primary-light)", fontFamily: "'Rajdhani', sans-serif", fontWeight: "bold", fontSize: "0.85rem" }}>OWNED: {invItem.quantity}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "COSMETICS" && (
          <div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "20px" }}>* To equip cosmetics, visit their respective configuration pages in Settings.</p>
            
            {["THEME", "BACKGROUND", "CLASS", "FRAME", "TITLE", "NAME_COLOR"].map((category) => {
              const items = COSMETICS_CATALOG[category as keyof typeof COSMETICS_CATALOG];
              const ownedCount = items.filter(i => hasCosmetic(category, i.id)).length;
              
              if (ownedCount === 0) return null;
              
              return (
                <div key={category} style={{ marginBottom: "32px" }}>
                  <h3 style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: "bold", letterSpacing: "0.1em", marginBottom: "12px", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    {category.replace("_", " ")} ({ownedCount}/{items.length})
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                    {items.map(item => {
                      const unlocked = hasCosmetic(category, item.id);
                      if (!unlocked) return null;
                      
                      return (
                        <div key={item.id} className="relative rounded-lg overflow-hidden border border-border-subtle bg-bg-abyss p-3 flex flex-col gap-2">
                          {(category === "CLASS" || category === "AVATAR") && (
                            <div className="w-full h-24 rounded overflow-hidden relative bg-black/50 border border-white/10">
                              <img 
                                src={item.value} 
                                alt={item.name} 
                                className="w-full h-full object-cover object-center"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                  const fb = (e.target as HTMLElement).nextElementSibling;
                                  if (fb) (fb as HTMLElement).style.display = "flex";
                                }}
                              />
                              <div className="absolute inset-0 hidden items-center justify-center text-3xl">
                                {item.fallbackIcon || "👤"}
                              </div>
                            </div>
                          )}
                          <div>
                            <p style={{ fontWeight: "bold", fontSize: "0.85rem", marginBottom: "2px", color: "var(--text-primary)" }}>{item.name}</p>
                            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.4 }}>{item.description}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.3s ease forwards;
        }
      `}</style>
    </div>
  );
}
