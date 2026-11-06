import { describe, expect, it } from 'vitest';
import {
  MATERIALS_DETAIL_HINT,
  MAX_PHOTOS_TO_MODEL,
  MAX_QUESTIONS,
  QUESTION_CATEGORIES,
  SECTIONS,
} from './constants';

describe('client notes constants', () => {
  it('caps questions at 4 and photos sent to the model at 4', () => {
    expect(MAX_QUESTIONS).toBe(4);
    expect(MAX_PHOTOS_TO_MODEL).toBe(4);
  });

  it('section menu is exactly the fixed headings, in output order', () => {
    expect(SECTIONS).toEqual([
      { id: 'work_performed', heading: 'Work performed' },
      { id: 'crew', heading: 'Who did the work' },
      { id: 'materials_used', heading: 'Materials used from our stock' },
      { id: 'protection', heading: 'Protection set up' },
      { id: 'debris_removal', heading: 'Garbage and debris removed' },
      { id: 'other', heading: 'Other notes' },
    ]);
  });

  it('question wording is exactly the P3.1 text', () => {
    expect(QUESTION_CATEGORIES).toEqual([
      { id: 'crew', question: 'Would you like to add who did this work?' },
      { id: 'materials_used', question: 'Would you like to add the materials you used from our stock?' },
      { id: 'protection', question: 'Would you like to add any protection that was set up (floors, walls, doors)?' },
      { id: 'debris_removal', question: 'Would you like to add any garbage or debris that was thrown away?' },
    ]);
  });

  it('question ids are all section ids', () => {
    const sectionIds = new Set<string>(SECTIONS.map((s) => s.id));
    for (const q of QUESTION_CATEGORIES) {
      expect(sectionIds.has(q.id)).toBe(true);
    }
  });

  it('materials detail hint is exactly the P3.1 text', () => {
    expect(MATERIALS_DETAIL_HINT).toBe('Which materials and how much?');
  });

  it('contains no closing line, company name, broom-clean text or term replacement', () => {
    const everything = JSON.stringify({ SECTIONS, QUESTION_CATEGORIES, MATERIALS_DETAIL_HINT });
    expect(everything).not.toMatch(/L & D|Construction Group|broom|Prime Woodworking|Ram Board|further clarification/i);
  });
});
