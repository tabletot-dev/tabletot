import { useMenu } from "@/lib/menuStore";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState, useCallback, useEffect } from "react";
import ChefsPicks from "@/components/ChefsPicks";
import { MenuItem, OrderItem } from "@/data/menu";

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

type PageTab = "menu" | "about" | "info";

interface MenuScreenProps {
  onSelect: (item: MenuItem) => void;
  onAddToCart: (item: MenuItem) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  order: OrderItem[];
}

const MenuScreen = ({ onSelect, onAddToCart, onUpdateQuantity, order }: MenuScreenProps) => {
  const { items, categories, loading, error } = useMenu();
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [upsells, setUpsells] = useState<Record<string, MenuItem>>({});
  const [pageTab, setPageTab] = useState<PageTab>("menu");

  // Cache of item pairings from DB - fetched once when items load
  const [pairingsCache, setPairingsCache] = useState<Record<string, MenuItem | null>>({});

  useEffect(() => {
    if (items.length === 0) return;
    // Fetch all pairings for this restaurant in one query
    supabase
      .from("item_pairings")
      .select("source_item_id, priority, menu_items!item_pairings_paired_item_id_fkey(id, name, price, category, tags)")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("menu_items.active", true)
      .order("priority", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        // Build cache: source_item_id -> best paired MenuItem (or null)
        const cache: Record<string, MenuItem | null> = {};
        for (const row of data) {
          const sourceId = row.source_item_id as string;
          if (!(sourceId in cache)) {
            const mi = row.menu_items as { id: string; name: string; price: number; category: string; tags: string[] } | null;
            if (mi) {
              cache[sourceId] = {
                id: mi.id,
                name: mi.name,
                price: mi.price,
                category: mi.category ?? '',
                tags: Array.isArray(mi.tags) ? (mi.tags as string[]) : [],
              };
            } else {
              cache[sourceId] = null;
            }
          }
        }
        setPairingsCache(cache);
      });
  }, [items]);

  // Set initial category once items load
  const resolvedCategory = activeCategory || categories[0] || '';

  const filteredItems = useMemo(() => {
    return items.filter((item) => item.category === resolvedCategory);
  }, [items, resolvedCategory]);

  const getQty = useCallback((itemId: string) => {
    return order.find((o) => o.id === itemId)?.quantity || 0;
  }, [order]);

  const handleAddToCart = useCallback((item: MenuItem) => {
    onAddToCart(item);
    // Use DB pairing if exists, otherwise no upsell
    const suggested = pairingsCache[item.id];
    if (suggested && !upsells[item.id]) {
      setUpsells((prev) => ({ ...prev, [item.id]: suggested }));
    }
  }, [onAddToCart, upsells, pairingsCache]);

  const handleUpsellAdd = useCallback((parentId: string, item: MenuItem) => {
    onAddToCart(item);
    setUpsells((prev) => {
      const next = { ...prev };
      delete next[parentId];
      return next;
    });
  }, [onAddToCart]);

  const dismissUpsell = useCallback((parentId: string) => {
    setUpsells((prev) => {
      const next = { ...prev };
      delete next[parentId];
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Top-level page tabs */}
      <div className="flex border-b border-border">
        {([
          { id: "menu" as PageTab, label: "Menu" },
          { id: "about" as PageTab, label: "About" },
          { id: "info" as PageTab, label: "Other Info" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setPageTab(tab.id)}
            className={`flex-1 py-3 font-display text-xs tracking-[0.15em] uppercase font-semibold cursor-pointer transition-all ${
              pageTab === tab.id
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {pageTab === "menu" && (
        <>
          {/* Category tabs */}
          {!loading && !error && categories.length > 0 && (
            <div className="flex border-b border-border overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-none px-3 py-2.5 text-[10px] tracking-[0.15em] uppercase font-display font-semibold cursor-pointer transition-all whitespace-nowrap ${
                    resolvedCategory === cat
                      ? "text-primary border-b-2 border-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}

          <ChefsPicks order={order} onAddToCart={onAddToCart} />

          {/* Loading state */}
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground tracking-wider">Loading menu…</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="border border-border p-4 text-center">
                <p className="font-display text-sm text-foreground font-semibold">Menu unavailable</p>
                <p className="text-xs text-muted-foreground mt-1">Please ask staff for assistance</p>
              </div>
            </div>
          )}

          {/* Items list */}
          {!loading && !error && (
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-2">
                {filteredItems.map((item) => {
                  const qty = getQty(item.id);
                  return (
                    <div key={item.id} className="flex flex-col">
                      <div className="flex items-center gap-3 p-3 border border-border bg-card transition-all hover:border-primary/50">
                        <div
                          onClick={() => onSelect(item)}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-sm font-semibold text-foreground truncate">
                              {item.name}
                            </p>
                            {item.tags.length > 0 && (
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {item.tags.join(', ')}
                              </p>
                            )}
                            <p className="font-display text-sm font-bold text-primary mt-1">
                              ₹{item.price}
                            </p>
                          </div>
                        </div>

                        {qty > 0 ? (
                          <div className="flex items-center gap-0 flex-shrink-0">
                            <button
                              onClick={() => onUpdateQuantity(item.id, -1)}
                              className="w-9 h-9 flex items-center justify-center border border-border text-foreground cursor-pointer hover:bg-muted active:bg-primary/10 text-base font-bold transition-all"
                            >
                              −
                            </button>
                            <span className="w-8 h-9 flex items-center justify-center border-y border-border font-display text-sm font-bold text-primary">
                              {qty}
                            </span>
                            <button
                              onClick={() => onUpdateQuantity(item.id, 1)}
                              className="w-9 h-9 flex items-center justify-center border border-border text-foreground cursor-pointer hover:bg-muted active:bg-primary/10 text-base font-bold transition-all"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddToCart(item)}
                            className="flex-shrink-0 w-10 h-10 flex items-center justify-center border border-primary/40 text-primary cursor-pointer transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {upsells[item.id] && pairingsCache[item.id] && (
                        <div className="flex items-center gap-3 px-3 py-2.5 border border-t-0 border-primary/20 bg-primary/5">
                          <div className="w-1 h-8 bg-primary/30 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] tracking-wider uppercase text-primary font-display font-semibold">
                              Pairs well with
                            </p>
                            <p className="font-display text-xs font-semibold text-foreground truncate">
                              {upsells[item.id].name}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              ₹{upsells[item.id].price}
                            </p>
                          </div>
                          <button
                            onClick={() => handleUpsellAdd(item.id, upsells[item.id])}
                            className="flex-shrink-0 px-3 py-1.5 bg-primary text-primary-foreground font-display text-[10px] font-semibold tracking-widest uppercase cursor-pointer hover:opacity-90 active:scale-95 transition-all"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => dismissUpsell(item.id)}
                            className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {pageTab === "about" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-5">
            <div className="border border-border p-4 bg-card">
              <h2 className="font-display text-lg font-bold text-foreground tracking-wide mb-2">
                About Us
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Welcome to Roast CCx — a place where culinary craft meets modern hospitality.
                We source the finest seasonal ingredients to create dishes that delight every palate.
              </p>
            </div>

            <div className="border border-border p-4 bg-card">
              <h3 className="font-display text-sm font-semibold text-foreground tracking-wider uppercase mb-2">
                Our Philosophy
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Every dish tells a story. Our chefs blend traditional techniques with contemporary
                innovation to bring you a dining experience that's both familiar and exciting.
              </p>
            </div>

            <div className="border border-border p-4 bg-card">
              <h3 className="font-display text-sm font-semibold text-foreground tracking-wider uppercase mb-2">
                Chef's Note
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed italic">
                "We believe great food starts with great ingredients. Every item on our menu
                is crafted with care and passion."
              </p>
              <p className="text-xs text-primary mt-2 font-display tracking-wider">
                — Executive Chef
              </p>
            </div>
          </div>
        </div>
      )}

      {pageTab === "info" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <div className="border border-border p-4 bg-card">
              <h3 className="font-display text-sm font-semibold text-foreground tracking-wider uppercase mb-3">
                Hours
              </h3>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mon – Fri</span>
                  <span className="text-foreground font-display">8:00 AM – 11:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sat – Sun</span>
                  <span className="text-foreground font-display">8:00 AM – 11:00 PM</span>
                </div>
              </div>
            </div>

            <div className="border border-border p-4 bg-card">
              <h3 className="font-display text-sm font-semibold text-foreground tracking-wider uppercase mb-3">
                Dietary Information
              </h3>
              <div className="flex flex-wrap gap-2">
                {["Vegetarian", "Non-Vegetarian", "Vegan Options"].map((tag) => (
                  <span
                    key={tag}
                    className="text-xs border border-border px-2 py-1 text-muted-foreground tracking-wider"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Please inform your server about any allergies. We'll be happy to accommodate your needs.
              </p>
            </div>

            <div className="border border-border p-4 bg-card">
              <h3 className="font-display text-sm font-semibold text-foreground tracking-wider uppercase mb-2">
                Need Help?
              </h3>
              <p className="text-sm text-muted-foreground">
                Tap the mic button to speak with our AI assistant, or ask your server for help.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuScreen;
