/**
 * Custom recipes ("My recipes"): public types, parsing of API responses and
 * building of the PATCH payload. Ported from cookidoo-api (helpers.py and
 * Cookidoo._build_custom_recipe_payload / _process_recipe_steps).
 */

/** Allows the known values while still accepting new ones Vorwerk may add. */
type Loose<T extends string> = T | (string & {});

export type MachineType = Loose<'TM5' | 'TM6' | 'TM7' | 'TM31'>;
/**
 * The yield unit. Cookidoo only accepts a fixed list (anything else is an
 * HTTP 400); these are the values seen in real recipes so far. Free text like
 * "loaf" is rejected, so use e.g. 12 × "slice" instead.
 */
/**
 * The yield units of Cookidoo's recipe editor (read from its web editor, 2026-10-05), with the
 * names its Spanish site shows: portion "ración", slice "porción", piece "trozo", gram, litre,
 * ounce, cup "taza", glass "vaso", bottle "frasco", jar "tarro". Cookidoo rejects any other
 * text with HTTP 400; the type stays open in case it adds more.
 */
export const YIELD_UNITS = [
  'portion',
  'slice',
  'piece',
  'gram',
  'litre',
  'ounce',
  'cup',
  'glass',
  'bottle',
  'jar',
] as const;
export type YieldUnit = Loose<(typeof YIELD_UNITS)[number]>;

/** The largest yield Cookidoo's editor accepts; amounts go in quarters (1.5 litres, 2.75 jars). */
export const MAX_YIELD = 9999;
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
  unitText: YieldUnit;
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
  /**
   * Whether the user declared they own the photo's rights (Cookidoo asks for
   * this before sharing a recipe publicly). Read from `isImageCopyrightOwned`.
   */
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
  /** Default: "portion". Must be one of Cookidoo's units (see YieldUnit). */
  unitText?: YieldUnit;
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

/** True for a display URL of a photo uploaded to "My recipes" (as opposed to a Vorwerk recipe photo). */
export function isCustomerImageUrl(image: string): boolean {
  return /\/(?:prod|nonprod)\/img\/customer-recipe\//.test(image);
}

// ---------------------------------------------------------------------------
// Photo uploads

export type ImageMimeType = 'image/jpeg' | 'image/png';

/**
 * A photo to upload with `uploadCustomRecipeImage`.
 *
 * - **Node** (or anywhere with a full `Blob`): pass the file's bytes in `data`.
 * - **Expo (SDK 57+)**: pass an expo-file-system `File` in `data`. Expo's fetch
 *   reads it from disk; it can't upload `{ uri }` form parts.
 * - **React Native's own fetch**: pass the file's `uri`. Its FormData reads the
 *   file from disk itself. `size` (bytes, e.g. the picker's `fileSize`) lets
 *   the size limit be checked before anything is sent.
 *
 * `fileName` defaults to "recipe.jpg" / "recipe.png".
 */
export type RecipeImage = { mimeType: ImageMimeType; fileName?: string } & (
  | { data: Blob | ArrayBuffer | Uint8Array; uri?: never; size?: never }
  | { uri: string; size?: number; data?: never }
);

/**
 * The largest photo accepted. Cookidoo doesn't document a limit; 10 MB is
 * Cloudinary's default for images, so bigger files would likely be rejected
 * after the signature request.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES: Record<ImageMimeType, { ext: string; magic: number[]; label: string }> = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff], label: 'JPEG' },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], label: 'PNG' },
};

/**
 * A Blob, or an object that implements one without extending the global Blob, like
 * expo-file-system's `File`: Expo's fetch uploads it as it is (its `bytes()`).
 */
function isBlobLike(data: unknown): data is Blob {
  if (data instanceof Blob) return true;
  if (typeof data !== 'object' || data === null) return false;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return false;
  const d = data as { size?: unknown; arrayBuffer?: unknown };
  return typeof d.size === 'number' && typeof d.arrayBuffer === 'function';
}

function imageBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Checks a photo before uploading it; throws RecipeValidationError. */
export function validateRecipeImage(image: RecipeImage): void {
  const type = Object.hasOwn(IMAGE_TYPES, image.mimeType) ? IMAGE_TYPES[image.mimeType] : undefined;
  if (!type) throw new RecipeValidationError('Recipe photos must be JPEG or PNG (image/jpeg, image/png).');
  if ((image.data === undefined) === (image.uri === undefined)) {
    throw new RecipeValidationError('Pass either `data` or `uri` for the recipe photo.');
  }
  if (image.fileName !== undefined && !image.fileName.trim()) {
    throw new RecipeValidationError('The photo file name must not be empty.');
  }
  let size: number | undefined;
  if (image.uri !== undefined) {
    if (typeof image.uri !== 'string' || !image.uri.trim()) {
      throw new RecipeValidationError('The photo uri must not be empty.');
    }
    size = image.size;
  } else if (isBlobLike(image.data)) {
    size = image.data.size;
  } else if (image.data !== undefined) {
    const bytes = imageBytes(image.data);
    size = bytes.length;
    if (size > 0 && !type.magic.every((b, i) => bytes[i] === b)) {
      throw new RecipeValidationError(`The photo is not a ${type.label} file (mimeType is ${image.mimeType}).`);
    }
  }
  if (size === 0) throw new RecipeValidationError('The photo is empty.');
  if (size !== undefined && size > MAX_IMAGE_BYTES) {
    throw new RecipeValidationError(`The photo is larger than 10 MB (${String(size)} bytes).`);
  }
}

/** The minimal FormData surface `appendImageFile` needs (Node's and React Native's both fit). */
export type FormLike = { append(name: string, value: never, fileName?: string): void };

/**
 * Adds the photo to a multipart form as `file`. A `uri` goes in as React
 * Native's `{ uri, name, type }` file part; bytes go in as a Blob.
 */
export function appendImageFile(form: FormLike, image: RecipeImage): void {
  const name = image.fileName ?? `recipe.${IMAGE_TYPES[image.mimeType].ext}`;
  const append = form.append.bind(form) as (name: string, value: unknown, fileName?: string) => void;
  if (image.uri !== undefined) {
    append('file', { uri: image.uri, name, type: image.mimeType });
  } else if (isBlobLike(image.data)) {
    append('file', image.data, name);
  } else if (image.data !== undefined) {
    // Copy into a fresh ArrayBuffer-backed view: Blob only takes those.
    append('file', new Blob([new Uint8Array(imageBytes(image.data))], { type: image.mimeType }), name);
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
    servingSize: typeof yieldObj.value === 'number' && Number.isFinite(yieldObj.value) ? yieldObj.value : 0,
    unitText: str(yieldObj.unitText) ?? 'portion',
    activeTime: durationToSeconds(c.prepTime),
    totalTime: durationToSeconds(c.totalTime),
    tools: tools.filter((t): t is string => typeof t === 'string'),
    hints,
    image: rawImage ? rawImage.replace('{transformation}', 't_web_rdp_recipe_584x480_1_5x') : null,
    thumbnail: rawImage ? rawImage.replace('{transformation}', 't_web_shared_recipe_221x240') : null,
    // Written as isImageOwnedByUser; Cookidoo reads it back as isImageCopyrightOwned.
    imageOwnedByUser: (c.isImageOwnedByUser ?? c.isImageCopyrightOwned) === true,
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
  if (r.servingSize > MAX_YIELD) {
    throw new RecipeValidationError(`Recipe servings must be at most ${String(MAX_YIELD)}.`);
  }
  if (!Number.isInteger(r.servingSize * 4)) {
    throw new RecipeValidationError('Recipe servings must be a multiple of 0.25 (e.g. 1.5).');
  }
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
