// Draw & Guess words: things a couple can sketch in a few strokes, nothing obscure.
export const DRAW_WORDS = [
  'apple', 'banana', 'bicycle', 'boat', 'book', 'bread', 'bridge', 'butterfly', 'cake', 'camera',
  'candle', 'car', 'castle', 'cat', 'chair', 'cloud', 'coffee', 'cookie', 'crown', 'cup',
  'dog', 'donut', 'door', 'duck', 'egg', 'fish', 'flower', 'guitar', 'hat', 'heart',
  'house', 'ice cream', 'key', 'kite', 'ladder', 'lamp', 'leaf', 'letter', 'moon', 'mountain',
  'mushroom', 'phone', 'piano', 'pizza', 'plane', 'rabbit', 'rain', 'rainbow', 'ring', 'rocket',
  'shoe', 'snail', 'snowman', 'sock', 'star', 'strawberry', 'sun', 'sunflower', 'tent', 'train',
  'tree', 'turtle', 'umbrella', 'whale', 'window', 'clock', 'glasses', 'balloon', 'bee', 'bell',
  'candy', 'carrot', 'chicken', 'church', 'compass', 'envelope', 'feather', 'fork', 'gift', 'globe',
  'hammer', 'island', 'jellyfish', 'lighthouse', 'map', 'mitten', 'owl', 'paintbrush', 'pencil', 'penguin',
  'pie', 'pillow', 'popcorn', 'scarf', 'sandwich', 'ship', 'spoon', 'teapot', 'toothbrush', 'volcano',
];
export const DRAW_ROUNDS = 4;
export const DRAW_SECONDS = 80;
export function normalizeGuess(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}
