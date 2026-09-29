/**
 * Custom recipes ("My recipes"): public types, parsing of API responses and
 * building of the PATCH payload. Ported from cookidoo-api (helpers.py and
 * Cookidoo._build_custom_recipe_payload / _process_recipe_steps).
 */

/** Allows the known values while still accepting new ones Vorwerk may add. */
type Loose<T extends string> = T | (string & {});

export type MachineType = Loose<'TM5' | 'TM6' | 'TM7' | 'TM31'>;
export type Speed = Loose<
  | 'soft'
  | '0.5' | '1' | '1.5' | '2' | '2.5' | '3' | '3.5' | '4' | '4.5' | '5'
  | '5.5' | '6' | '6.5' | '7' | '7.5' | '8' | '8.5' | '9' | '9.5' | '10'
>;
export type Direction = Loose<'CW' | 'CCW'>;
/** Degrees Celsius as a string ("37" … "120") or "varoma". */
export type Temperature = Loose<
  | 'varoma'
  | '37' | '40' | '45' | '50' | '55' | '60' | '65' | '70' | '75' | '80'
  | '85' | '90' | '95' | '98' | '100' | '105' | '110' | '115' | '120'
>;
export type Mode = Loose<
  'dough' | 'browning' | 'turbo' | 'steaming' | 'blend' | 'warm_up' | 'rice_cooker'
>;
export type BrowningPower = Loose<'Gentle' | 'Intense'>;
export type SteamingAccessory = Loose<'Varoma' | 'SimmeringBasket' | 'VaromaAndSimmeringBasket'>;

/** `unit` defaults to "C"; pass `null` to omit it. Ignored for "varoma". */
export type TemperatureSetting = { value: number | Temperature; unit?: string | null };

/**
 * Annotations highlight a piece of a step's text (`slot`, which must appear
 * verbatim in the text) and attach data to it, e.g. an ingredient or Thermomix
 * settings the app can pre-load.
 */
export type IngredientAnnotation = {
  type: 'INGREDIENT';
  slot: string;
  /** Must be one of the recipe's `ingredients`, verbatim. */
  description: string;
  name?: string;
};

/** Time/temperature/speed settings. */
export type TTSAnnotation = {
  type: 'TTS';
  slot: string;
  /** Seconds. */
  time?: number;
  temperature?: TemperatureSetting;
  speed?: Speed;
  direction?: Direction;
  name?: string;
};

/** A guided cooking mode (dough, browning, steaming…). */
export type ModeAnnotation = {
  type: 'MODE';
  slot: string;
  mode: Mode;
  /** Seconds. */
  time?: number;
  temperature?: TemperatureSetting;
  speed?: Speed;
  direction?: Direction;
  power?: BrowningPower;
  accessory?: SteamingAccessory;
  name?: string;
};

/**
 * Any annotation this library doesn't model (or models with a different
 * shape), kept as-is so updating a recipe doesn't lose it.
 */
export type OtherAnnotation = {
  type: 'OTHER';
  /** The API's annotation type, e.g. "INGREDIENT" with a structured description. */
  rawType: string;
  slot: string;
  data: Record<string, unknown>;
  name?: string;
};

export type Annotation = IngredientAnnotation | TTSAnnotation | ModeAnnotation | OtherAnnotation;

export type StepSettings = {
  /** Seconds. */
  time?: number;
  temperature?: number | Temperature;
  speed?: number | Speed;
};

/** A step: plain text, or text with settings and annotations. */
export type Instruction =
  | string
  | { text: string; settings?: StepSettings; annotations?: Annotation[] };

export type CustomRecipe = {
  id: string;
  name: string;
  ingredients: string[];
  instructions: Instruction[];
  servingSize: number;
  /** E.g. "portion". */
  unitText: string;
  /** Seconds. */
  activeTime: number;
  /** Seconds. */
  totalTime: number;
  tools: MachineType[];
  hints: string[];
  /** Display URL (large), or null. */
  image: string | null;
  /** Display URL (small), or null. */
  thumbnail: string | null;
  imageOwnedByUser: boolean;
  /** Link to the recipe on the Cookidoo website. */
  url: string;
  /** E.g. "PRIVATE". */
  workStatus: string;
  requiresAnnotationsCheck: boolean;
};

export type NewCustomRecipe = {
  name: string;
  ingredients: string[];
  instructions: Instruction[];
  servingSize: number;
  /** Seconds. */
  totalTime: number;
  /** Seconds; must not exceed `totalTime`. */
  activeTime: number;
  /** Default: ["TM7"]. */
  tools?: MachineType[];
  /** Default: "portion". */
  unitText?: string;
  /** A customer-recipe image path or filename (not a display URL). */
  image?: string;
  hints?: string[];
  /** Default: "PRIVATE". */
  workStatus?: string;
  requiresAnnotationsCheck?: boolean;
};

/** Fields left out keep their current value. */
export type CustomRecipeUpdate = Partial<NewCustomRecipe> & { imageOwnedByUser?: boolean };

/** Local validation failed; nothing was sent to Cookidoo. */
export class RecipeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeValidationError';
  }
}

/**
 * The recipe was created on Cookidoo but filling in its content (or reloading
 * it) failed. The empty recipe stays in the account: retry with
 * `updateCustomRecipe(recipeId, …)` or delete it. `cause` holds the original
 * error (possibly an AuthRequiredError).
 */
export class IncompleteCustomRecipeError extends Error {
  readonly recipeId: string;
  constructor(recipeId: string, cause: unknown) {
    super(`Custom recipe ${recipeId} was created but could not be filled in`, { cause });
    this.name = 'IncompleteCustomRecipeError';
    this.recipeId = recipeId;
  }
}

// ---------------------------------------------------------------------------
// Images

const IMAGE_RE = /^((prod|nonprod)\/img\/customer-recipe\/)?[A-Za-z0-9_-]+\.(bmp|jpe|jpeg|jpg|png)$/;
const IMAGE_PATH_RE = /(?:^|\/)((?:prod|nonprod)\/img\/customer-recipe\/[A-Za-z0-9_-]+\.(?:bmp|jpe|jpeg|jpg|png))$/;

export function validateImage(image: string | undefined): void {
  if (image !== undefined && !IMAGE_RE.test(image)) {
    throw new RecipeValidationError(
      'Custom recipe image must be a Cookidoo customer-recipe path or filename ' +
        '(bmp, jpe, jpeg, jpg, png), not a CDN/display URL.',
    );
  }
}

/** Recovers the customer-recipe image path from a path, filename or display URL. */
export function imageForPayload(image: string | null | undefined): string | null {
  if (!image) return null;
  if (IMAGE_RE.test(image)) return image;
  let path: string;
  try {
    path = new URL(image).pathname;
  } catch {
    return null;
  }
  return IMAGE_PATH_RE.exec(path)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Parsing API responses (the API answers in two shapes: schema.org-like from
// "add from", and structured objects from list/get)

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const int = (v: unknown): number | undefined => (Number.isInteger(v) ? (v as number) : undefined);

/** Seconds from a number or an ISO 8601 duration such as "PT1H30M". */
export function durationToSeconds(value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value !== 'string' || !value) return 0;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    value,
  );
  if (!m) return 0;
  const [d, h, min, s] = m.slice(1).map((x) => Number(x ?? 0));
  return Math.trunc(d * 86400 + h * 3600 + min * 60 + s);
}

function parseTemperature(v: unknown): TemperatureSetting | undefined {
  if (!isObj(v)) return undefined;
  const value = v.value;
  if (typeof value !== 'string' && !Number.isInteger(value)) return undefined;
  return { value: value as number | string, unit: str(v.unit) ?? null };
}

/** Drops undefined values, so parsed objects compare cleanly and serialize compactly. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function parseAnnotation(v: unknown, text: string): Annotation | null {
  if (!isObj(v)) return null;
  const rawType = v.type;
  const data = v.data;
  if (typeof rawType !== 'string' || !isObj(data)) return null;
  let slot = '';
  if (isObj(v.position)) {
    const offset = int(v.position.offset);
    const length = int(v.position.length);
    if (offset !== undefined && length !== undefined) slot = text.slice(offset, offset + length);
  }
  const name = str(v.name);
  if (rawType === 'INGREDIENT' && typeof data.description === 'string') {
    return compact({ type: 'INGREDIENT' as const, slot, description: data.description, name });
  }
  if (rawType === 'TTS') {
    return compact({
      type: 'TTS' as const,
      slot,
      time: int(data.time),
      temperature: parseTemperature(data.temperature),
      speed: str(data.speed),
      direction: str(data.direction),
      name,
    });
  }
  if (rawType === 'MODE') {
    const mode = name || data.mode || '';
    return compact({
      type: 'MODE' as const,
      slot,
      mode: typeof mode === 'string' ? mode : JSON.stringify(mode),
      time: int(data.time),
      temperature: parseTemperature(data.temperature),
      speed: str(data.speed),
      direction: str(data.direction),
      power: str(data.power),
      accessory: str(data.accessory),
      name,
    });
  }
  return compact({ type: 'OTHER' as const, rawType, slot, data: { ...data }, name });
}

function parseInstructions(value: unknown): Instruction[] {
  if (!Array.isArray(value)) return [];
  const out: Instruction[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (!isObj(item) || typeof item.text !== 'string') continue;
    const text = item.text;
    const time = int(item.time);
    const temperature = typeof item.temperature === 'string' || Number.isInteger(item.temperature)
      ? (item.temperature as string | number)
      : undefined;
    const speed = typeof item.speed === 'string' || typeof item.speed === 'number' ? item.speed : undefined;
    const settings = [time, temperature, speed].some((x) => x !== undefined)
      ? compact({ time, temperature, speed })
      : undefined;
    const annotations = Array.isArray(item.annotations)
      ? item.annotations.map((a) => parseAnnotation(a, text)).filter((a): a is Annotation => a !== null)
      : [];
    out.push(compact({ text, settings, annotations }));
  }
  return out;
}

function parseIngredients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((i: unknown) => (isObj(i) ? i.text : i))
    .filter((t): t is string => typeof t === 'string');
}

/** `siteUrl` is the localization's apiEndpoint, used to build `url`. */
export function parseCustomRecipe(json: unknown, siteUrl: string, language: string): CustomRecipe {
  if (!isObj(json) || typeof json.recipeId !== 'string' || !isObj(json.recipeContent)) {
    throw new Error('Unexpected custom recipe response');
  }
  const c = json.recipeContent;
  const rawImage = str(c.image);
  const yieldObj = isObj(c.recipeYield) ? c.recipeYield : isObj(c.yield) ? c.yield : {};
  const hints = Array.isArray(c.hints)
    ? c.hints.filter((h): h is string => typeof h === 'string')
    : typeof c.hints === 'string'
      ? c.hints.split(/\r?\n/)
      : [];
  const tools = Array.isArray(c.tool) && c.tool.length ? c.tool : Array.isArray(c.tools) ? c.tools : [];
  const metadata = isObj(c.recipeMetadata) ? c.recipeMetadata : {};
  const nonEmpty = (a: unknown, b: unknown) => (Array.isArray(a) && a.length ? a : b);
  return {
    id: json.recipeId,
    name: str(c.name) ?? '',
    ingredients: parseIngredients(nonEmpty(c.recipeIngredient, c.ingredients)),
    instructions: parseInstructions(nonEmpty(c.instructions, c.recipeInstructions)),
    servingSize: int(yieldObj.value) ?? 0,
    unitText: str(yieldObj.unitText) ?? 'portion',
    activeTime: durationToSeconds(c.prepTime),
    totalTime: durationToSeconds(c.totalTime),
    tools: tools.filter((t): t is string => typeof t === 'string'),
    hints,
    image: rawImage ? rawImage.replace('{transformation}', 't_web_rdp_recipe_584x480_1_5x') : null,
    thumbnail: rawImage ? rawImage.replace('{transformation}', 't_web_shared_recipe_221x240') : null,
    imageOwnedByUser: c.isImageOwnedByUser === true,
    url: `${new URL(siteUrl).origin}/created-recipes/${language}/${json.recipeId}`,
    workStatus: str(json.workStatus) ?? 'PRIVATE',
    requiresAnnotationsCheck: metadata.requiresAnnotationsCheck === true,
  };
}

// ---------------------------------------------------------------------------
// Building the PATCH payload

function temperatureToJson(t: TemperatureSetting): Json {
  const value = String(t.value).toLowerCase() === 'varoma' ? 'varoma' : t.value;
  const unit = t.unit === undefined ? 'C' : t.unit;
  return value !== 'varoma' && unit !== null ? { value, unit } : { value };
}

function checkTime(time: number | undefined, what: string): void {
  if (time !== undefined && time < 0) throw new RecipeValidationError(`${what} time must not be negative.`);
}

function annotationToJson(a: Annotation, text: string, ingredients: string[], step: number): Json {
  if (!a.slot) throw new RecipeValidationError(`Step ${step + 1}: annotation slot must not be empty.`);
  const offset = text.indexOf(a.slot);
  if (offset < 0) {
    throw new RecipeValidationError(`Step ${step + 1}: annotation slot '${a.slot}' not found in step text: '${text}'`);
  }
  let type: string;
  let data: Json;
  let name = a.name;
  switch (a.type) {
    case 'INGREDIENT':
      if (!ingredients.includes(a.description)) {
        throw new RecipeValidationError(
          `Step ${step + 1}: ingredient '${a.description}' is used in an annotation but is not in the recipe's ingredient list.`,
        );
      }
      type = 'INGREDIENT';
      data = { description: a.description };
      break;
    case 'TTS':
      checkTime(a.time, 'Annotation');
      type = 'TTS';
      data = compact({
        time: a.time,
        temperature: a.temperature && temperatureToJson(a.temperature),
        speed: a.speed,
        direction: a.direction,
      });
      break;
    case 'MODE':
      checkTime(a.time, 'Annotation');
      type = 'MODE';
      data = compact({
        time: a.time,
        temperature: a.temperature && temperatureToJson(a.temperature),
        speed: a.speed,
        direction: a.direction,
        power: a.power,
        accessory: a.accessory,
      });
      name = a.name ?? a.mode;
      break;
    case 'OTHER':
      if (!a.rawType) throw new RecipeValidationError('Annotation type must not be empty.');
      type = a.rawType;
      data = { ...a.data };
      break;
  }
  const out: Json = { type, data, position: { offset, length: a.slot.length } };
  if (name) out.name = name;
  return out;
}

export function instructionsToJson(steps: Instruction[], ingredients: string[]): Json[] {
  return steps.map((step, i) => {
    if (typeof step === 'string') return { type: 'STEP', text: step };
    const out: Json = { type: 'STEP', text: step.text };
    const s = step.settings;
    if (s) {
      checkTime(s.time, 'Instruction');
      Object.assign(out, compact({ time: s.time, temperature: s.temperature, speed: s.speed }));
    }
    if (step.annotations?.length) {
      out.annotations = step.annotations.map((a) => annotationToJson(a, step.text, ingredients, i));
    }
    return out;
  });
}

type PayloadInput = Required<Omit<NewCustomRecipe, 'image'>> & {
  image: string | null;
  imageOwnedByUser: boolean;
};

/** Builds and validates the full PATCH payload. */
export function buildCustomRecipePayload(r: PayloadInput): Json {
  if (!r.name.trim()) throw new RecipeValidationError('Recipe name must not be empty.');
  if (!(r.servingSize > 0)) throw new RecipeValidationError('Recipe servings must be greater than zero.');
  if (r.activeTime < 0 || r.totalTime < 0) throw new RecipeValidationError('Recipe times must not be negative.');
  if (r.activeTime > r.totalTime) throw new RecipeValidationError('Active time must not exceed total time.');
  if (!r.unitText.trim()) throw new RecipeValidationError('Recipe unit text must not be empty.');
  const image = imageForPayload(r.image);
  return {
    name: r.name,
    image,
    isImageOwnedByUser: image !== null ? r.imageOwnedByUser : false,
    tools: r.tools,
    yield: { value: r.servingSize, unitText: r.unitText },
    prepTime: r.activeTime,
    cookTime: r.totalTime - r.activeTime,
    totalTime: r.totalTime,
    ingredients: r.ingredients.map((text) => ({ type: 'INGREDIENT', text })),
    instructions: instructionsToJson(r.instructions, r.ingredients),
    hints: r.hints.join('\n'),
    workStatus: r.workStatus,
    recipeMetadata: { requiresAnnotationsCheck: r.requiresAnnotationsCheck },
  };
}
