import type { ConstructionSite } from './construction-site';
import type { Room } from 'xxscreeps/game/room';
import type { RoomObject } from 'xxscreeps/game/object';
import type { RoomPosition } from 'xxscreeps/game/position';

export type ConstructionTraits = {
	obstacle: boolean | undefined;
	checkName?(room: Room, name?: string | null): string | undefined | null;
	checkPlacement(room: Room, pos: RoomPosition): number | null;
	create(constructionSite: ConstructionSite, name?: string): RoomObject;
};

export const structureFactories = new Map<string, ConstructionTraits>();
