export const NOTE_TAKERS = ['Brianna', 'Victor', 'Scott'] as const;

export type NoteTaker = (typeof NOTE_TAKERS)[number];
