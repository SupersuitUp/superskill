import { skillRules } from "./skill.mjs";
import { testedRules } from "./tested.mjs";
import { superskillRules } from "./superskill.mjs";
import { interopRules } from "./interop.mjs";

/** Every rule the doctor runs, in report order. */
export const allRules = [...skillRules, ...testedRules, ...superskillRules, ...interopRules];
