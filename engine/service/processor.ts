import assert from 'assert';
import * as Room from '~/engine/schema/room';
import { mapInPlace } from '~/lib/utility';
import { ProcessorContext } from '~/engine/processor/context';
import { bindAllProcessorIntents } from '~/engine/processor/intents';
import { Game } from '~/game/game';
import { loadTerrain } from '~/game/map';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { ProcessorMessage, ProcessorQueueElement } from '.';

export default async function() {
	// Bind all the processor intent methods to game objec prototpyes.
	// For example Creep.prototype[Process] = () => ...
	bindAllProcessorIntents();

	// Keep track of rooms this thread ran. Global room processing must also happen here.
	const processedRooms = new Map<string, ProcessorContext>();

	// Connect to main & storage
	const blobStorage = await BlobStorage.connect();
	const roomsQueue = await Queue.connect<ProcessorQueueElement>('processRooms');
	const processorChannel = await Channel.connect<ProcessorMessage>('processor');

	// Initialize world terrain
	await loadTerrain(blobStorage);

	// Start the processing loop
	let gameTime = -1;
	processorChannel.publish({ type: 'processorConnected' });
	try {
		for await (const message of processorChannel) {

			if (message.type === 'shutdown') {
				break;

			} else if (message.type === 'processRooms') {
				// First processing phase. Can start as soon as all players with visibility into this room
				// have run their code
				gameTime = message.time;
				roomsQueue.version(gameTime);
				for await (const { room, users } of roomsQueue) {
					// Read room data and intents from storage
					const [ roomBlob, intents ] = await Promise.all([
						await blobStorage.load(`room/${room}`),
						Promise.all(mapInPlace(users, async user => ({
							user,
							intents: await blobStorage.load(`intents/${room}/${user}`),
						}))),
					]);
					const deleteIntentBlobs = Promise.all(mapInPlace(intents, ({ user }) =>
						blobStorage.delete(`intents/${room}/${user}`)));
					// Process the room
					const roomInstance = Room.read(roomBlob);
					(global as any).Game = new Game(gameTime, [ roomInstance ]);
					const context = new ProcessorContext(gameTime, roomInstance);
					for (const intentInfo of intents) {
						assert.equal(intentInfo.intents.byteOffset, 0);
						const uint16 = new Uint16Array(intentInfo.intents.buffer);
						const intents = JSON.parse(String.fromCharCode(...uint16));
						context.processIntents(intentInfo.user, intents);
					}
					context.processTick();
					// Save and notify main service of completion
					await deleteIntentBlobs;
					processedRooms.set(room, context);
					processorChannel.publish({ type: 'processedRoom', roomName: room });
				}

			} else if (message.type === 'flushRooms') {
				// Run second phase of processing. This must wait until *all* player code and first phase
				// processing has run
				await Promise.all(mapInPlace(processedRooms, ([ roomName, context ]) =>
					blobStorage.save(`room/${roomName}`, Room.write(context.room)),
				));
				processorChannel.publish({ type: 'flushedRooms', roomNames: [ ...processedRooms.keys() ] });
				processedRooms.clear();
			}
		}

	} finally {
		blobStorage.disconnect();
		processorChannel.disconnect();
		roomsQueue.disconnect();
	}
}
