import type { LangCode } from '../languages';
import type { CardTranslation } from './types';
import en from './en';
import mr from './mr';
import hi from './hi';
import gu from './gu';
import pa from './pa';
import bn from './bn';
import ta from './ta';
import te from './te';
import kn from './kn';
import ml from './ml';

export { en };
export type { CardStrings, CardLabels, CardTranslation } from './types';

/** All card wording per language; English is complete, the rest may be partial. */
export const TRANSLATIONS: Record<LangCode, CardTranslation> = { en, mr, hi, gu, pa, bn, ta, te, kn, ml };
