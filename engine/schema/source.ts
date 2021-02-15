import { declare, inherit, variant, TypeOf } from 'xxscreeps/schema';
import { Source } from 'xxscreeps/game/objects/source';
import * as RoomObject from './room-object';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Source', {
	...inherit(RoomObject.format),
	...variant('source'),
	energy: 'int32',
	energyCapacity: 'int32',
	_nextRegenerationTime: 'int32',
});

export const format = declare(shape, { overlay: Source });
