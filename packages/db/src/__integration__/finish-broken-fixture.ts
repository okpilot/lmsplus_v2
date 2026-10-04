import { insertExtraQuestion } from './finish-fixture'
import type { ProgressFixture } from './quiz-progress-fixture'

/** A multiple_choice whose answer key 'd' is not among its options (bank data defect). */
export const insertMcKeyNotInOptions = (f: ProgressFixture) =>
  insertExtraQuestion(f, {
    question_type: 'multiple_choice',
    question_text: 'Key not offered',
    options: [
      { id: 'a', text: 'Option A' },
      { id: 'b', text: 'Option B' },
      { id: 'c', text: 'Option C' },
    ],
    correct_option_id: 'd',
  })

/** A dialog_fill whose only blank has no index (bank data defect no CHECK rejects). */
export const insertDialogWithoutIndex = (f: ProgressFixture) =>
  insertExtraQuestion(f, {
    question_type: 'dialog_fill',
    question_text: 'Dialog blank without index',
    dialog_template: '[atc] {{0|cleared}} to land.',
    blanks_config: [{ canonical: 'cleared', synonyms: [] }],
  })

/** A dialog_fill whose only blank has `"synonyms": null` (bank data defect). */
export const insertDialogWithNullSynonyms = (f: ProgressFixture) =>
  insertExtraQuestion(f, {
    question_type: 'dialog_fill',
    question_text: 'Dialog blank with null synonyms',
    dialog_template: '[atc] {{0|cleared}} to land.',
    blanks_config: [{ index: 0, canonical: 'cleared', synonyms: null }],
  })
