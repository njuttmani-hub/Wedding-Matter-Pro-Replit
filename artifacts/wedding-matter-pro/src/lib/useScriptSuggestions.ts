import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormState } from '../types';
import { langOf } from './cardText';
import { scriptFields, scriptValue } from './scriptFields';
import { transliterate } from './transliterate';

export type SuggestState = 'pending' | 'failed';

export interface ScriptSuggestions {
  /** Whether a path's suggestion is on its way or couldn't be made, for the
   *  card's current language. Undefined once it has landed (or isn't needed). */
  statusOf: (path: string) => SuggestState | undefined;
  /** Throws away the customer's own version of a path and suggests it afresh. */
  resuggest: (path: string) => void;
  /** Sets the customer's own version of a path. */
  setValue: (path: string, value: string) => void;
}

/** Keeps `form.scriptText` filled with transliterations of everything that
 *  prints, for whichever language the card is in. Lives in CustomerFlow rather
 *  than in the names editor, because most of those values are typed on other
 *  steps (a venue on Events, compliments on Extras) and still need suggesting.
 *
 *  It only ever writes a path that is empty or still holds exactly the last
 *  suggestion it made there (`form.scriptAuto`), so a customer's correction is
 *  never overwritten — not even when the English it came from changes. */
export function useScriptSuggestions(form: FormState, setForm: React.Dispatch<React.SetStateAction<FormState>>): ScriptSuggestions {
  const lang = langOf(form);
  const code = lang.code;
  const itc = lang.inputTools;
  const [status, setStatus] = useState<Record<string, SuggestState>>({});
  // English that failed per `${code}|${path}`, so a failure isn't retried on
  // every keystroke elsewhere — only once that field's English changes, or the
  // connection comes back.
  const failed = useRef(new Map<string, string>());
  const [online, setOnline] = useState(0);

  useEffect(() => {
    const back = () => { failed.current.clear(); setOnline(n => n + 1); };
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);

  const fields = scriptFields(form);
  // What the effect depends on: each field's English and current value.
  const sig = JSON.stringify([code, online, fields.map(f => [f.path, f.english, scriptValue(form, f.path, code)])]);

  useEffect(() => {
    if (code === 'en' || !itc) return;
    const todo = fields.filter(f => {
      const cur = scriptValue(form, f.path, code);
      const auto = form.scriptAuto?.[code]?.[f.path];
      const untouched = !cur.trim() || (!!auto && cur === auto.out);
      if (!untouched) return false;                                  // the customer's own
      if (auto && auto.src === f.english && cur === auto.out) return false;  // already current
      return failed.current.get(`${code}|${f.path}`) !== f.english;
    });
    if (!todo.length) return;

    const ctrl = new AbortController();
    const mark = (paths: string[], s: SuggestState | undefined) => setStatus(prev => {
      const next = { ...prev };
      for (const p of paths) { if (s) next[`${code}|${p}`] = s; else delete next[`${code}|${p}`]; }
      return next;
    });
    mark(todo.map(f => f.path), 'pending');
    // Debounced: typing a name shouldn't send a request per letter.
    const timer = setTimeout(async () => {
      const results = await Promise.all(todo.map(async f => ({ f, out: await transliterate(f.english, itc, ctrl.signal) })));
      if (ctrl.signal.aborted) return;   // superseded by a newer edit, which re-runs this
      const bad = results.filter(r => r.out === null);
      for (const r of bad) failed.current.set(`${code}|${r.f.path}`, r.f.english);
      mark(results.filter(r => r.out !== null).map(r => r.f.path), undefined);
      mark(bad.map(r => r.f.path), 'failed');
      const good = results.filter((r): r is { f: typeof r.f; out: string } => r.out !== null);
      if (!good.length && !bad.length) return;
      setForm(prev => {
        // Re-check against the latest form: the customer may have typed into
        // the script field, or changed the English, while this was in flight.
        const current = new Map(scriptFields(prev).map(f => [f.path, f.english]));
        const text = { ...prev.scriptText?.[code] };
        const auto = { ...prev.scriptAuto?.[code] };
        let changed = false;
        for (const { f, out } of good) {
          if (current.get(f.path) !== f.english) continue;
          const cur = text[f.path] ?? '';
          if (cur.trim() && cur !== auto[f.path]?.out) continue;
          text[f.path] = out;
          auto[f.path] = { src: f.english, out };
          changed = true;
        }
        // A failed re-suggestion must not leave the old one printing for the
        // new English ("शर्मा" under a name now typed "Gupta"): an untouched
        // stale suggestion is cleared, so the card falls back to the English
        // and the editor asks the customer to type it.
        for (const { f } of bad) {
          const a = auto[f.path];
          if (a && a.src !== f.english && text[f.path] === a.out) {
            delete text[f.path]; delete auto[f.path];
            changed = true;
          }
        }
        if (!changed) return prev;
        return {
          ...prev,
          scriptText: { ...prev.scriptText, [code]: text },
          scriptAuto: { ...prev.scriptAuto, [code]: auto },
        };
      });
    }, 550);
    return () => {
      clearTimeout(timer); ctrl.abort();
      // Drop this run's spinners; the next run marks whatever it still sends.
      setStatus(prev => {
        const next = { ...prev };
        for (const f of todo) if (next[`${code}|${f.path}`] === 'pending') delete next[`${code}|${f.path}`];
        return next;
      });
    };
    // `sig` captures everything the filter reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, itc]);

  const statusOf = useCallback((path: string) => status[`${code}|${path}`], [status, code]);

  const setValue = useCallback((path: string, value: string) => {
    setForm(prev => ({ ...prev, scriptText: { ...prev.scriptText, [code]: { ...prev.scriptText?.[code], [path]: value } } }));
  }, [setForm, code]);

  const resuggest = useCallback((path: string) => {
    failed.current.delete(`${code}|${path}`);
    // Emptying it is enough: an empty path is always re-suggested.
    setForm(prev => {
      const text = { ...prev.scriptText?.[code] };
      const auto = { ...prev.scriptAuto?.[code] };
      delete text[path]; delete auto[path];
      return { ...prev, scriptText: { ...prev.scriptText, [code]: text }, scriptAuto: { ...prev.scriptAuto, [code]: auto } };
    });
    setOnline(n => n + 1);   // re-run even if nothing else in the signature changed
  }, [setForm, code]);

  return { statusOf, resuggest, setValue };
}
