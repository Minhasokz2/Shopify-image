import { describe, it, expect } from 'vitest';
import { assertAdultPersona, isAdultPersona, PersonaGuardError } from '../../src/services/personaGuard.js';

describe('personaGuard', () => {
  it('accepts exactly ageRange: "adult"', () => {
    expect(() => assertAdultPersona({ ageRange: 'adult', genderPresentation: 'feminine', setting: 'home' })).not.toThrow();
    expect(isAdultPersona({ ageRange: 'adult' })).toBe(true);
  });

  const rejectedInputs = [
    ['undefined ageRange', { genderPresentation: 'feminine', setting: 'home' }],
    ['null ageRange', { ageRange: null }],
    ['empty string', { ageRange: '' }],
    ['whitespace', { ageRange: '   ' }],
    ['wrong case', { ageRange: 'Adult' }],
    ['teen', { ageRange: 'teen' }],
    ['minor', { ageRange: 'minor' }],
    ['numeric', { ageRange: 18 }],
    ['null personaSettings', null],
    ['undefined personaSettings', undefined],
    ['empty object', {}],
  ];

  it.each(rejectedInputs)('rejects %s', (_label, personaSettings) => {
    expect(() => assertAdultPersona(personaSettings)).toThrow(PersonaGuardError);
    expect(isAdultPersona(personaSettings)).toBe(false);
  });

  it('throws a PersonaGuardError with a 422 status code', () => {
    try {
      assertAdultPersona({ ageRange: 'teen' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PersonaGuardError);
      expect(error.statusCode).toBe(422);
    }
  });
});
