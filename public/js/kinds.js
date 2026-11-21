// What each kind of place looks like: a small line drawing for each listing
// (Fast food, Bakeries, Pubs…) and for each place, in the same 24-unit grid,
// stroke and rounded ends as the app's other icons.

export const KIND_GLYPHS = {
  // ---- food
  restaurant: '<path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5M17 21V3c-2.2 1.2-3.5 4-3.5 7.5h3.5"/>', // fork and knife
  fries: '<path d="M6.5 10.5h11l-1.6 10H8.1zM8.6 10.5L7.8 4.5M11 10.5V3.5M13.4 10.5l.6-6M15.6 10.5l1.4-5"/>',
  croissant: '<path d="M2.5 17C4.5 10.5 8 6.5 12 6.5s7.5 4 9.5 10.5c-1.2.9-2.7 1-4 .4L15 14.3c-1-.4-2-.6-3-.6s-2 .2-3 .6L6.5 17.4c-1.3.6-2.8.5-4-.4zM9 7.5l1.5 6.3M15 7.5l-1.5 6.3"/>',
  pizza: '<path d="M4 7.5c5.3-2.6 10.7-2.6 16 0L12 21zM5.6 10.4c4.3-1.9 8.5-1.9 12.8 0"/><circle cx="10.2" cy="12.6" r="1"/><circle cx="13.6" cy="15.4" r="1"/>',
  burger: '<path d="M4.5 11c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6zM4 14.2h16M5 17h14v.4a2.6 2.6 0 0 1-2.6 2.6H7.6A2.6 2.6 0 0 1 5 17.4z"/>',
  noodles: '<path d="M3.5 12h17c0 4.4-3.8 8-8.5 8s-8.5-3.6-8.5-8zM12.5 12l6-8.5M9.5 12l5.5-8M7 12c0-1.5 1-2.5 2.5-2.5"/>',
  sushi: '<ellipse cx="12" cy="8.5" rx="7" ry="3.5"/><ellipse cx="12" cy="8.5" rx="2.8" ry="1.3"/><path d="M5 8.5v7c0 1.9 3.1 3.5 7 3.5s7-1.6 7-3.5v-7"/>',
  dumpling: '<path d="M4 15.5c0-4 3.6-7 8-7s8 3 8 7c0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3zM12 8.5c-1.1-1.4-1.1-3 0-4.5 1.1 1.5 1.1 3.1 0 4.5zM8.6 9.6l1.3 2.2M15.4 9.6l-1.3 2.2"/>',
  drumstick: '<path d="M9.8 14.2c-2.4-2.5-2.1-6.4.6-8.6 2.5-2 6-1.6 8 .8 1.9 2.4 1.5 5.8-.9 7.7-2.3 1.8-5.6 2.2-7.7.1zM9.8 14.2l-3.4 3.4M6.4 17.6a1.7 1.7 0 1 0-1.3 2.9 1.7 1.7 0 1 0 2.9-1.3"/>',
  fish: '<path d="M7.5 12c2-3.3 4.8-5 7.8-5 2.6 0 4.6 1.8 5.7 5-1.1 3.2-3.1 5-5.7 5-3 0-5.8-1.7-7.8-5zM7.5 12L3 8v8zM16.5 11h.01"/>',
  sandwich: '<path d="M3.5 16L18 5.5l2.5 10.5zM3.5 16v3h17v-3M7 14.5c2.2-.8 4.6-.8 6.8 0s4.4.8 6.4 0"/>',
  hotdog: '<path d="M3.5 12.5c0 3.2 1.8 5.5 4.5 5.5h8c2.7 0 4.5-2.3 4.5-5.5M6 8.5h12a2 2 0 0 1 0 4H6a2 2 0 0 1 0-4zM8 10.5l1.5-1 1.5 1 1.5-1 1.5 1 1.5-1"/>',
  chili: '<path d="M15.5 7.5c-3.6.2-5.4 3.3-6.8 6.6C7.3 17.3 5.6 19.5 3.5 20c4.9.8 10.2-1.6 12.4-6 .9-1.9 1.2-3.9.8-5.5zM15.5 7.5c.4-1.6 1.4-2.8 3-3.5M16.7 8.6c1.3-.6 2.6-.4 3.8.4"/>',
  kebab: '<path d="M2.5 12h19"/><rect x="5" y="8" width="3.6" height="8" rx="1.6"/><rect x="10.2" y="8" width="3.6" height="8" rx="1.6"/><rect x="15.4" y="8" width="3.6" height="8" rx="1.6"/>',
  cupcake: '<path d="M6.5 13h11l-1.6 7H8.1zM5.5 13c0-3.8 2.9-6.5 6.5-6.5s6.5 2.7 6.5 6.5M12 6.5V4M10 17v1.5M14 17v1.5"/>',
  donut: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.8"/><path d="M8.2 7.6l1 .7M15.2 7.4l-.7 1M17.2 13.3l-1.1.4M7.4 15.2l1-.6"/>',
  egg: '<path d="M4.6 13c-1.4-3.6 1.2-7.5 5-7.5 1.8 0 2.8.8 4.4.8 3 0 5.5 2.3 5.5 5.3 0 3.6-2.6 6.6-6.6 6.6-1.6 0-2.6.8-4.6.8-2.9 0-5.1-2.9-3.7-6z"/><circle cx="12" cy="11.8" r="2.6"/>',
  leaf: '<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l8-8"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.7 3.2-5.7 3.8-9.8 2.3 1.4 3.4 3.3 3.5 5 1-.6 1.7-1.6 2-3 1.9 1.6 3.7 4.4 3.7 7.8 0 3.6-2.6 6.2-6.5 6.2z"/>',
  // ---- drinks
  coffee: '<path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11.5 3.5v2.5"/>',
  boba: '<path d="M6.5 8h11l-1.4 12.5H7.9zM6 8h12M12.5 8l1.5-5.5M9.6 16.8h.01M12 17.6h.01M14.4 16.8h.01M10.8 14.6h.01M13.2 14.6h.01"/>',
  juice: '<path d="M7 7.5h10l-1.4 13H8.4zM12.5 7.5l1.5-4.5h3M7.5 11.5h9"/>',
  icecream: '<path d="M7.5 10.5a4.5 4.5 0 0 1 9 0zM7.8 10.5l4.2 10 4.2-10"/>',
  wine: '<path d="M8 3.5h8l.4 4a4.4 4.4 0 0 1-8.8 0zM12 12v8M8.5 20.5h7"/>',
  cocktail: '<path d="M4.5 5h15L12 13zM12 13v7M8.5 20.5h7M14.5 9.5l4-6.5"/>',
  beer: '<path d="M5.5 8h10v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19zM15.5 10h1.5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1.5M8.5 11.5v5.5M12.5 11.5v5.5M5.5 8c0-2 1.3-3.5 3-3.5.7-.9 1.8-1.3 3-1.1 1.3.1 2.6 1 3.2 2.2.5.5.8 1.4.8 2.4"/>',
  // ---- fun
  film: '<path d="M4 10.5h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM3.6 10.5L3 7.3 18.3 4.6l.6 3.2zM7.6 6.6l2.3 3.1M12.4 5.7l2.3 3.2"/>',
  music: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  bowling: '<path d="M12 3c1.3 0 2 1 2 2.3 0 1.2-.8 2-.8 3.2 0 1.4 2.3 3 2.3 6.3 0 3-1.4 6.2-3.5 6.2s-3.5-3.2-3.5-6.2c0-3.3 2.3-4.9 2.3-6.3 0-1.2-.8-2-.8-3.2C10 4 10.7 3 12 3zM10.7 9h2.6"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h8.5M17.5 12v3M20.5 12v2.5"/>',
  gamepad: '<path d="M7 8h10a4 4 0 0 1 3.9 4.8l-.8 3.6a2.5 2.5 0 0 1-4.3 1.1L14 15.5h-4l-1.8 2a2.5 2.5 0 0 1-4.3-1.1l-.8-3.6A4 4 0 0 1 7 8zM8 10.5v3.5M6.25 12.25h3.5M15.5 11.5h.01M17.5 13.5h.01"/>',
  golf: '<path d="M8 20V3.5l8.5 3.5L8 10.5M4.5 20.5c2.2-.8 4.8-1.2 7.5-1.2s4.8.4 6.5 1"/>',
  dumbbell: '<path d="M4 9.5v5M7 7v10M17 7v10M20 9.5v5M7 12h10"/>',
  snowflake: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/>',
  wave: '<path d="M3 10c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5M3 15c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/>',
  ferris: '<circle cx="12" cy="10" r="6.5"/><path d="M12 3.5v13M5.5 10h13M7.4 5.4l9.2 9.2M16.6 5.4l-9.2 9.2M12 10l-4 10.5M12 10l4 10.5M6.5 20.5h11"/>',
  paw: '<path d="M8 16.5c0-2.6 1.8-4.5 4-4.5s4 1.9 4 4.5c0 1.5-.9 2.5-2.2 2.5-.8 0-1.2-.4-1.8-.4s-1 .4-1.8.4C8.9 19 8 18 8 16.5z"/><circle cx="6" cy="11" r="1.6"/><circle cx="9.5" cy="6.8" r="1.6"/><circle cx="14.5" cy="6.8" r="1.6"/><circle cx="18" cy="11" r="1.6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
  // ---- culture
  museum: '<path d="M3.5 9.5L12 4.5l8.5 5M5.5 10v8M10 10v8M14 10v8M18.5 10v8M3.5 20h17"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2.2-.6-1.3.2-2.8 1.7-2.8H17a3.5 3.5 0 0 0 3.5-3.5c0-4.8-3.8-8.5-8.5-8.5zM7.5 11h.01M9.5 7.3h.01M14.5 7.3h.01"/>',
  mask: '<path d="M5 5c4.6 1.2 9.4 1.2 14 0v5.5c0 4.4-3.1 8.5-7 8.5s-7-4.1-7-8.5zM8.3 10.3h2M13.7 10.3h2M9.5 14c1.6 1.3 3.4 1.3 5 0"/>',
  book: '<path d="M12 6.5c-2-1.6-4.5-2-8-2v13c3.5 0 6 .4 8 2 2-1.6 4.5-2 8-2v-13c-3.5 0-6 .4-8 2zM12 6.5v13"/>',
  camera: '<path d="M4 8.5h3.5L9 6h6l1.5 2.5H20V19H4z"/><circle cx="12" cy="13.3" r="3.2"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.4"/><path d="M3.5 19c0-3.3 2.4-5.5 5.5-5.5s5.5 2.2 5.5 5.5M14.5 14c3.4-.5 6 1.5 6 4.5"/>',
  // ---- outdoors
  tree: '<path d="M12 21v-5M12 3.5l6.5 9h-13zM12 8.5l7 8h-14z"/>',
  flower: '<path d="M12 21v-8M12 13c-3.3 0-5.5-2.3-5.5-5.8V4l2.7 2L12 3.5 14.8 6l2.7-2v3.2c0 3.5-2.2 5.8-5.5 5.8zM12 18.5c-2.3 0-4.1-1.3-4.6-3.4 2.3 0 4.1 1.3 4.6 3.4zM12 18.5c2.3 0 4.1-1.3 4.6-3.4-2.3 0-4.1 1.3-4.6 3.4z"/>',
  swing: '<path d="M5 20V4.5M19 20V4.5M3.5 4.5h17M9.5 4.5v9M14.5 4.5v9M8.5 13.5h7"/>',
  mountain: '<path d="M3 19.5l6.5-11 4 6 2.5-3.5 5 8.5zM8 11l1.5 1.5L11 11"/>',
  picnic: '<path d="M4 9.5h16M7 9.5L4.5 19M17 9.5l2.5 9.5M5.6 14.5h12.8"/>',
  umbrella: '<path d="M3.5 11.5a8.5 8.5 0 0 1 17 0zM12 11.5v7.5a1.5 1.5 0 0 0 3 0M12 3v1.5"/>',
  // ---- shopping
  bag: '<path d="M5.5 8.5h13l-1 12h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  gift: '<path d="M4 9h16v3.5H4zM5.5 12.5h13V20h-13zM12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10.5 9 12 9c1.5-3.5 5.5-4 5.5-1.5S13.5 9 12 9z"/>',
  shirt: '<path d="M8.5 4L4 6.5l1.8 4 2.2-1V20h8V9.5l2.2 1 1.8-4L15.5 4c-.5 1.5-1.8 2.5-3.5 2.5S9 5.5 8.5 4z"/>',
  cart: '<path d="M3 4.5h2.5l2.2 11h10l2-8H6.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>',
  store: '<path d="M4 9.5L5.5 4h13L20 9.5c0 1.4-1.1 2.5-2.7 2.5S14.7 10.9 14.7 9.5c0 1.4-1.2 2.5-2.7 2.5s-2.7-1.1-2.7-2.5c0 1.4-1.2 2.5-2.6 2.5S4 10.9 4 9.5zM5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
};

// A listing's drawing. (Any other cuisine is a restaurant; anything else, its tab's.)
const GROUP_ICON = {
  Restaurants: 'restaurant', 'Fast food': 'fries', Bakeries: 'croissant', Pizza: 'pizza', Burgers: 'burger',
  Sushi: 'sushi', Japanese: 'sushi', Ramen: 'noodles', Noodles: 'noodles', Chinese: 'noodles', Vietnamese: 'noodles',
  Thai: 'noodles', Asian: 'noodles', Malaysian: 'noodles', Taiwanese: 'noodles', 'Hot pot': 'noodles', Soup: 'noodles',
  Dumplings: 'dumpling', 'Dim sum': 'dumpling', Chicken: 'drumstick', Seafood: 'fish', 'Fish & chips': 'fish', Poké: 'fish',
  Sandwiches: 'sandwich', Bagels: 'sandwich', 'Hot dogs': 'hotdog', Mexican: 'chili', Kebab: 'kebab', Shawarma: 'kebab',
  Falafel: 'kebab', Desserts: 'cupcake', Crêpes: 'cupcake', Doughnuts: 'donut', 'Breakfast & brunch': 'egg', Salads: 'leaf',
  Vegetarian: 'leaf', Vegan: 'leaf', BBQ: 'flame', Steakhouse: 'flame',
  Cafés: 'coffee', 'Coffee & tea shops': 'coffee', Tea: 'coffee', 'Bubble tea': 'boba', 'Juice & smoothies': 'juice',
  'Ice cream': 'icecream', Bars: 'wine', 'Cocktail bars': 'cocktail', Pubs: 'beer', 'Beer gardens': 'beer',
  Cinemas: 'film', Nightclubs: 'music', Bowling: 'bowling', 'Escape rooms': 'key', Arcades: 'gamepad', 'Mini golf': 'golf',
  'Sports & fitness': 'dumbbell', 'Ice skating': 'snowflake', 'Water parks': 'wave', 'Theme parks': 'ferris', Zoos: 'paw',
  Aquariums: 'fish', 'Karaoke Box': 'mic',
  Museums: 'museum', 'Galleries & arts': 'palette', Theatres: 'mask', Libraries: 'book', Attractions: 'camera', 'Community centres': 'people',
  Parks: 'tree', Gardens: 'flower', Playgrounds: 'swing', 'Nature reserves': 'leaf', Viewpoints: 'mountain', 'Picnic spots': 'picnic', Beaches: 'umbrella',
  'Malls & department stores': 'bag', Bookshops: 'book', 'Games & toys': 'gamepad', Music: 'music', Gifts: 'gift', Fashion: 'shirt',
  Groceries: 'cart', Markets: 'store',
};
const TAB_ICON = { food: 'restaurant', drinks: 'coffee', fun: null, culture: 'museum', outdoors: 'tree', shopping: 'bag' };

/** The drawing for a listing ("Fast food", "Pubs", "Italian"); null for one with none of its own (its tab's is used). */
export function groupIcon(tab, group) {
  return GROUP_ICON[group] || (tab === 'food' ? 'restaurant' : TAB_ICON[tab] || null);
}

/** The drawing for a place: its listing's, except a fast-food place listed by a cuisine with no drawing of its own. */
export function placeIcon(p) {
  const icon = groupIcon(p.tab, p.group);
  if (icon === 'restaurant' && p.kind === 'Fast food') return 'fries';
  if (icon === 'restaurant' && p.kind === 'Food court') return 'restaurant';
  return icon;
}
