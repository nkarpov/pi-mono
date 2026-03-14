import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CURRENT_SESSION_VERSION,
	parseSessionEntries,
	type SessionEntry,
	type SessionHeader,
	SessionManager,
} from "../../src/core/session-manager.js";
import { assistantMsg, userMsg } from "../utilities.js";

describe("SessionManager external synchronization", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-session-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("replaces contents from an external snapshot", () => {
		const session = SessionManager.inMemory("/local-project");
		const header: SessionHeader = {
			type: "session",
			version: CURRENT_SESSION_VERSION,
			id: "external-session",
			timestamp: "2026-03-14T00:00:00.000Z",
			cwd: "/shared-project",
		};
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "2026-03-14T00:00:01.000Z",
				message: userMsg("hello from remote"),
			},
			{
				type: "message",
				id: "a1",
				parentId: "u1",
				timestamp: "2026-03-14T00:00:02.000Z",
				message: assistantMsg("hi from remote"),
			},
		];

		session.replaceContents(header, entries);

		expect(session.getSessionId()).toBe("external-session");
		expect(session.getHeader()?.cwd).toBe("/shared-project");
		expect(session.getLeafId()).toBe("a1");
		expect(session.getEntries().map((entry) => entry.id)).toEqual(["u1", "a1"]);
		expect(session.buildSessionContext().messages).toHaveLength(2);
	});

	it("imports entries incrementally and skips duplicate IDs by default", () => {
		const session = SessionManager.inMemory();
		session.appendMessage(userMsg("local root"));

		const imported = session.importEntries([
			{
				type: "message",
				id: "remote-a",
				parentId: session.getLeafId(),
				timestamp: "2026-03-14T00:00:03.000Z",
				message: assistantMsg("remote assistant"),
			},
		]);
		expect(imported).toEqual(["remote-a"]);

		const importedAgain = session.importEntries([
			{
				type: "message",
				id: "remote-a",
				parentId: session.getLeafId(),
				timestamp: "2026-03-14T00:00:04.000Z",
				message: assistantMsg("duplicate remote assistant"),
			},
		]);
		expect(importedAgain).toEqual([]);
		expect(session.getEntries().filter((entry) => entry.id === "remote-a")).toHaveLength(1);
	});

	it("rewrites persisted session state cleanly after importing user-only history", () => {
		const session = SessionManager.create(tempDir, tempDir);
		const sessionFile = session.getSessionFile();
		expect(sessionFile).toBeTruthy();

		const imported = session.importEntries([
			{
				type: "message",
				id: "remote-user",
				parentId: null,
				timestamp: "2026-03-14T00:00:01.000Z",
				message: userMsg("hello before first assistant"),
			},
		]);
		expect(imported).toEqual(["remote-user"]);
		expect(existsSync(sessionFile!)).toBe(true);

		session.appendMessage(assistantMsg("assistant arrives later"));

		const lines = parseSessionEntries(readFileSync(sessionFile!, "utf-8"));
		expect(lines).toHaveLength(3);
		expect(lines[0].type).toBe("session");
		expect(lines[1].type).toBe("message");
		expect(lines[2].type).toBe("message");
	});
});
