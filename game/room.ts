import * as C from './constants';

import { BufferObject } from '~/lib/schema/buffer-object';
import type { BufferView } from '~/lib/schema/buffer-view';
import { withOverlay } from '~/lib/schema';
import { accumulate, concatInPlace } from '~/lib/utility';
import { Process, ProcessorSpecification, Tick } from '~/engine/processor/bind';
import type { shape } from '~/engine/schema/room';
import { iteratee } from '~/engine/util/iteratee';

import { gameContext } from './context';
import { chainIntentChecks, RoomObject } from './objects/room-object';
import { fetchArguments, iterateNeighbors, RoomPosition } from './position';
import * as PathFinder from './path-finder';
import { getTerrainForRoom } from './map';
import { isBorder, isNearBorder } from './terrain';

import { ConstructionSite, ConstructibleStructureType } from './objects/construction-site';
import { Creep } from './objects/creep';
import { Source } from './objects/source';
import { Structure } from './objects/structures';
import { StructureController } from './objects/structures/controller';
import { StructureExtension } from './objects/structures/extension';
import { StructureSpawn } from './objects/structures/spawn';

export const Objects = Symbol('objects');
export type AnyRoomObject = InstanceType<typeof Room>[typeof Objects][number];
export type FindPathOptions = PathFinder.RoomSearchOptions & {
	serialize?: boolean;
};
export type RoomFindOptions = {
	filter?: string | object | ((object: RoomObject) => boolean);
};

export class Room extends withOverlay<typeof shape>()(BufferObject) {
	controller?: StructureController;
	[Process]?: ProcessorSpecification<this>['process'];
	[Tick]?: ProcessorSpecification<this>['tick'];

	energyAvailable = 0;
	energyCapacityAvailable = 0;

	#constructionSites: ConstructionSite[] = [];
	#creeps: Creep[] = [];
	#sources: Source[] = [];
	#structures: Structure[] = [];

	constructor(view: BufferView, offset = 0) {
		super(view, offset);
		for (const object of this[Objects]) {
			object.room = this;
			if (object instanceof Structure) {
				this.#structures.push(object);
				if (object instanceof StructureController) {
					this.controller = object;
				} else if (object instanceof StructureExtension || object instanceof StructureSpawn) {
					this.energyAvailable += object.store[C.RESOURCE_ENERGY];
					this.energyCapacityAvailable += object.store.getCapacity(C.RESOURCE_ENERGY);
				}
			} else if (object instanceof Creep) {
				this.#creeps.push(object);
			} else if (object instanceof Source) {
				this.#sources.push(object);
			} else if (object instanceof ConstructionSite) {
				this.#constructionSites.push(object);
			}
		}
	}

	/**
	 * Find all objects of the specified type in the room. Results are cached automatically for the
	 * specified room and type before applying any custom filters. This automatic cache lasts until
	 * the end of the tick.
	 * @param type One of the FIND_* constants
	 * @param opts
	 */
	#findCache = new Map<number, RoomObject[]>();
	find(
		type: typeof C.FIND_CREEPS | typeof C.FIND_MY_CREEPS | typeof C.FIND_HOSTILE_CREEPS,
		options?: RoomFindOptions): Creep[];
	find(
		type: typeof C.FIND_STRUCTURES | typeof C.FIND_MY_STRUCTURES | typeof C.FIND_HOSTILE_STRUCTURES,
		options?: RoomFindOptions): Structure[];
	find(
		type: typeof C.FIND_CONSTRUCTION_SITES | typeof C.FIND_MY_CONSTRUCTION_SITES | typeof C.FIND_HOSTILE_CONSTRUCTION_SITES,
		options?: RoomFindOptions): ConstructionSite[];
	find(
		type: typeof C.FIND_SOURCES | typeof C.FIND_SOURCES_ACTIVE,
		options?: RoomFindOptions): Source[];
	find(type: number, options: RoomFindOptions = {}) {
		// Check find cache
		let results = this.#findCache.get(type);
		if (results === undefined) {

			// Generate list
			results = (() => {
				switch (type) {
					case C.FIND_CONSTRUCTION_SITES: return this.#constructionSites;
					case C.FIND_MY_CONSTRUCTION_SITES: return this.#constructionSites.filter(constructionSite => constructionSite.my);
					case C.FIND_HOSTILE_CONSTRUCTION_SITES: return this.#constructionSites.filter(constructionSite => !constructionSite.my);

					case C.FIND_CREEPS: return this.#creeps;
					case C.FIND_MY_CREEPS: return this.#creeps.filter(creep => creep.my);
					case C.FIND_HOSTILE_CREEPS: return this.#creeps.filter(creep => !creep.my);

					case C.FIND_SOURCES: return this.#sources;
					case C.FIND_SOURCES_ACTIVE: return this.#sources.filter(source => source.energy > 0);

					case C.FIND_STRUCTURES: return this.#structures;
					case C.FIND_MY_STRUCTURES: return this.#structures.filter(structure => structure.my);
					case C.FIND_HOSTILE_STRUCTURES: return this.#structures.filter(structure => !structure.my);

					default: return [];
				}
			})() as RoomObject[];

			// Add to cache
			this.#findCache.set(type, results);
		}

		// Copy or filter result
		return options.filter === undefined ? results.slice() : results.filter(iteratee(options.filter));
	}

	/**
	 * Find an optimal path inside the room between fromPos and toPos using Jump Point Search algorithm.
	 * @param origin The start position
	 * @param goal The end position
	 * @param options
	 */
	findPath(
		origin: RoomPosition, goal: RoomPosition,
		options: FindPathOptions & { serialize?: boolean } = {},
	) {
		// Delegate to `PathFinder` and convert the result
		const result = PathFinder.roomSearch(origin, [ goal ], options);
		const path: any[] = [];
		let previous = origin;
		for (const pos of result.path) {
			if (pos.roomName !== this.name) {
				break;
			}
			path.push({
				x: pos.x,
				y: pos.y,
				dx: pos.x - previous.x,
				dy: pos.y - previous.y,
				direction: previous.getDirectionTo(pos),
			});
			previous = pos;
		}
		return path;
	}

	/**
	 * Get a Room.Terrain object which provides fast access to static terrain data. This method works
	 * for any room in the world even if you have no access to it.
	 */
	getTerrain() {
		return getTerrainForRoom(this.name)!;
	}

	/**
	 * Create new `ConstructionSite` at the specified location.
	 * @param structureType One of the `STRUCTURE_*` constants.
	 * @param name The name of the structure, for structures that support it (currently only spawns).
	 */
	 createConstructionSite(x: number, y: number, structureType: ConstructibleStructureType, name?: string): number;
	 createConstructionSite(pos: RoomPosition, structureType: ConstructibleStructureType, name?: string): number;
	 createConstructionSite(...args: any[]) {

		// Extract overloaded parameters
		const { xx, yy, rest } = fetchArguments(...args);
		if (args[0] instanceof RoomPosition && args[0].roomName !== this.name) {
			return C.ERR_INVALID_ARGS;
		}
		const pos = new RoomPosition(xx, yy, this.name);
		const [ structureType, name ] = rest;

		// Send it off
		return chainIntentChecks(
			() => checkCreateConstructionSite(this, pos, structureType, name),
			() => gameContext.intents.save(this, 'createConstructionSite', { name, structureType, xx, yy }));
	}
}

//
// Intent checks
export function checkCreateConstructionSite(room: Room, pos: RoomPosition, structureType: ConstructibleStructureType, name?: string) {
	// Check `structureType` is buildable
	if (!(C.CONSTRUCTION_COST[structureType] > 0)) {
		return C.ERR_INVALID_ARGS;
	}

	if (structureType === 'spawn' && typeof name === 'string') {
		// TODO: Check newly created spawns too
		if (Game.spawns[name]) {
			return C.ERR_INVALID_ARGS;
		}
	}

	// Can't build in someone else's room
	if (room.controller) {
		if (!room.controller.my) {
			return C.ERR_RCL_NOT_ENOUGH;
		}
	}

	// Check structure count for this RCL
	const rcl = room.controller?.level ?? 0;
	const existingCount = accumulate(room[Objects], object =>
		(object instanceof ConstructionSite || object instanceof Structure) && object.structureType === structureType ? 1 : 0);
	if (existingCount >= C.CONTROLLER_STRUCTURES[structureType][rcl]) {
		// TODO: Check constructions sites made this tick too
		return C.ERR_RCL_NOT_ENOUGH;
	}

	// No structures on borders
	if (isNearBorder(pos.x, pos.y)) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures next to borders unless it's against a wall, or it's a road/container
	const terrain = room.getTerrain();
	if (structureType !== 'road' && structureType !== 'container' && isNearBorder(pos.x, pos.y)) {
		for (const neighbor of iterateNeighbors(pos)) {
			if (
				isBorder(neighbor.x, neighbor.y) &&
				terrain.get(neighbor.x, neighbor.y) !== C.TERRAIN_MASK_WALL
			) {
				return C.ERR_INVALID_TARGET;
			}
		}
	}

	// No structures on walls except for roads and extractors
	if (
		structureType !== 'extractor' && structureType !== 'road' &&
		terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL
	) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures on top of others
	for (const object of concatInPlace(
		room.find(C.FIND_CONSTRUCTION_SITES),
		room.find(C.FIND_STRUCTURES),
	)) {
		if (
			object.pos.isEqualTo(pos) &&
			(object.structureType === structureType ||
				(structureType !== 'rampart' && structureType !== 'road' &&
				object.structureType !== 'rampart' && object.structureType !== 'road'))
		) {
			return C.ERR_INVALID_TARGET;
		}
	}

	// TODO: Extractors must be built on mineral
	// TODO: Limit total construction sites built

	return C.OK;
}
