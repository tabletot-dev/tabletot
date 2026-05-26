import type { MenuItem } from "@/data/menu";
import { categoryGradient } from "@/lib/categoryGradients";

const PHOTO_OVERLAY =
  "linear-gradient(180deg, rgba(4,7,7,0) 0%, rgba(4,7,7,0.06) 48%, rgba(4,7,7,0.34) 100%), radial-gradient(circle at 78% 12%, rgba(243,108,49,0.1), transparent 34%)";

// Images are served from Supabase Storage. Paths in the map below are relative
// to the bucket root (strip the leading /images/ when uploading).
const _STORAGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/menu-images`;
const _toUrl = (path: string) => `${_STORAGE_BASE}${path.replace("/images", "")}`;

const SILVER_MENU_IMAGES: Record<string, string> = {
  "affogato": "/images/silver/affogato.png",
  "aglio e olio": "/images/silver/aglio-e-oilio.jpg",
  "aglio e oilio": "/images/silver/aglio-e-oilio.jpg",
  "alfredo pasta": "/images/silver/alfredo-pasta.jpg",
  "avocado quinoa salad": "/images/silver/avocado-quinoa-salad.jpg",
  "avocado toast": "/images/silver/avcado-toast.jpg",
  "baby corn fritters": "/images/silver/baby-corn-fritters.jpg",
  "banana": "/images/silver/banana-panckaes.jpg",
  "banana pancakes": "/images/silver/banana-panckaes.jpg",
  "berry": "/images/silver/berry-bowl.jpg",
  "berry bowl": "/images/silver/berry-bowl.jpg",
  "cacao": "/images/silver/cacao-bowl.jpg",
  "cacao bowl": "/images/silver/cacao-bowl.jpg",
  "cappuccino": "/images/silver/cuppocino.jpg",
  "chicken alfredo": "/images/silver/chicken-alfredo.jpg",
  "chicken marinara": "/images/silver/chicken-marinara.jpg",
  "corn and spinach sandwich": "/images/silver/corn-and-spinach-sandwich.jpg",
  "cortado": "/images/silver/cortado.jpg",
  "creamy grilled zucchini": "/images/silver/creamy-grilled-zucchini.jpg",
  "creme caramel": "/images/silver/creme-caramel.jpg",
  "crispy flat bread": "/images/silver/crispy-flat-bread.jpg",
  "egg bagel": "/images/silver/egg-bagel.jpg",
  "egg spinach toast": "/images/silver/egg-spinach-toast.jpg",
  "espresso": "/images/silver/espresso.png",
  "espresso cranberry": "/images/silver/espresso-cranberry.png",
  "espresso lime": "/images/silver/espresso-lime.jpg",
  "espresso orange": "/images/silver/espresso-orange.png",
  "espresso tonic": "/images/silver/espresso-tonic.png",
  "feta mousse and greens": "/images/silver/feta-mousse-and-greens.jpg",
  "feta mousse greens": "/images/silver/feta-mousse-and-greens.jpg",
  "flat white": "/images/silver/flat-white.jpg",
  "focaccia chicken": "/images/silver/foccacia-chicken.jpg",
  "focaccia mushroom": "/images/silver/foccacia-mushroom.jpg",
  "foccacia chicken": "/images/silver/foccacia-chicken.jpg",
  "foccacia mushroom": "/images/silver/foccacia-mushroom.jpg",
  "french omelette": "/images/silver/french-omlette.jpg",
  "french omlette": "/images/silver/french-omlette.jpg",
  "french toast": "/images/silver/french-toast.jpg",
  "fresh orange juice": "/images/silver/fresh-orange-juice.jpg",
  "fresh watermelon juice": "/images/silver/fresh-watermelon-juice.jpg",
  "greek yogurt": "/images/silver/greek-yogurt-bowl.jpg",
  "greek yogurt bowl": "/images/silver/greek-yogurt-bowl.jpg",
  "grilled herb chicken": "/images/silver/grilled-herb-chicken.jpg",
  "healthy bowl": "/images/silver/healthy-bowl.jpg",
  "hot chocolate": "/images/silver/hot-chocolate.png",
  "iced latte": "/images/silver/iced-latte-iced-mocha.jpg",
  "iced long black": "/images/silver/iced-long-black.png",
  "iced matcha latte": "/images/silver/iced-matcha-latte.jpg",
  "iced mocha": "/images/silver/iced-latte-iced-mocha.jpg",
  "koraput v60": "/images/silver/koraput-v60-card.jpg",
  "koraput v60 card": "/images/silver/koraput-v60-card.jpg",
  "latte": "/images/silver/cuppocino.jpg",
  "liberica v60": "/images/silver/liberica-v60-card.jpg",
  "liberica v60 card": "/images/silver/liberica-v60-card.jpg",
  "long black": "/images/silver/long-black.jpg",
  "matcha latte": "/images/silver/matcha-latte.jpg",
  "mocha": "/images/silver/mocha.jpg",
  "nashville burger": "/images/silver/nashville-burger.jpg",
  "nashville chicken": "/images/silver/nashville-burger.jpg",
  "nutella cruffin": "/images/silver/nutella-cruffin.jpg",
  "original": "/images/silver/original-panckakes.jpg",
  "original pancakes": "/images/silver/original-panckakes.jpg",
  "pb and j": "/images/silver/pb-andj-pancakes.jpg",
  "pb j": "/images/silver/pb-andj-pancakes.jpg",
  "pbj": "/images/silver/pb-andj-pancakes.jpg",
  "peri peri chicken": "/images/silver/peri-peri-chicken-sandwich.jpg",
  "peri peri chicken sandwich": "/images/silver/peri-peri-chicken-sandwich.jpg",
  "pesto pasta": "/images/silver/pesto-pasta.jpg",
  "silver breakfast non veg": "/images/silver/silver-non-veg-bf.jpg",
  "silver breakfast veg": "/images/silver/silver-veg-bf.jpg",
  "silver cold brew": "/images/silver/silver-cold-brew.png",
  "silver cold coffee": "/images/silver/silver-cold-coffee.png",
  "spanish latte": "/images/silver/spanish-latte.png",
  "tea": "/images/silver/teas.png",
  "teas": "/images/silver/teas.png",
  "turkish eggs": "/images/silver/turkish-eggs.jpg",
  "valaparai v60": "/images/silver/valaparai-v60-card.jpg",
  "valaparai v60 card": "/images/silver/valaparai-v60-card.jpg",
  "vanilla mush": "/images/silver/vanilla-mush.jpg",
  "veg burger": "/images/silver/veg-burger.jpg",
  "veggie": "/images/silver/veggie-sandwich.jpg",
  "veggie bagel": "/images/silver/veggie-bagel.jpg",
  "veggie patty": "/images/silver/veg-burger.jpg",
  "veggie sandwich": "/images/silver/veggie-sandwich.jpg",
};

export function normalizeMenuName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function menuImageForName(name: string): string | undefined {
  const normalized = normalizeMenuName(name);
  const path = SILVER_MENU_IMAGES[normalized]
    ?? SILVER_MENU_IMAGES[normalized.replace(/\b(pancakes|bowl|sandwich|burger|card)\b/g, "").replace(/\s+/g, " ").trim()];
  return path ? _toUrl(path) : undefined;
}

export function hydrateMenuItemImage<T extends { name: string; image?: string | null }>(item: T): T & { image?: string } {
  return {
    ...item,
    image: item.image ?? menuImageForName(item.name),
  };
}

export function itemImageBackground(item: Pick<MenuItem, "name" | "category"> & { image?: string | null }): string {
  const image = item.image ?? menuImageForName(item.name);
  if (!image) return categoryGradient(item.category);
  return `${PHOTO_OVERLAY}, url("${image}")`;
}
