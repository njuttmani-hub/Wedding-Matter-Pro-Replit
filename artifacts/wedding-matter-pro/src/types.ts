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

export interface UploadedImage {
  id: string;
  dataUrl: string;
  name: string;
}

export interface DesignPage {
  id: string;
  image: UploadedImage;
  command: string;   // what matter goes on this page / where
}

export interface UploadOrderData {
  brideName: string;
  groomName: string;
  contact: string;
  formPhotos: UploadedImage[];
  designPages: DesignPage[];
  notes: string;
  generatedForm?: FormState;   // AI-generated matter preview (from photos)
}

export interface SubmittedOrder {
  orderId: string;
  at: string;
  couple: string;
  mode: 'type' | 'upload';
  form?: FormState;          // present when mode === 'type'
  upload?: UploadOrderData;  // present when mode === 'upload'
  status: 'New' | 'In Progress' | 'Completed';
}
