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
}

export interface PersonInfo {
  name: string;
  namePrefix: string;          // e.g. "Kumari", "Shri" — user writes freely
  fatherName: string;
  fatherPrefix: string;        // e.g. "Shri", "Late Shri"
  motherName: string;
  motherPrefix: string;        // e.g. "Smt.", "Late Smt."
  grandparents: string;
  grandparentsPrefix: string;  // e.g. "Late Shri & Smt."
}

export interface Programme {
  id: number;
  preset: string;
  name: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  notes: string;
}

export interface FormState {
  bride: PersonInfo;
  groom: PersonInfo;
  brideFirst: boolean;          // true = bride on top, false = groom on top
  family: {
    surname: string;
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
  programmes: Programme[];
  withCompliments: string;
  blessingsOnly: boolean;
  design: {
    language: string;
    headingFont: string;
    bodyFont: string;
    scriptFont: string;
    fontSize: number;
    letterSpacing: number;
    lineHeight: number;
    layout: string;
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
