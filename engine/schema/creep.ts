import { declare, enumerated, inherit, variant, vector, TypeOf } from 'xxscreeps/schema';
import * as Id from 'xxscreeps/engine/util/schema/id';
import * as C from 'xxscreeps/game/constants';
import { Creep } from 'xxscreeps/game/objects/creep';
import { optionalResourceEnumFormat } from './resource';
import * as RoomObject from './room-object';
import * as Store from './store';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Creep', {
	...inherit(RoomObject.format),
	...variant('creep'),

	body: vector({
		boost: optionalResourceEnumFormat,
		hits: 'uint8',
		type: enumerated(...C.BODYPARTS_ALL),
	}),
	fatigue: 'int16',
	hits: 'int16',
	name: 'string',
	// saying: ...
	store: Store.format,
	_ageTime: 'int32',
	_owner: Id.format,
});

export const format = declare(shape, { overlay: Creep });
