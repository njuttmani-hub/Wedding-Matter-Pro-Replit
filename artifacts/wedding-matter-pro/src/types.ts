export interface Palette {
  bg1: string;
  bg2: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primaryDark: string;
  gold: string;
  goldLight: string;
  goldDeep: string;
  accent: string;
  ink: string;
  /** Text/icon colour that sits ON a primary or gold fill. The Midnight theme
   *  fills buttons with champagne, so that text must be near-black; the light
   *  theme fills with deep bronze, so it must be white. */
  onAccent: string;
}

export interface PersonInfo {
  name: string;
  // Salutations removed from bride/groom own name
  fatherName: string;
  fatherPrefix: string;       // Shri, Mr., etc.
  motherName: string;
  motherPrefix: string;       // Smt., Mrs., etc.
  // Grandparents split into grandfather + grandmother
  grandfatherName: string;
  grandfatherPrefix: string;
  grandmotherName: string;
  grandmotherPrefix: string;
}

export interface Programme {
  id: number;
  preset: string;
  name: string;
  date: string;
  hour: string;    // 1–12
  minute: string;  // 00, 05 … 55
  ampm: 'AM' | 'PM';
  venue: string;
  address: string;
  mealType?: 'none' | 'dinner' | 'lunch';
  /** Optional line printed on this function's own sheet: dress code,
   *  "Lunch to follow", an RSVP name and number. Absent on older forms. */
  note?: string;
}

/** The printed card's trim size. Always stored in inches whatever the customer
 *  typed; `unit` only remembers which unit to show back to them. `preset` is a
 *  CARD_SIZES id, or 'custom' when they entered their own dimensions. */
export interface CardSize {
  preset: string;
  widthIn: number;
  heightIn: number;
  unit: 'in' | 'cm';
}

export interface FormState {
  bride: PersonInfo;
  groom: PersonInfo;
  aboveWeds: 'bride' | 'groom';   // which name appears above the relation word
  family: {
    title: string;
    nativePlace: string;
    residenceAddress: string;
  };
  hostType: string;
  childRelation: string;
  deities: string[];
  selectedTemplate: number | null;
  relationWord: string;
  closingTag: string;
  kidsLine: string;
  kidsCustom: string;             // the couple's own kids line, used when kidsLine === 'custom'
  programmes: Programme[];
  withCompliments: string;
  blessingsOnly: boolean;
  /** The customer's own text in the card's script, per language code, keyed
   *  by field path ('bride.name', 'programme.<id>.venue' …). Suggested from
   *  the English by transliteration, then editable. Kept per language so
   *  switching Marathi → Gujarati → Marathi doesn't lose their corrections.
   *  Read it through scriptText() in lib/cardText.ts. Absent on older forms. */
  scriptText?: Record<string, Record<string, string>>;
  design: {
    /** A LangCode from data/languages.ts ('en', 'mr' …). Older forms hold
     *  'English'; read it through langOf() in lib/cardText.ts. */
    language: string;
    headingFont: string;
    bodyFont: string;
    scriptFont: string;
    fontSize: number;
    letterSpacing: number;
    lineHeight: number;
    layout: string;
    cardSize: CardSize;
    /** 'combined': page 1 invitation + page 2 listing every programme.
     *  'separate': page 1 invitation + one sheet per programme. */
    pageMode: 'combined' | 'separate';
  };
  preview: { device: string };
  meta: { accepted: boolean };
}

export interface SubmittedOrder {
  orderId: string;
  at: string;
  couple: string;
  form: FormState;
  status: 'New' | 'In Progress' | 'Completed';
}
