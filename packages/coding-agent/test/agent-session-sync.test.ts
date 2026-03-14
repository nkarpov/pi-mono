import { afterEach, describe, expect, it } from "vitest";
import { CURRENT_SESSION_VERSION, type SessionEntry, type SessionHeader } from "../src/core/session-manager.js";
import { assistantMsg, createTestSession, userMsg } from "./utilities.js";

describe("AgentSession external synchronization", () => {
	const cleanups: Array<() => void> = [];
	afterEach(() => {
		while (cleanups.length > 0) {
			cleanups.pop()?.();
		}
	});

	it("replaces session contents and refreshes agent messages", async () => {
		const { session, cleanup } = createTestSession({ inMemory: true });
		cleanups.push(cleanup);

		const header: SessionHeader = {
			type: "session",
			version: CURRENT_SESSION_VERSION,
			id: "synced-session",
			timestamp: "2026-03-14T00:00:00.000Z",
			cwd: "/shared-project",
		};
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "2026-03-14T00:00:01.000Z",
				message: userMsg("hello remote world"),
			},
			{
				type: "message",
				id: "a1",
				parentId: "u1",
				timestamp: "2026-03-14T00:00:02.000Z",
				message: assistantMsg("hello from the mirror"),
			},
		];

		await session.replaceSessionContents(header, entries);

		expect(session.sessionId).toBe("synced-session");
		expect(session.messages).toHaveLength(2);
		expect(session.messages[0].role).toBe("user");
		expect(session.messages[1].role).toBe("assistant");
	});

	it("imports committed entries and refreshes agent context", async () => {
		const { session, cleanup } = createTestSession({ inMemory: true });
		cleanups.push(cleanup);

		await session.replaceSessionContents(
			{
				type: "session",
				version: CURRENT_SESSION_VERSION,
				id: "base-session",
				timestamp: "2026-03-14T00:00:00.000Z",
				cwd: "/shared-project",
			},
			[
				{
					type: "message",
					id: "u1",
					parentId: null,
					timestamp: "2026-03-14T00:00:01.000Z",
					message: userMsg("first turn"),
				},
				{
					type: "message",
					id: "a1",
					parentId: "u1",
					timestamp: "2026-03-14T00:00:02.000Z",
					message: assistantMsg("first answer"),
				},
			],
		);

		const importedIds = await session.importSessionEntries([
			{
				type: "message",
				id: "u2",
				parentId: "a1",
				timestamp: "2026-03-14T00:00:03.000Z",
				message: userMsg("second turn"),
			},
			{
				type: "message",
				id: "a2",
				parentId: "u2",
				timestamp: "2026-03-14T00:00:04.000Z",
				message: assistantMsg("second answer"),
			},
		]);

		expect(importedIds).toEqual(["u2", "a2"]);
		expect(session.messages).toHaveLength(4);
		expect(session.messages[2].role).toBe("user");
		expect(session.messages[3].role).toBe("assistant");

		const duplicateImport = await session.importSessionEntries([
			{
				type: "message",
				id: "a2",
				parentId: "u2",
				timestamp: "2026-03-14T00:00:05.000Z",
				message: assistantMsg("duplicate second answer"),
			},
		]);
		expect(duplicateImport).toEqual([]);
		expect(session.messages).toHaveLength(4);
	});
});
