import path from 'path';
import fs from 'fs';
import notion from '../api/client';
import { ALLOWLIST_MODE, PEOPLE_DB_ID, PEOPLE_USER_PROP } from './config';
import { getAllUsers } from '../api/user-lookup';

export interface Identity { id: string; name: string }

// Build the list of users to process, matching the server's allowlist behavior
export async function loadAllowedUsers(): Promise<Identity[]> {
  // Mode 1: People DB → User property
  if (ALLOWLIST_MODE === 'people_db_has_user' && PEOPLE_DB_ID) {
    const db = await notion.databases();
    let cursor: string | undefined = undefined;
    const users: Identity[] = [];
    do {
      const res: any = await db.query({
        database_id: PEOPLE_DB_ID,
        page_size: 100,
        start_cursor: cursor,
        filter: { property: PEOPLE_USER_PROP, people: { is_not_empty: true } } as any,
      });
      const results: any[] = (res as any).results || [];
      for (const page of results) {
        const props = (page as any).properties || {};
        const ppl = props[PEOPLE_USER_PROP]?.people ?? [];
        const uid: string | undefined = ppl[0]?.id;
        const name: string | undefined = ppl[0]?.name;
        if (uid && name) users.push({ id: uid, name });
      }
      cursor = (res as any).has_more ? (res as any).next_cursor : undefined;
    } while (cursor);
    return users;
  }

  // Mode 2: Legacy env/file-driven UUID list → map to names via users.list
  const includeUuidsRaw = process.env.USERS_INCLUDE_UUIDS; // comma-separated
  const includeFileRaw = process.env.USERS_INCLUDE_FILE; // JSON or CSV path
  const defaultAllowlistPath = path.resolve(process.cwd(), 'src/webhook/allowlists/tech-users.json');
  let uuids: string[] = [];
  try {
    if (includeUuidsRaw) {
      uuids = includeUuidsRaw.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      const candidatePath = includeFileRaw ? path.resolve(process.cwd(), includeFileRaw) : defaultAllowlistPath;
      if (fs.existsSync(candidatePath)) {
        const content = fs.readFileSync(candidatePath, 'utf8');
        if (/\{/.test(content)) {
          const json = JSON.parse(content);
          if (Array.isArray(json.uuids)) uuids = json.uuids as string[];
        } else {
          uuids = content.split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l && !/^name/i.test(l))
            .map(l => l.split(',')[1]?.trim())
            .filter(Boolean) as string[];
        }
      }
    }
  } catch {
    // ignore
  }
  if (uuids.length === 0) return [];
  const all = await getAllUsers(); // Map<name, uuid>
  const reverse = new Map<string, string>(); // uuid->name
  for (const [name, uuid] of all.entries()) reverse.set(uuid, name);
  return uuids.map(id => ({ id, name: reverse.get(id) ?? id }));
}


