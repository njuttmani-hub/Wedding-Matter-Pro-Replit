import type { CardStrings } from './types';
import {
  INVITATION_TEMPLATES, RELATION_WORDS, CLOSING_TAGS, KIDS_LINES, PROGRAMME_PRESETS, SALUTATIONS,
} from '../constants';

const byId = <K extends string | number>(list: { id: K; label?: string; name?: string; text?: string }[], key: 'label' | 'name' | 'text') =>
  Object.fromEntries(list.map(x => [x.id, x[key] ?? ''])) as Record<K, string>;

/** English is derived from constants.ts rather than written out again, so the
 *  constants stay the single source of truth for the English card. */
const en: CardStrings = {
  templates: byId(INVITATION_TEMPLATES, 'text'),
  relationWords: byId(RELATION_WORDS, 'label'),
  closingTags: byId(CLOSING_TAGS, 'label'),
  kidsLines: byId(KIDS_LINES, 'label'),
  programmes: byId(PROGRAMME_PRESETS, 'name'),
  salutations: Object.fromEntries(SALUTATIONS.map(s => [s, s])),
  labels: {
    residence: 'Residence:',
    withCompliments: 'With Best Compliments:',
    daughterOf: 'D/o',
    sonOf: 'S/o',
    and: ' & ',
    programmes: 'Programmes',
    timePattern: '{h}:{m} {ampm}',
    am: 'AM',
    pm: 'PM',
    mealFrom: 'from {time} onwards ({meal})',
    dinner: 'dinner',
    lunch: 'lunch',
    sheetInvite: '{hosts} request the pleasure of your presence at the {function} of {couple}',
    note: 'Note',
  },
};

export default en;
