// Данные поля. Здесь можно править названия, цены и ренты.
// rent: [без домов, 1 дом, 2 дома, 3 дома, 4 дома, отель]

const START_MONEY = 1500;
const GO_BONUS = 200;
const JAIL_FINE = 50;

const GROUPS = {
  brown:  { name: 'Коричневая', color: '#8a4b2a', house: 50 },
  light:  { name: 'Голубая',    color: '#7cc8f0', house: 50 },
  pink:   { name: 'Розовая',    color: '#d63a8f', house: 100 },
  orange: { name: 'Оранжевая',  color: '#f28a1c', house: 100 },
  red:    { name: 'Красная',    color: '#e3262f', house: 150 },
  yellow: { name: 'Жёлтая',     color: '#f5d21c', house: 150 },
  green:  { name: 'Зелёная',    color: '#1d9e55', house: 200 },
  blue:   { name: 'Синяя',      color: '#1f5fbf', house: 200 },
};

const BOARD = [
  { t: 'start',    name: 'Старт', short: 'Старт' },
  { t: 'street',   name: 'Улица Житная', short: 'Житная', g: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250] },
  { t: 'chest',    name: 'Благотворительный фонд', short: 'Фонд' },
  { t: 'street',   name: 'Улица Маркова', short: 'Маркова', g: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450] },
  { t: 'tax',      name: 'Подоходный налог', short: 'Налог', amount: 200 },
  { t: 'station',  name: 'Венский вокзал', short: 'Венский вкз', price: 200 },
  { t: 'street',   name: 'Улица Авангардная', short: 'Авангардная', g: 'light', price: 100, rent: [6, 30, 90, 270, 400, 550] },
  { t: 'chance',   name: 'Шанс', short: 'Шанс' },
  { t: 'street',   name: 'Улица Огарёва', short: 'Огарёва', g: 'light', price: 100, rent: [6, 30, 90, 270, 400, 550] },
  { t: 'street',   name: 'Проспект Республики', short: 'Пр. Республики', g: 'light', price: 120, rent: [8, 40, 100, 300, 450, 600] },
  { t: 'jail',     name: 'Тюрьма', short: 'Тюрьма' },
  { t: 'street',   name: 'Улица Лесная', short: 'Лесная', g: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750] },
  { t: 'utility',  name: 'Электростанция', short: 'Электро&shy;станция', price: 150 },
  { t: 'street',   name: 'Улица Луговая', short: 'Луговая', g: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750] },
  { t: 'street',   name: 'Ростовская набережная', short: 'Ростовская наб.', g: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900] },
  { t: 'station',  name: 'Рижский вокзал', short: 'Рижский вкз', price: 200 },
  { t: 'street',   name: 'Рязанский проспект', short: 'Рязанский пр.', g: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950] },
  { t: 'chest',    name: 'Благотворительный фонд', short: 'Фонд' },
  { t: 'street',   name: 'Бульвар Санкт-Мишель', short: 'Санкт-Мишель', g: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950] },
  { t: 'street',   name: 'Площадь Пиги', short: 'Пл. Пиги', g: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000] },
  { t: 'parking',  name: 'Бесплатная стоянка', short: 'Стоянка' },
  { t: 'street',   name: 'Проспект Пушкина', short: 'Пр. Пушкина', g: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050] },
  { t: 'chance',   name: 'Шанс', short: 'Шанс' },
  { t: 'street',   name: 'Улица Пушкинская', short: 'Пушкинская', g: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050] },
  { t: 'street',   name: 'Проспект Маяковского', short: 'Пр. Маяковского', g: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100] },
  { t: 'station',  name: 'Кутузовский вокзал', short: 'Кутузовский вкз', price: 200 },
  { t: 'street',   name: 'Улица Панфилова', short: 'Панфилова', g: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
  { t: 'street',   name: 'Улица Чайковского', short: 'Чайковского', g: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
  { t: 'utility',  name: 'Водопровод', short: 'Водопровод', price: 150 },
  { t: 'street',   name: 'Улица Центральная', short: 'Центральная', g: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200] },
  { t: 'gotojail', name: 'Отправляйтесь в тюрьму', short: 'В тюрьму!' },
  { t: 'street',   name: 'Брейтсвилл проспект', short: 'Брейтсвилл пр.', g: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
  { t: 'street',   name: 'Малый проспект', short: 'Малый пр.', g: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
  { t: 'chest',    name: 'Благотворительный фонд', short: 'Фонд' },
  { t: 'street',   name: 'Ботанический бульвар', short: 'Ботанический бул.', g: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400] },
  { t: 'station',  name: 'Центральный вокзал', short: 'Центральный вкз', price: 200 },
  { t: 'chance',   name: 'Шанс', short: 'Шанс' },
  { t: 'street',   name: 'Проспект Елисейские поля', short: 'Елисейские поля', g: 'blue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
  { t: 'tax',      name: 'Сверхналог', short: 'Сверхналог', amount: 100 },
  { t: 'street',   name: 'Улица Мира', short: 'Улица Мира', g: 'blue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000] },
];

const STATION_RENT = [0, 25, 50, 100, 200];
const UTILITY_MULT = [0, 4, 10];

const TOKENS = {
  heart: { name: 'Сердце',  color: '#e8436b' },
  car:   { name: 'Машина',  color: '#2f7de1' },
  ship:  { name: 'Корабль', color: '#0f9a9a' },
  hat:   { name: 'Шляпа',   color: '#7b52d6' },
};

// Купюры для набора суммы
const BILLS = [
  { v: 1,   bg: '#ffffff', fg: '#333' },
  { v: 5,   bg: '#f6b6c8', fg: '#5a1730' },
  { v: 10,  bg: '#fbe27a', fg: '#4d3d00' },
  { v: 20,  bg: '#9fdc8e', fg: '#173d10' },
  { v: 50,  bg: '#8cc4f2', fg: '#0d3050' },
  { v: 100, bg: '#e8d2a6', fg: '#4a3510' },
  { v: 500, bg: '#f7a65a', fg: '#4f2400' },
];
