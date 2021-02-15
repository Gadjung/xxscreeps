import { declare, getReader, getWriter, vector, TypeOf } from 'xxscreeps/schema';
import { mapInPlace } from 'xxscreeps/util/utility';

export const format = declare('CodeBranch', {
	modules: declare(vector({
		name: 'string',
		data: 'string',
	}), {
		compose: value => new Map<string, string>(value.map(entry => [ entry.name, entry.data ])),
		decompose: (value: Map<string, string>) => mapInPlace(value.entries(), ([ name, data ]) => ({ name, data })),
	}),
});

export const read = getReader(format);
export const write = getWriter(format);

export type UserCode = TypeOf<typeof format>;
export type ConsoleMessage = { type: 'console'; log?: string; result?: string } | { type: null };
