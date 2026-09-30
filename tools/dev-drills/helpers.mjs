// Helpers the spec files use.
export const F = (path, lang, lines, flaw = []) => ({ path, lang, lines, flaw, vulnerable: flaw.length > 0 });
export const A = (id, label, request, response, fixedResponse, exploits = false) => ({ id, label, request, response, fixedResponse, exploits });
// kind: true = a right change, 'weak' = plausible but bypassable, false = beside the point.
export const O = (id, label, kind, code, why) => ({ id, label, code, why, good: kind === true, ...(kind === true ? {} : { bad: kind === 'weak' ? 'weak' : 'gap' }) });
