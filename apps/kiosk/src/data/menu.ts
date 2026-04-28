export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  category: string;
}

export interface OrderItem extends MenuItem {
  quantity: number;
}

export const menuCategories = ["Mains", "Sides", "Desserts", "Drinks"] as const;

export const menuItems: MenuItem[] = [
  {
    id: "1",
    name: "Cheeseburger",
    price: 8.0,
    description: "Angus beef patty, aged cheddar, lettuce, tomato, house sauce",
    image: "/images/burger.jpg",
    category: "Mains",
  },
  {
    id: "2",
    name: "Margherita Pizza",
    price: 12.0,
    description: "San Marzano tomato, buffalo mozzarella, fresh basil",
    image: "/images/pizza.jpg",
    category: "Mains",
  },
  {
    id: "3",
    name: "Grilled Salmon",
    price: 18.0,
    description: "Atlantic salmon, herb butter, seasonal vegetables",
    image: "/images/salmon.jpg",
    category: "Mains",
  },
  {
    id: "4",
    name: "Caesar Salad",
    price: 9.0,
    description: "Romaine, parmesan, croutons, anchovy dressing",
    image: "/images/salad.jpg",
    category: "Sides",
  },
  {
    id: "5",
    name: "Truffle Fries",
    price: 6.0,
    description: "Hand-cut fries, truffle oil, parmesan, herbs",
    image: "/images/fries.jpg",
    category: "Sides",
  },
  {
    id: "6",
    name: "Chocolate Lava Cake",
    price: 10.0,
    description: "Warm chocolate fondant, raspberry coulis, vanilla cream",
    image: "/images/dessert.jpg",
    category: "Desserts",
  },
  {
    id: "7",
    name: "Ribeye Steak",
    price: 28.0,
    description: "12oz dry-aged ribeye, garlic butter, roasted potatoes",
    image: "/images/burger.jpg",
    category: "Mains",
  },
  {
    id: "8",
    name: "Lobster Risotto",
    price: 24.0,
    description: "Arborio rice, lobster tail, saffron, parmesan cream",
    image: "/images/salmon.jpg",
    category: "Mains",
  },
  {
    id: "9",
    name: "Chicken Teriyaki",
    price: 14.0,
    description: "Grilled chicken thigh, teriyaki glaze, steamed rice",
    image: "/images/burger.jpg",
    category: "Mains",
  },
  {
    id: "10",
    name: "Mushroom Pasta",
    price: 13.0,
    description: "Pappardelle, wild mushrooms, truffle cream, herbs",
    image: "/images/pizza.jpg",
    category: "Mains",
  },
  {
    id: "11",
    name: "Tuna Tartare",
    price: 16.0,
    description: "Fresh ahi tuna, avocado, sesame, ponzu dressing",
    image: "/images/salmon.jpg",
    category: "Mains",
  },
  {
    id: "12",
    name: "Garlic Bread",
    price: 5.0,
    description: "Sourdough, roasted garlic butter, mozzarella",
    image: "/images/fries.jpg",
    category: "Sides",
  },
  {
    id: "13",
    name: "Onion Rings",
    price: 6.5,
    description: "Beer-battered, chipotle aioli dipping sauce",
    image: "/images/fries.jpg",
    category: "Sides",
  },
  {
    id: "14",
    name: "Grilled Asparagus",
    price: 7.0,
    description: "Charred asparagus, lemon zest, hollandaise",
    image: "/images/salad.jpg",
    category: "Sides",
  },
  {
    id: "15",
    name: "Sweet Potato Wedges",
    price: 5.5,
    description: "Roasted wedges, smoked paprika, sour cream",
    image: "/images/fries.jpg",
    category: "Sides",
  },
  {
    id: "16",
    name: "Tiramisu",
    price: 9.0,
    description: "Espresso-soaked ladyfingers, mascarpone, cocoa",
    image: "/images/dessert.jpg",
    category: "Desserts",
  },
  {
    id: "17",
    name: "Crème Brûlée",
    price: 8.5,
    description: "Vanilla custard, caramelized sugar, fresh berries",
    image: "/images/dessert.jpg",
    category: "Desserts",
  },
  {
    id: "18",
    name: "Mango Sorbet",
    price: 6.0,
    description: "Tropical mango, lime zest, mint garnish",
    image: "/images/dessert.jpg",
    category: "Desserts",
  },
  {
    id: "19",
    name: "Sparkling Water",
    price: 3.0,
    description: "San Pellegrino, served chilled with lemon",
    image: "/images/salad.jpg",
    category: "Drinks",
  },
  {
    id: "20",
    name: "Espresso",
    price: 3.5,
    description: "Double shot, single origin, rich crema",
    image: "/images/dessert.jpg",
    category: "Drinks",
  },
  {
    id: "21",
    name: "Fresh Lemonade",
    price: 4.5,
    description: "House-squeezed, honey, sparkling or still",
    image: "/images/salad.jpg",
    category: "Drinks",
  },
];
