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
  "aglio e olio": "/images/silver/aglio-e-oilio.webp",
  "aglio e oilio": "/images/silver/aglio-e-oilio.webp",
  "alfredo pasta": "/images/silver/alfredo-pasta.webp",
  "avocado quinoa salad": "/images/silver/avocado-quinoa-salad.webp",
  "avocado toast": "/images/silver/avcado-toast.webp",
  "baby corn fritters": "/images/silver/baby-corn-fritters.webp",
  "banana": "/images/silver/banana-panckaes.webp",
  "banana pancakes": "/images/silver/banana-panckaes.webp",
  "berry": "/images/silver/berry-bowl.webp",
  "berry bowl": "/images/silver/berry-bowl.webp",
  "cacao": "/images/silver/cacao-bowl.webp",
  "cacao bowl": "/images/silver/cacao-bowl.webp",
  "cappuccino": "/images/silver/cuppocino.webp",
  "chicken alfredo": "/images/silver/chicken-alfredo.webp",
  "chicken marinara": "/images/silver/chicken-marinara.webp",
  "corn and spinach sandwich": "/images/silver/corn-and-spinach-sandwich.webp",
  "cortado": "/images/silver/cortado.webp",
  "creamy grilled zucchini": "/images/silver/creamy-grilled-zucchini.webp",
  "creme caramel": "/images/silver/creme-caramel.webp",
  "crispy flat bread": "/images/silver/crispy-flat-bread.webp",
  "egg bagel": "/images/silver/egg-bagel.webp",
  "egg spinach toast": "/images/silver/egg-spinach-toast.webp",
  "espresso": "/images/silver/espresso.png",
  "espresso cranberry": "/images/silver/espresso-cranberry.png",
  "espresso lime": "/images/silver/espresso-lime.webp",
  "espresso orange": "/images/silver/espresso-orange.png",
  "espresso tonic": "/images/silver/espresso-tonic.png",
  "feta mousse and greens": "/images/silver/feta-mousse-and-greens.webp",
  "feta mousse greens": "/images/silver/feta-mousse-and-greens.webp",
  "flat white": "/images/silver/flat-white.webp",
  "focaccia chicken": "/images/silver/foccacia-chicken.webp",
  "focaccia mushroom": "/images/silver/foccacia-mushroom.webp",
  "foccacia chicken": "/images/silver/foccacia-chicken.webp",
  "foccacia mushroom": "/images/silver/foccacia-mushroom.webp",
  "french omelette": "/images/silver/french-omlette.webp",
  "french omlette": "/images/silver/french-omlette.webp",
  "french toast": "/images/silver/french-toast.webp",
  "fresh orange juice": "/images/silver/fresh-orange-juice.webp",
  "fresh watermelon juice": "/images/silver/fresh-watermelon-juice.webp",
  "greek yogurt": "/images/silver/greek-yogurt-bowl.webp",
  "greek yogurt bowl": "/images/silver/greek-yogurt-bowl.webp",
  "grilled herb chicken": "/images/silver/grilled-herb-chicken.webp",
  "healthy bowl": "/images/silver/healthy-bowl.webp",
  "hot chocolate": "/images/silver/hot-chocolate.png",
  "iced latte": "/images/silver/iced-latte-iced-mocha.webp",
  "iced long black": "/images/silver/iced-long-black.png",
  "iced matcha latte": "/images/silver/iced-matcha-latte.webp",
  "iced mocha": "/images/silver/iced-latte-iced-mocha.webp",
  "koraput v60": "/images/silver/koraput-v60-card.webp",
  "koraput v60 card": "/images/silver/koraput-v60-card.webp",
  "latte": "/images/silver/cuppocino.webp",
  "liberica v60": "/images/silver/liberica-v60-card.webp",
  "liberica v60 card": "/images/silver/liberica-v60-card.webp",
  "long black": "/images/silver/long-black.webp",
  "matcha latte": "/images/silver/matcha-latte.webp",
  "mocha": "/images/silver/mocha.webp",
  "nashville burger": "/images/silver/nashville-burger.webp",
  "nashville chicken": "/images/silver/nashville-burger.webp",
  "nutella cruffin": "/images/silver/nutella-cruffin.webp",
  "original": "/images/silver/original-panckakes.webp",
  "original pancakes": "/images/silver/original-panckakes.webp",
  "pb and j": "/images/silver/pb-andj-pancakes.webp",
  "pb j": "/images/silver/pb-andj-pancakes.webp",
  "pbj": "/images/silver/pb-andj-pancakes.webp",
  "peri peri chicken": "/images/silver/peri-peri-chicken-sandwich.webp",
  "peri peri chicken sandwich": "/images/silver/peri-peri-chicken-sandwich.webp",
  "pesto pasta": "/images/silver/pesto-pasta.webp",
  "silver breakfast non veg": "/images/silver/silver-non-veg-bf.webp",
  "silver breakfast veg": "/images/silver/silver-veg-bf.webp",
  "silver cold brew": "/images/silver/silver-cold-brew.png",
  "silver cold coffee": "/images/silver/silver-cold-coffee.png",
  "spanish latte": "/images/silver/spanish-latte.png",
  "tea": "/images/silver/teas.png",
  "teas": "/images/silver/teas.png",
  "turkish eggs": "/images/silver/turkish-eggs.webp",
  "valaparai v60": "/images/silver/valaparai-v60-card.webp",
  "valaparai v60 card": "/images/silver/valaparai-v60-card.webp",
  "vanilla mush": "/images/silver/vanilla-mush.webp",
  "veg burger": "/images/silver/veg-burger.webp",
  "veggie": "/images/silver/veggie-sandwich.webp",
  "veggie bagel": "/images/silver/veggie-bagel.webp",
  "veggie patty": "/images/silver/veg-burger.webp",
  "veggie sandwich": "/images/silver/veggie-sandwich.webp",
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
