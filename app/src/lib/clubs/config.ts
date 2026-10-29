// The clubs and their promotions. Only our team makes clubs: a new club is a new entry here plus
// its slug in clubs_slugs() (supabase/migrations/0018_clubs.sql). Every company below is
// fictional, and the app tags each promotion "Demo".
//
// Promotions rotate on the 1st: each month a club shows `perMonth` of its pool, moving two places
// along, so a couple are new each month and the rest carry over (rules.ts promotionsFor).
import * as P from '@phosphor-icons/react';
import type { Club, ClubSlug } from './types';

/** The streak at which each slot opens: slot 1 at sign-up, 2 at 14 days ... 6 at 150. Mirrored in SQL. */
export const SLOT_THRESHOLDS = [0, 14, 30, 60, 90, 150] as const;
/** a broken streak pauses the clubs above the slots for this long */
export const COMEBACK_WINDOW_DAYS = 30;
/** days in a row that win every paused club back */
export const COMEBACK_DAYS = 14;
/** promotions move this many places along their pool each month */
export const ROTATE_BY = 2;

export const CLUBS: Club[] = [
  {
    slug: 'travel',
    name: 'Travel Club',
    icon: 'plane',
    colour: 'cer',
    blurb: 'Trains, flights, hostels and everything that gets you out of town.',
    goalIcons: ['plane', 'train', 'beach', 'mountain', 'tent', 'ticket'],
    perMonth: 4,
    pool: [
      { id: 'skyvane-weekend', company: 'Skyvane Air', logo: P.AirplaneTilt, title: 'Weekend city fares', description: 'Return flights to six European cities for weekend trips.', discount: '25% off', conditions: 'Fri to Mon trips, booked at least 14 days ahead.', codeLimit: 200 },
      { id: 'trenola-pass', company: 'Trenola Rail', logo: P.Train, title: 'Student rail pass', description: 'Seven days of unlimited regional trains.', discount: '30% off', conditions: 'Under 26, with a student card.' },
      { id: 'bunkly-nights', company: 'Bunkly Hostels', logo: P.Bed, title: 'Third night free', description: 'Stay three nights in any Bunkly hostel and pay for two.', discount: '1 night free', conditions: 'Dorm beds only, subject to availability.' },
      { id: 'packrook-bags', company: 'Packrook', logo: P.Suitcase, title: 'Cabin backpacks', description: 'A 40 l backpack that fits every low-cost cabin rule.', discount: '20% off', conditions: 'One per order.' },
      { id: 'wandersim-data', company: 'Wandersim', logo: P.SimCard, title: 'Travel eSIM', description: '10 GB of data across the EU for 30 days.', discount: '40% off', conditions: 'First eSIM only.' },
      { id: 'cityloop-cards', company: 'Cityloop', logo: P.Ticket, title: 'City museum cards', description: 'One card for museums and transport in 12 cities.', discount: '15% off', conditions: '48 or 72 hour cards.' },
    ],
  },
  {
    slug: 'erasmus',
    name: 'Erasmus Club',
    icon: 'globe',
    colour: 'soare',
    blurb: 'A semester abroad: a room, a language and a first month that adds up.',
    goalIcons: ['globe', 'grad'],
    perMonth: 5,
    pool: [
      { id: 'dormella-rooms', company: 'Dormella Housing', logo: P.House, title: 'No booking fee', description: 'Student rooms in 40 university cities, without the booking fee.', discount: 'Fee waived', conditions: 'Stays of at least 4 months.' },
      { id: 'parlami-course', company: 'Parlami Languages', logo: P.Translate, title: 'Language crash course', description: 'Eight live lessons before you leave, in 9 languages.', discount: '35% off', conditions: 'Beginner and A2 levels.' },
      { id: 'kitbox-moving', company: 'Kitbox Movers', logo: P.Truck, title: 'Send two boxes abroad', description: 'Door-to-door delivery for two 20 kg boxes.', discount: '20% off', conditions: 'Within the EU.' },
      { id: 'unipass-transit', company: 'Unipass', logo: P.Bus, title: 'Airport transfer', description: 'A shared ride from the airport to your new address.', discount: '50% off', conditions: 'Booked 48 hours ahead.' },
      { id: 'forkly-meals', company: 'Forkly', logo: P.ForkKnife, title: 'First-week meal box', description: 'Five easy dinners for your first week, delivered.', discount: '30% off', conditions: 'First order only.' },
      { id: 'idcraft-card', company: 'IDCraft', logo: P.IdentificationCard, title: 'International student card', description: 'Student discounts in 130 countries for a year.', discount: '10 lei off', conditions: 'Valid student ID needed.' },
    ],
  },
  {
    slug: 'tech',
    name: 'Tech Club',
    icon: 'laptop',
    colour: 'liliac',
    blurb: 'Laptops, phones, headphones and the courses that make them pay off.',
    goalIcons: ['laptop', 'phone', 'headphones', 'game', 'camera', 'watch'],
    perMonth: 4,
    pool: [
      { id: 'voltbyte-student', company: 'Voltbyte', logo: P.Laptop, title: 'Student laptops', description: 'Selected 14 inch laptops for study and code.', discount: '12% off', conditions: 'Student email needed.', codeLimit: 150 },
      { id: 'pixelnest-repair', company: 'Pixelnest Repairs', logo: P.Wrench, title: 'Screen repair', description: 'Phone and laptop screen repairs, done in a day.', discount: '25% off', conditions: 'Parts and labour.' },
      { id: 'hushwave-audio', company: 'Hushwave', logo: P.Headphones, title: 'Noise-cancelling headphones', description: 'Over-ear headphones with 40 hours of battery.', discount: '20% off', conditions: 'One per customer.' },
      { id: 'codecrate-course', company: 'Codecrate', logo: P.Code, title: 'Web dev course', description: 'Twelve weeks of projects, from HTML to your first app.', discount: '40% off', conditions: 'Self-paced plan.' },
      { id: 'cloudnook-storage', company: 'Cloudnook', logo: P.Cloud, title: '1 TB cloud storage', description: 'Back up your thesis, photos and everything else.', discount: '6 months free', conditions: 'Yearly plan.' },
      { id: 'keyrise-keys', company: 'Keyrise', logo: P.Keyboard, title: 'Mechanical keyboards', description: 'Quiet mechanical keyboards for long study nights.', discount: '15% off', conditions: 'While stock lasts.' },
    ],
  },
  {
    slug: 'first-apartment',
    name: 'First Apartment Club',
    icon: 'couch',
    colour: 'coral',
    blurb: 'Moving out: the deposit, a bed, a pan and a lamp that works.',
    goalIcons: ['home', 'couch'],
    perMonth: 4,
    pool: [
      { id: 'nestwell-furniture', company: 'Nestwell', logo: P.Couch, title: 'First-home furniture', description: 'Sofas, desks and shelves for small rooms.', discount: '15% off', conditions: 'Orders over 500 lei.' },
      { id: 'lumenly-lamps', company: 'Lumenly', logo: P.Lamp, title: 'Desk and floor lamps', description: 'Warm LED lamps that last 10 years.', discount: '2 for 1', conditions: 'Same model.' },
      { id: 'brewnook-kitchen', company: 'Brewnook', logo: P.CookingPot, title: 'Starter kitchen set', description: 'Pans, pots and knives: the 12 things a kitchen needs.', discount: '30% off', conditions: 'Online only.' },
      { id: 'tidyfox-clean', company: 'Tidyfox', logo: P.Broom, title: 'Move-in clean', description: 'A deep clean before you unpack.', discount: '25% off', conditions: 'Flats up to 60 square metres.' },
      { id: 'plantpal-greens', company: 'Plantpal', logo: P.Plant, title: 'Hard-to-kill plants', description: 'Three plants that survive exam season.', discount: '20% off', conditions: 'Delivery included.' },
      { id: 'snugrest-mattress', company: 'Snugrest', logo: P.Bed, title: 'Foam mattresses', description: 'A 100-night trial on single and double mattresses.', discount: '20% off', conditions: 'One per household.', codeLimit: 100 },
    ],
  },
  {
    slug: 'my-car',
    name: 'My Car Club',
    icon: 'car',
    colour: 'trandafir',
    blurb: 'Lessons, the licence, a first car and keeping it on the road.',
    goalIcons: ['car', 'scooter', 'bike'],
    perMonth: 3,
    pool: [
      { id: 'drivora-lessons', company: 'Drivora School', logo: P.SteeringWheel, title: 'Driving lessons', description: 'A package of 30 lessons with exam prep.', discount: '10% off', conditions: 'Paid in full upfront.' },
      { id: 'fuelfox-fuel', company: 'Fuelfox', logo: P.GasPump, title: 'Fuel discount', description: 'Money off every litre for a month.', discount: '20 bani a litre', conditions: 'Up to 100 litres.' },
      { id: 'gearlab-service', company: 'Gearlab Service', logo: P.Wrench, title: 'First check-up', description: 'Oil, filters and a 40 point check.', discount: '25% off', conditions: 'Cars up to 15 years old.' },
      { id: 'parkzen-parking', company: 'Parkzen', logo: P.MapPin, title: 'Monthly parking', description: 'A reserved spot near campus.', discount: 'First month half price', conditions: 'Three month minimum.' },
      { id: 'shieldway-cover', company: 'Shieldway', logo: P.ShieldCheck, title: 'Young driver cover', description: 'Car insurance for drivers in their first two years.', discount: '15% off', conditions: 'Annual policies.' },
      { id: 'washwave-wash', company: 'Washwave', logo: P.Drop, title: 'Car wash pass', description: 'Four washes, inside and out.', discount: '1 free', conditions: 'Within 90 days.' },
    ],
  },
  {
    slug: 'emergency-fund',
    name: 'Emergency Fund Club',
    icon: 'buoy',
    colour: 'menta',
    blurb: 'For the surprises: a broken phone, a dentist, a month between jobs.',
    goalIcons: ['buoy', 'shield', 'piggy'],
    perMonth: 3,
    pool: [
      { id: 'steadyleaf-cover', company: 'Steadyleaf', logo: P.Umbrella, title: 'Gadget insurance', description: 'Cover for your phone and laptop against drops and theft.', discount: '3 months free', conditions: 'Yearly plan.' },
      { id: 'medinest-pharmacy', company: 'Medinest Pharmacy', logo: P.FirstAidKit, title: 'First aid kit', description: 'A complete kit for your room or your bag.', discount: '25% off', conditions: 'In store and online.' },
      { id: 'fixmate-repairs', company: 'Fixmate', logo: P.Hammer, title: 'Home repairs callout', description: 'A handyman for leaks, locks and broken shelves.', discount: 'Free callout', conditions: 'Labour from 60 lei.' },
      { id: 'budgetly-coach', company: 'Budgetly', logo: P.ChartLineUp, title: 'Money coaching', description: 'Two sessions on budgeting with a certified coach.', discount: '50% off', conditions: 'Online sessions.' },
      { id: 'safebox-storage', company: 'Safebox', logo: P.Archive, title: 'Storage between flats', description: 'A small storage unit for when you move.', discount: 'First month free', conditions: 'Two month minimum.' },
      { id: 'calmline-talk', company: 'Calmline', logo: P.Heart, title: 'Talk to someone', description: 'Short video sessions with a counsellor.', discount: '40% off', conditions: 'First three sessions.' },
    ],
  },
];

export const CLUB_BY_SLUG: Record<ClubSlug, Club> = Object.fromEntries(CLUBS.map((c) => [c.slug, c])) as Record<ClubSlug, Club>;
