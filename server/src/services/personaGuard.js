// Non-negotiable trust-and-safety/legal requirement (spec Section 3): every UGC/on-model
// generation must present as an adult. This module is the ONLY place that decision is made —
// every call site that could reach a UGC model API must import and call `assertAdultPersona`
// before doing anything else, including before a credit check or a job status transition.
//
// Deliberately an allowlist (exactly the string "adult"), not a denylist: anything missing,
// malformed, wrong-case, or simply unexpected is rejected. There is no configuration path that
// can widen this — it is not exposed as a setting anywhere in the app.

export class PersonaGuardError extends Error {
  constructor(message = 'UGC generation only supports adult persona presentation.') {
    super(message);
    this.name = 'PersonaGuardError';
    this.statusCode = 422;
  }
}

export function isAdultPersona(personaSettings) {
  return Boolean(personaSettings) && personaSettings.ageRange === 'adult';
}

export function assertAdultPersona(personaSettings) {
  if (!isAdultPersona(personaSettings)) {
    throw new PersonaGuardError();
  }
}
