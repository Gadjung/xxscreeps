import { gameContext } from '~/game/context';
import { Room, Objects } from '~/game/room';
import * as Movement from './intents/movement';
import { Process, Tick } from './bind';

export class ProcessorContext {
	constructor(
		public time: number,
		public room: Room,
	) {}

	processIntents(user: string, intentsById: Dictionary<Dictionary<object>>) {
		gameContext.userId = user;

		const roomIntents = intentsById[this.room.name];
		if (roomIntents) {
			this.room[Process]!(roomIntents, this);
		}

		for (const object of this.room[Objects]) {
			const intents = intentsById[object.id];
			if (intents !== undefined) {
				object[Process]?.call(object, intents, this);
			}
		}
	}

	processTick() {
		Movement.dispatch(this.room);
		for (const object of this.room[Objects]) {
			object[Tick]?.call(object, this);
		}
	}
}
