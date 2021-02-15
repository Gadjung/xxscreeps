import { RoomObject } from 'xxscreeps/game/objects/room-object';
import { ConstructionSite } from 'xxscreeps/game/objects/construction-site';
import { Creep } from 'xxscreeps/game/objects/creep';
import { Resource } from 'xxscreeps/game/objects/resource';
import { Source } from 'xxscreeps/game/objects/source';
import { Structure } from 'xxscreeps/game/objects/structures';
import { StructureContainer } from 'xxscreeps/game/objects/structures/container';
import { StructureController } from 'xxscreeps/game/objects/structures/controller';
import { StructureExtension } from 'xxscreeps/game/objects/structures/extension';
import { StructureRoad } from 'xxscreeps/game/objects/structures/road';
import { StructureSpawn } from 'xxscreeps/game/objects/structures/spawn';
import { StructureStorage } from 'xxscreeps/game/objects/structures/storage';
import { StructureTower } from 'xxscreeps/game/objects/structures/tower';
import { Store } from 'xxscreeps/game/store';
import { Variant } from 'xxscreeps/schema';

export const Render: unique symbol = Symbol('render');
function bindRenderer<Type>(impl: { prototype: Type }, renderer: (this: Type) => object) {
	(impl.prototype as any)[Render] = renderer;
}

function renderObject(object: RoomObject) {
	return {
		_id: object.id,
		type: object[Variant],
		x: object.pos.x,
		y: object.pos.y,
	};
}

function renderStructure(structure: Structure) {
	return {
		...renderObject(structure),
		structureType: structure.structureType,
		hits: structure.hits,
		hitsMax: 100, //structure.hitsMax,
		user: structure._owner,
	};
}

function renderStore(store: Store) {
	const result: any = {
		store: { ...store },
		storeCapacity: store.getCapacity(),
	};
	if (store._restricted) {
		if (store._capacityByResource) {
			const capacityByResource: any = {};
			for (const [ resourceType, value ] of store._capacityByResource.entries()) {
				capacityByResource[resourceType] = value;
			}
			result.storeCapacityResource = capacityByResource;
		} else {
			result.storeCapacityResource = { [store._singleResource!]: store._capacity };
		}
	}
	return result;
}

bindRenderer(ConstructionSite, function render() {
	return {
		...renderObject(this),
		progress: this.progress,
		progressTotal: this.progressTotal,
		structureType: this.structureType,
		user: this._owner,
	};
});

bindRenderer(Creep, function render() {
	return {
		...renderObject(this),
		...renderStore(this.store),
		name: this.name,
		body: this.body,
		hits: this.hits,
		hitsMax: 100,
		spawning: this.spawning,
		fatigue: this.fatigue,
		ageTime: this._ageTime,
		user: this._owner,
		actionLog: {
			attacked: null,
			healed: null,
			attack: null,
			rangedAttack: null,
			rangedMassAttack: null,
			rangedHeal: null,
			harvest: null,
			heal: null,
			repair: null,
			build: null,
			say: null,
			upgradeController: null,
			reserveController: null,
		},
	};
});

bindRenderer(Resource, function render() {
	return {
		...renderObject(this),
		type: 'energy',
		resourceType: this.resourceType,
		[this.resourceType]: this.amount,
	};
});

bindRenderer(Source, function render() {
	return {
		...renderObject(this),
		energy: this.energy,
		energyCapacity: this.energyCapacity,
		nextRegenerationTime: this._nextRegenerationTime,
	};
});

bindRenderer(Structure, function render() {
	return {
		...renderStructure(this),
	};
});

bindRenderer(StructureContainer, function render() {
	return {
		...renderStructure(this),
		...renderStore(this.store),
		nextDecayTime: this._nextDecayTime,
	};
});

bindRenderer(StructureController, function render() {
	return {
		...renderStructure(this),
		level: this.level,
		progress: this.progress,
		downgradeTime: this._downgradeTime,
		safeMode: 0,
	};
});

bindRenderer(StructureExtension, function render() {
	return {
		...renderStructure(this),
		...renderStore(this.store),
	};
});

bindRenderer(StructureRoad, function render() {
	return {
		...renderStructure(this),
		nextDecayTime: this._nextDecayTime,
	};
});

bindRenderer(StructureSpawn, function render() {
	return {
		...renderStructure(this),
		...renderStore(this.store),
		name: this.name,
	};
});

bindRenderer(StructureStorage, function render() {
	return {
		...renderStructure(this),
		...renderStore(this.store),
	};
});

bindRenderer(StructureTower, function render() {
	return {
		...renderStructure(this),
		...renderStore(this.store),
	};
});
