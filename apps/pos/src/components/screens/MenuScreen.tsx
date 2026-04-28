import { menuItems, menuCategories, MenuItem, OrderItem } from "@/data/menu";
import { getUpsellItem } from "@/data/upsell";
import { useMemo, useState, useCallback } from "react";

type PageTab = "menu" | "about" | "info";

interface MenuScreenProps {
  onSelect: (item: MenuItem) => void;
  onAddToCart: (item: MenuItem) => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  order: OrderItem[];
}

const MenuScreen = ({ onSelect, onAddToCart, onUpdateQuantity, order }: MenuScreenProps) => {
  const [activeCategory, setActiveCategory] = useState<string>(menuCategories[0]);
  const [upsells, setUpsells] = useState<Record<string, MenuItem>>({});

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => item.category === activeCategory);
  }, [activeCategory]);

  const getQty = useCallback((itemId: string) => {
    return order.find((o) => o.id === itemId)?.quantity || 0;
  }, [order]);

  const handleAddToCart = useCallback((item: MenuItem) => {
    onAddToCart(item);
    const suggested = getUpsellItem(item);
    if (suggested && !upsells[item.id]) {
      setUpsells((prev) => ({ ...prev, [item.id]: suggested }));
    }
  }, [onAddToCart, upsells]);

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

  const [pageTab, setPageTab] = useState<PageTab>("menu");

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
          <div className="flex border-b border-border overflow-x-auto">
            {menuCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-1 min-w-0 py-2.5 text-[10px] tracking-[0.15em] uppercase font-display font-semibold cursor-pointer transition-all ${
                  activeCategory === cat
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Items list */}
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
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 object-cover flex-shrink-0 border border-border"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-sm font-semibold text-foreground truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.description}
                          </p>
                          <p className="font-display text-sm font-bold text-primary mt-1">
                            ${item.price.toFixed(2)}
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

                    {upsells[item.id] && (
                      <div className="flex items-center gap-3 px-3 py-2.5 border border-t-0 border-primary/20 bg-primary/5">
                        <div className="w-1 h-8 bg-primary/30 flex-shrink-0" />
                        <img
                          src={upsells[item.id].image}
                          alt={upsells[item.id].name}
                          className="w-10 h-10 object-cover flex-shrink-0 border border-border"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] tracking-wider uppercase text-primary font-display font-semibold">
                            Pairs well with
                          </p>
                          <p className="font-display text-xs font-semibold text-foreground truncate">
                            {upsells[item.id].name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            ${upsells[item.id].price.toFixed(2)}
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
                Welcome to our restaurant — a place where culinary craft meets modern hospitality. 
                We source the finest seasonal ingredients from local farms and artisan suppliers to 
                create dishes that delight every palate.
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
                  <span className="text-foreground font-display">11:00 AM – 11:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sat – Sun</span>
                  <span className="text-foreground font-display">10:00 AM – 12:00 AM</span>
                </div>
              </div>
            </div>

            <div className="border border-border p-4 bg-card">
              <h3 className="font-display text-sm font-semibold text-foreground tracking-wider uppercase mb-3">
                Dietary Information
              </h3>
              <div className="flex flex-wrap gap-2">
                {["Vegetarian", "Vegan", "Gluten-Free", "Nut-Free", "Halal"].map((tag) => (
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
              <h3 className="font-display text-sm font-semibold text-foreground tracking-wider uppercase mb-3">
                Wi-Fi
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Network</span>
                <span className="text-sm text-foreground font-display font-semibold">Guest_WiFi</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-muted-foreground">Password</span>
                <span className="text-sm text-primary font-mono">welcome2024</span>
              </div>
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
