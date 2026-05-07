export const CATEGORY_GRADIENTS: Record<string, string> = {
  "All Day Breakfast": "linear-gradient(135deg, #f8c58d 0%, #f4956a 100%)",
  "Silver Breakfast": "linear-gradient(135deg, #f0d89a 0%, #e8a55c 100%)",
  "Smoothie Bowls": "linear-gradient(135deg, #a8e6cf 0%, #56c596 100%)",
  "Pancakes": "linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)",
  "Fries": "linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)",
  "Sandwiches": "linear-gradient(135deg, #d4a574 0%, #b8845a 100%)",
  "Focaccia": "linear-gradient(135deg, #deb887 0%, #c4975a 100%)",
  "Burgers": "linear-gradient(135deg, #e8a87c 0%, #d4624a 100%)",
  "Pastas": "linear-gradient(135deg, #f9c78c 0%, #e8926a 100%)",
  "Hot Coffee": "linear-gradient(135deg, #c8a97e 0%, #8b5e3c 100%)",
  "Signature Coffee": "linear-gradient(135deg, #b8956a 0%, #7a4e2a 100%)",
  "Iced Coffee": "linear-gradient(135deg, #a8d8ea 0%, #5ba4cf 100%)",
  "Tea & Chocolate": "linear-gradient(135deg, #c8b5a0 0%, #8b7355 100%)",
  "Desserts": "linear-gradient(135deg, #f9d4d4 0%, #e8a0b0 100%)",
};

export const GRADIENT_FALLBACK = "linear-gradient(135deg, #e8d5c4, #c4a882)";

export function categoryGradient(category: string): string {
  return CATEGORY_GRADIENTS[category] ?? GRADIENT_FALLBACK;
}
