"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { useRouter } from "next/navigation";
import { SHOP_ITEMS } from "@/lib/shop-items";

export default function ShopPage() {
  const { user, token, mutateUser } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!token) {
      router.push("/login");
    }
  }, [token, router]);

  if (!user) {
    return <div className="p-8 text-center text-gray-400">Loading Shop...</div>;
  }

  const handlePurchase = async (itemKey: string, cost: number) => {
    if (user.sylph < cost) {
      setError("Insufficient Sylph to purchase this item.");
      setTimeout(() => setError(""), 3000);
      return;
    }

    setLoading(itemKey);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/shop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ itemKey, quantity: 1 })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Purchase failed");
      }

      setSuccess(`Successfully acquired ${SHOP_ITEMS.find(p => p.itemKey === itemKey)?.name}!`);
      mutateUser({ ...user, sylph: data.newBalance });
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(""), 3000);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-8 pb-20 max-w-5xl mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 mt-4">
        <div>
          <p className="text-xs tracking-widest mb-1 text-cyan-400 font-['Rajdhani']">SYSTEM STORE</p>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 mb-4 md:mb-0">
            Shop
          </h1>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-950/50 border border-red-500/50 text-red-200 flex items-center gap-3 animate-fade-in-down">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 rounded-lg bg-green-950/50 border border-green-500/50 text-green-200 flex items-center gap-3 animate-fade-in-down">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SHOP_ITEMS.map((item) => (
          <div 
            key={item.itemKey}
            className="flex flex-col system-card p-6 bg-[#11111f] border border-[#2a2a4a] hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all duration-300 group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="text-4xl bg-white/5 w-14 h-14 flex items-center justify-center rounded-xl group-hover:scale-110 transition-transform">
                {item.icon}
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#11111f] border border-[#2a2a4a]">
                <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                  <img src="/sylph-logo.jpg" alt="Sylph" className="w-full h-full object-cover scale-[1.35]" />
                </div>
                <span className="text-lg font-bold text-cyan-400 font-['Rajdhani']">{item.price}</span>
              </div>
            </div>
            
            <h3 className="text-xl font-bold mb-2 group-hover:text-cyan-300 transition-colors">{item.name}</h3>
            <p className="text-sm text-gray-400 flex-grow mb-6 leading-relaxed">
              {item.description}
            </p>
            
            <button
              onClick={() => handlePurchase(item.itemKey, item.price)}
              disabled={loading === item.itemKey || user.sylph < item.price}
              className={`w-full py-3 rounded-lg font-bold font-['Rajdhani'] tracking-widest transition-all ${
                loading === item.itemKey 
                  ? "bg-cyan-600 cursor-wait text-white" 
                  : user.sylph < item.price
                  ? "bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700"
                  : "bg-cyan-950/30 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500 hover:text-black hover:shadow-[0_0_15px_rgba(6,182,212,0.6)]"
              }`}
            >
              {loading === item.itemKey ? "PROCESSING..." : user.sylph < item.price ? "INSUFFICIENT SYLPH" : "PURCHASE"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
