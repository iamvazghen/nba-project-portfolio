/* tslint:disable */
/* eslint-disable */

/**
 * Single game. Returns [homeWinPct, expectedMargin, homeScore, awayScore].
 */
export function simulate_game(home_rating: number, away_rating: number, sims: number): Float64Array;

/**
 * Playoffs from fixed seeds. `east`/`west` are 8 team indices in seed order.
 * Returns, for each of the 16 seeds (east then west), [champPct, finalsPct] (16*2 flat).
 */
export function simulate_playoffs_from_seeds(east: Uint32Array, west: Uint32Array, ratings: Float64Array, sims: number): Float64Array;

/**
 * Full season + playoffs. Returns per team [projWins, finalsPct, champPct] (n*3 flat).
 */
export function simulate_playoffs_full(ratings: Float64Array, conf: Uint32Array, home: Uint32Array, away: Uint32Array, sims: number): Float64Array;

/**
 * Full-season seeding sim. Returns per team [projWins, playoffPct, top6Pct, avgSeed] (n*4 flat).
 */
export function simulate_season(ratings: Float64Array, conf: Uint32Array, home: Uint32Array, away: Uint32Array, sims: number): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly simulate_game: (a: number, b: number, c: number) => [number, number];
    readonly simulate_playoffs_from_seeds: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly simulate_playoffs_full: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly simulate_season: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
