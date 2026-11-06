/**
 * Fixed values for client notes. The model never chooses question wording or
 * section headings; they come from this file.
 */

/** Most clarify questions asked per note. */
export const MAX_QUESTIONS = 4;

/** Most photos passed to the model per note. */
export const MAX_PHOTOS_TO_MODEL = 4;

/** Fixed heading menu, in output order. */
export const SECTIONS = [
  { id: 'work_performed', heading: 'Work performed' },
  { id: 'crew', heading: 'Who did the work' },
  { id: 'materials_used', heading: 'Materials used from our stock' },
  { id: 'protection', heading: 'Protection set up' },
  { id: 'debris_removal', heading: 'Garbage and debris removed' },
  { id: 'other', heading: 'Other notes' },
] as const;

/**
 * The only things the assistant may ask about, with their wording. The
 * `crew`, `materials_used`, `protection` and `debris_removal` ids are also
 * section ids.
 */
export const QUESTION_CATEGORIES = [
  { id: 'crew', question: 'Would you like to add who did this work?' },
  {
    id: 'materials_used',
    question: 'Would you like to add the materials you used from our stock?',
  },
  {
    id: 'protection',
    question: 'Would you like to add any protection that was set up (floors, walls, doors)?',
  },
  {
    id: 'debris_removal',
    question: 'Would you like to add any garbage or debris that was thrown away?',
  },
] as const;

/**
 * Shown after a Yes on `materials_used`, asking for a short detail. The spec
 * puts this hint in P3.1 but not in the { id, question } shape, so it is its
 * own export.
 */
export const MATERIALS_DETAIL_HINT = 'Which materials and how much?';
